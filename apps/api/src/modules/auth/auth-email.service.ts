import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, OnModuleDestroy, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt, randomUUID, createHmac } from 'crypto';
import nodemailer, { Transporter } from 'nodemailer';
import { RedisService } from '../../infra/redis/redis.service';

export type EmailChallengePurpose = 'registration' | 'login' | 'password-reset' | 'password-change' | 'email-claim';
type StoredChallenge = { purpose: EmailChallengePurpose; subject: string; userId?: string; digest: string; attempts: number };
const PURPOSE_LABEL: Record<EmailChallengePurpose, string> = {
  registration: '注册邮箱验证',
  login: '登录验证',
  'password-reset': '重置密码',
  'password-change': '修改密码',
  'email-claim': '验证旧账号邮箱',
};

@Injectable()
export class AuthEmailService implements OnModuleDestroy {
  private readonly logger = new Logger(AuthEmailService.name);
  private transporter?: Transporter;

  constructor(private readonly redis: RedisService, private readonly config: ConfigService) {}

  onModuleDestroy() { this.transporter?.close(); }

  normalizeEmail(value: unknown): string {
    if (typeof value !== 'string') throw new BadRequestException('请输入有效邮箱地址。');
    const email = value.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('请输入有效邮箱地址。');
    }
    return email;
  }

  private secret(): string {
    const secret = this.config.get<string>('auth.emailOtpSecret');
    if (typeof secret !== 'string' || secret.length < 32) {
      throw new ServiceUnavailableException('邮箱验证尚未配置，请联系部署管理员。');
    }
    return secret;
  }

  private mac(value: string): string {
    return createHmac('sha256', this.secret()).update(value).digest('hex');
  }

  emailSubject(purpose: EmailChallengePurpose, emailInput: string): string {
    return this.mac(`${purpose}:email:${this.normalizeEmail(emailInput)}`);
  }

  private transport(): Transporter {
    const host = this.config.get<string>('auth.emailSmtpHost');
    const port = this.config.get<number>('auth.emailSmtpPort');
    const from = this.config.get<string>('auth.emailFrom');
    if (!host || !port || !from) throw new ServiceUnavailableException('邮箱验证尚未配置，请联系部署管理员。');
    if (!this.transporter) {
      const user = this.config.get<string>('auth.emailSmtpUser');
      const pass = this.config.get<string>('auth.emailSmtpPassword');
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: this.config.get<boolean>('auth.emailSmtpSecure') === true,
        requireTLS: this.config.get<boolean>('auth.emailSmtpSecure') !== true,
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 10000,
        auth: user && pass ? { user, pass } : undefined,
      });
    }
    return this.transporter;
  }

  async issue(purpose: EmailChallengePurpose, emailInput: string, userId?: string): Promise<{ challengeId: string }> {
    const email = this.normalizeEmail(emailInput);
    const subject = this.mac(`${purpose}:email:${email}`);
    const rateKey = `auth:email-rate:${this.mac(`rate:${purpose}:${email}`)}`;
    const now = new Date();
    const utcDay = now.toISOString().slice(0, 10);
    const dailyKey = `auth:email-daily:${this.mac(`daily:${email}:${utcDay}`)}`;
    const dailyTtlSeconds = Math.max(1, Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()) / 1000));
    const accepted = await this.redis.getClient().eval(`
      if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
      local count = tonumber(redis.call('GET', KEYS[2]) or '0')
      if count >= tonumber(ARGV[1]) then return -1 end
      redis.call('SET', KEYS[1], '1', 'EX', tonumber(ARGV[2]))
      count = redis.call('INCR', KEYS[2])
      if count == 1 then redis.call('EXPIRE', KEYS[2], tonumber(ARGV[3])) end
      return 1
    `, 2, rateKey, dailyKey, '8', '60', String(dailyTtlSeconds));
    if (accepted !== 1) throw new HttpException('验证码请求过于频繁，请稍后再试。', HttpStatus.TOO_MANY_REQUESTS);

    const challengeId = randomUUID();
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const value: StoredChallenge = {
      purpose,
      subject,
      ...(userId ? { userId } : {}),
      digest: this.mac(`${purpose}:${challengeId}:${subject}:${code}`),
      attempts: 0,
    };
    const key = `auth:email-challenge:${challengeId}`;
    await this.redis.getClient().set(key, JSON.stringify(value), 'EX', 600);
    try {
      const from = this.config.get<string>('auth.emailFrom')!;
      await this.transport().sendMail({
        from,
        to: email,
        subject: `Interview Agent ${PURPOSE_LABEL[purpose]}验证码`,
        headers: {
          'X-Auth-Challenge-Id': challengeId,
          'X-Auth-Purpose': purpose,
        },
        text: `你正在进行${PURPOSE_LABEL[purpose]}，验证码是 ${code}，10 分钟内有效且只能使用一次。若非本人操作，请忽略本邮件。`,
      });
    } catch {
      await this.redis.getClient().del(key).catch(() => undefined);
      this.logger.warn('Authentication email delivery failed.');
      throw new ServiceUnavailableException('验证码邮件暂未发送成功，请稍后重试。');
    }
    return { challengeId };
  }

  async consume(challengeId: string, purpose: EmailChallengePurpose, code: string, expectedUserId?: string, expectedEmail?: string): Promise<{ userId?: string; subject: string }> {
    if (!/^[0-9a-f-]{36}$/i.test(challengeId || '') || !/^\d{6}$/.test(code || '')) {
      throw new UnauthorizedException('验证码无效或已过期。');
    }
    const key = `auth:email-challenge:${challengeId}`;
    const raw = await this.redis.getClient().get(key);
    if (!raw) throw new UnauthorizedException('验证码无效或已过期。');
    let challenge: StoredChallenge;
    try { challenge = JSON.parse(raw) as StoredChallenge; } catch { throw new UnauthorizedException('验证码无效或已过期。'); }
    if (challenge.purpose !== purpose || (expectedUserId && challenge.userId !== expectedUserId)) {
      throw new UnauthorizedException('验证码无效或已过期。');
    }
    const expectedSubject = expectedEmail ? this.emailSubject(purpose, expectedEmail) : challenge.subject;
    if (expectedSubject !== challenge.subject) throw new UnauthorizedException('验证码无效或已过期。');
    const suppliedDigest = this.mac(`${purpose}:${challengeId}:${challenge.subject}:${code}`);
    const result = await this.redis.getClient().eval(`
      local raw = redis.call('GET', KEYS[1])
      if not raw then return {0, ''} end
      local value = cjson.decode(raw)
      if value.purpose ~= ARGV[1] or (ARGV[2] ~= '' and value.userId ~= ARGV[2]) then return {0, ''} end
      if tonumber(value.attempts or 0) >= 5 then redis.call('DEL', KEYS[1]); return {0, ''} end
      if value.digest ~= ARGV[3] then
        value.attempts = tonumber(value.attempts or 0) + 1
        if value.attempts >= 5 then redis.call('DEL', KEYS[1]) else redis.call('SET', KEYS[1], cjson.encode(value), 'KEEPTTL') end
        return {0, ''}
      end
      redis.call('DEL', KEYS[1])
      return {1, cjson.encode(value)}
    `, 1, key, purpose, expectedUserId || '', suppliedDigest);
    const values = result as unknown as [number, string];
    if (!Array.isArray(values) || Number(values[0]) !== 1 || typeof values[1] !== 'string') {
      throw new UnauthorizedException('验证码无效或已过期。');
    }
    const record = JSON.parse(values[1]) as StoredChallenge;
    return { userId: record.userId, subject: record.subject };
  }
}
