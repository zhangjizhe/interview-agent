import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { RedisService } from '../../infra/redis/redis.service';

type Session = { userId: string; version: string; sid: string };
type Identity = { id: string; email: string; role: string; name: string | null };
const REFRESH_TTL = 7 * 24 * 60 * 60;

@Injectable()
export class AuthSessionService {
  constructor(private readonly redis: RedisService, private readonly jwt: JwtService, private readonly config: ConfigService) {}

  private hash(token: string) { return createHash('sha256').update(token).digest('hex'); }
  private versionKey(userId: string) { return `auth:version:${userId}`; }
  private changingKey(userId: string) { return `auth:password-changing:${userId}`; }
  private revokedKey(sid: string) { return `auth:session-revoked:${sid}`; }
  private async available<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new ServiceUnavailableException('认证服务暂时不可用，请稍后重试。');
    }
  }

  async version(userId: string): Promise<string> {
    return this.available(async () => (await this.redis.getClient().get(this.versionKey(userId))) || '0');
  }

  async issue(user: Identity, version: string, sid: string = randomUUID()) {
    const refreshToken = randomBytes(32).toString('hex');
    const session: Session = { userId: user.id, version, sid };
    const expiresIn = this.config.get<string>('auth.jwtExpiresIn') || '30m';
    const accessToken = await this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role, jti: randomUUID(), sid, version }, {
      algorithm: 'HS256', expiresIn: expiresIn as `${number}${'d' | 'h' | 'm' | 's'}`,
    });
    // 版本检查与白名单写入必须原子化，防止改密码/logout 与登录/刷新竞争。
    const created = await this.available(() => this.redis.getClient().eval(`
      if (redis.call('GET', KEYS[1]) or '0') ~= ARGV[1] or redis.call('EXISTS', KEYS[2]) == 1 or redis.call('EXISTS', KEYS[3]) == 1 then return 0 end
      redis.call('SET', ARGV[2], ARGV[3], 'EX', ARGV[4])
      return 1
    `, 3, this.versionKey(user.id), this.revokedKey(sid), this.changingKey(user.id), version, `auth:refresh:${this.hash(refreshToken)}`, JSON.stringify(session), String(REFRESH_TTL)));
    if (created !== 1) throw new UnauthorizedException('会话已失效，请重新登录。');
    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn, refreshExpiresIn: REFRESH_TTL, userId: user.id, email: user.email, name: user.name, role: user.role };
  }

  async consumeRefresh(token: string): Promise<Session> {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new UnauthorizedException('刷新凭据无效。');
    // Lua GET+DEL 兼容现有 Redis 版本；并发刷新最多一次成功。
    const raw = await this.available(() => this.redis.getClient().eval("local value = redis.call('GET', KEYS[1]); redis.call('DEL', KEYS[1]); return value", 1, `auth:refresh:${this.hash(token)}`));
    if (typeof raw !== 'string') throw new UnauthorizedException('刷新凭据无效或已使用。');
    const session = JSON.parse(raw) as Session;
    await this.assertActive({ sub: session.userId, version: session.version, sid: session.sid }, '');
    return session;
  }

  async assertActive(payload: Record<string, any>, rawToken: string): Promise<void> {
    if (typeof payload.sub !== 'string' || !payload.sub) throw new UnauthorizedException('无效会话。');
    await this.available(async () => {
      const client = this.redis.getClient();
      const [version, revoked, blacklisted, changing] = await Promise.all([
        client.get(this.versionKey(payload.sub)),
        payload.sid ? client.get(this.revokedKey(payload.sid)) : Promise.resolve(null),
        client.get(`auth:blacklist:${payload.jti || this.hash(rawToken)}`),
        client.get(this.changingKey(payload.sub)),
      ]);
      // 旧 token 没有版本/jti，默认版本 0，除显式改密码或 logout 外允许自然过期。
      if ((version || '0') !== (payload.version || '0') || revoked || blacklisted || changing) throw new UnauthorizedException('会话已失效，请重新登录。');
    });
  }

  async logout(payload: Record<string, any>, rawToken: string): Promise<void> {
    await this.available(async () => {
      const remaining = Math.max(1, Math.ceil(payload.exp - Date.now() / 1000));
      const blacklist = `auth:blacklist:${payload.jti || this.hash(rawToken)}`;
      // Access and refresh-family revocation must become visible atomically.
      await this.redis.getClient().eval(`-- revoke-session
        redis.call('SET', KEYS[1], '1', 'EX', ARGV[1])
        if ARGV[3] == '1' then redis.call('SET', KEYS[2], '1', 'EX', ARGV[2]) end
        return 1
      `, 2, blacklist, payload.sid ? this.revokedKey(payload.sid) : blacklist,
      String(remaining), String(Math.max(REFRESH_TTL, remaining)), payload.sid ? '1' : '0');
    });
  }

  async changePassword<T>(userId: string, update: () => Promise<T>): Promise<T> {
    const acquired = await this.available(() => this.redis.getClient().set(this.changingKey(userId), '1', 'NX'));
    if (!acquired) throw new ServiceUnavailableException('密码变更尚未完成，请稍后重试。');
    try {
      return await update();
    } finally {
      // 锁没有 TTL：进程或 Redis 故障时保持拒绝，运维确认数据库结果后才能解除。
      await this.available(() => this.redis.getClient().eval("redis.call('INCR', KEYS[1]); redis.call('DEL', KEYS[2]); return 1", 2, this.versionKey(userId), this.changingKey(userId)));
    }
  }

  async revokeUser(userId: string): Promise<void> {
    await this.available(async () => { await this.redis.getClient().incr(this.versionKey(userId)); });
  }
}
