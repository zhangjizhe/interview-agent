import { AuthSessionService } from './auth-session.service';
import { Injectable, BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { AuthEmailService } from './auth-email.service';

const scrypt = promisify(scryptCallback);

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  refreshExpiresIn: number;
  tokenType: string;
  expiresIn: string;
  userId: string;
  email: string;
  name: string | null;
  role: string;
}

export type LoginStartResult = LoginResult
  | { requiresEmailVerification: true; challengeId: string; maskedEmail: string }
  | { requiresEmailClaim: true; userId: string };

export interface RegisterResult {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  created: boolean;
}

export interface CheckResult {
  userId: string;
  available: boolean;
  reason?: string;
}

export interface LoginDto {
  userId: string;
  password: string;
}

/**
 * R-AUTH-1 严格 userId 校验：
 * - 3-32 字符
 * - 必须以小写字母或数字开头
 * - 后续字符允许小写字母、数字、-、_
 * - 全部小写（防止 "Admin" vs "admin" 这种大小写歧义）
 *
 * 不允许：纯大写、特殊字符（@#$%^&*）、中文、emoji、纯数字开头以外的特殊前缀
 */
export const SAFE_USERID_REGEX = /^[a-z0-9][a-z0-9_-]{2,31}$/;

/**
 * R-AUTH-1 系统保留名黑名单（防冒名顶替 + 防止占位）
 *
 * 原则：保留所有可能与系统/路径/角色冲突的 ID
 * - admin/api/system 等管理员路径
 * - root/null/undefined/true/false 等程序关键字
 * - demo/test/guest/anonymous 等公开测试占位
 * - support/staff/mod 等客服/管理角色名
 *
 * 注意：保留名是大小写不敏感的（先 toLowerCase 再比较）
 */
export const RESERVED_USER_IDS = new Set([
  // 系统路径
  'admin', 'api', 'system', 'root', 'superuser', 'sys',
  // 程序关键字
  'null', 'undefined', 'true', 'false', 'none', 'nil', 'nan',
  // 公开占位
  'demo', 'test', 'guest', 'anonymous', 'public', 'default',
  // 角色
  'support', 'staff', 'mod', 'moderator', 'operator', 'service',
  // 平台名（防止冒名）
  'mavis', 'interview-agent', 'interview', 'agent',
  // 其他
  'me', 'self', 'login', 'logout', 'register', 'signup', 'auth',
]);

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
    private prisma: PrismaService,
    private sessions: AuthSessionService,
    private readonly emailVerification: AuthEmailService,
  ) {}

  /**
   * R-AUTH-1 校验 userId 格式 + 保留名检查。
   * 抛 BadRequestException 含详细原因（前端展示）。
   */
  validateUserId(userId: string): void {
    if (!userId || typeof userId !== 'string') {
      throw new BadRequestException('userId 不能为空');
    }
    if (!SAFE_USERID_REGEX.test(userId)) {
      throw new BadRequestException(
        'userId 必须 3-32 字符，小写字母/数字开头，后续字符允许小写字母/数字/-/_'
      );
    }
    if (RESERVED_USER_IDS.has(userId.toLowerCase())) {
      throw new BadRequestException(`"${userId}" 是系统保留名，请换一个`);
    }
  }

  private validatePassword(password: string): void {
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
      throw new BadRequestException('密码必须为 12-128 个字符');
    }
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derived = await scrypt(password, salt, 64) as Buffer;
    return `${salt}:${derived.toString('hex')}`;
  }

  private async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const [salt, expectedHex] = storedHash.split(':');
    if (!salt || !expectedHex) return false;
    const actual = await scrypt(password, salt, 64) as Buffer;
    const expected = Buffer.from(expectedHex, 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  /**
   * R-AUTH-1 注册新 ID：检查格式 + 保留名 + 是否已占用 → 创建 User
   *
   * 与 /login 区别：
   * - /login 只接受已注册且密码匹配的用户
   * - /register 严格拒绝已存在 ID（返回 409）— 适合"创建新身份"流程
   */
  async requestRegistrationCode(email: string): Promise<{ challengeId: string }> {
    const normalizedEmail = this.emailVerification.normalizeEmail(email);
    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
      select: { id: true },
    });
    // Keep the public response shape identical without sending mail to an
    // already-owned address. Registration will still fail after code entry.
    if (existing) return { challengeId: randomUUID() };
    return this.emailVerification.issue('registration', normalizedEmail);
  }

  async register(userId: string, password: string, emailInput: string, challengeId: string, code: string): Promise<RegisterResult> {
    this.validateUserId(userId);
    this.validatePassword(password);

    const lowerUserId = userId.toLowerCase();
    const finalEmail = this.emailVerification.normalizeEmail(emailInput);
    const isBootstrapAdmin = (this.config.get<string[]>('auth.adminUserIds') || [])
      .includes(lowerUserId);

    const existing = await this.prisma.user.findUnique({ where: { id: lowerUserId } });
    if (existing) {
      throw new ConflictException(`ID "${userId}" 已被占用`);
    }
    await this.emailVerification.consume(challengeId, 'registration', code, undefined, finalEmail);
    const emailOwner = await this.prisma.user.findFirst({ where: { email: { equals: finalEmail, mode: 'insensitive' } } });
    if (emailOwner) throw new ConflictException('该邮箱已绑定账号。');

    const user = await this.prisma.user.create({
      data: {
        id: lowerUserId,
        email: finalEmail,
        emailVerifiedAt: new Date(),
        name: userId,  // 默认 name = userId（前端可改）
        passwordHash: await this.hashPassword(password),
        role: isBootstrapAdmin ? 'ADMIN' : 'USER',
        organization: { create: { name: `${lowerUserId} 的组织` } },
      },
    });

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      created: true,
    };
  }

  /**
   * R-AUTH-1 检查 ID 可用性（前端实时校验）
   * - 格式校验失败 → {available: false, reason}
   * - 保留名 → {available: false, reason}
   * - 已存在 → {available: false, reason}
   * - 可用 → {available: true}
   */
  async checkAvailability(userId: string): Promise<CheckResult> {
    try {
      this.validateUserId(userId);
    } catch (e) {
      const msg = e instanceof BadRequestException ? e.message : '格式不合法';
      // 不抛 400，返回结构化结果（前端用 reason 显示）
      return { userId, available: false, reason: msg };
    }
    const lowerUserId = userId.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { id: lowerUserId } });
    if (existing) {
      return { userId, available: false, reason: '该 ID 已被占用' };
    }
    return { userId, available: true };
  }

  /**
   * 校验已注册用户密码后签发短期 access 与一次性 refresh token。
   */
  async login(dto: LoginDto): Promise<LoginStartResult> {
    this.validateUserId(dto.userId);
    this.validatePassword(dto.password);

    const lowerUserId = dto.userId.toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { id: lowerUserId },
    });
    if (!user?.passwordHash || !(await this.verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    if (!user.emailVerifiedAt) return { requiresEmailClaim: true, userId: user.id };
    const { challengeId } = await this.emailVerification.issue('login', user.email, user.id);
    return { requiresEmailVerification: true, challengeId, maskedEmail: this.maskEmail(user.email) };
  }

  private maskEmail(email: string): string {
    const [name, domain] = email.split('@');
    if (!name || !domain) return '已绑定邮箱';
    return `${name.slice(0, 1)}***@${domain}`;
  }

  async verifyLogin(challengeId: string, code: string): Promise<LoginResult> {
    const challenge = await this.emailVerification.consume(challengeId, 'login', code);
    if (!challenge.userId) throw new UnauthorizedException('验证码无效或已过期。');
    const user = await this.prisma.user.findUnique({ where: { id: challenge.userId } });
    if (!user?.emailVerifiedAt) throw new UnauthorizedException('验证码无效或已过期。');
    const currentSubject = this.emailVerification.emailSubject('login', user.email);
    if (currentSubject !== challenge.subject) throw new UnauthorizedException('验证码无效或已过期。');
    const version = await this.sessions.version(user.id);
    return this.sessions.issue(user, version);
  }

  async requestLegacyEmailClaim(userIdInput: string, password: string, emailInput: string) {
    this.validateUserId(userIdInput);
    this.validatePassword(password);
    const userId = userIdInput.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash || !(await this.verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException('用户名或密码错误。');
    }
    if (user.emailVerifiedAt) throw new ConflictException('账号邮箱已验证，请返回登录。');
    const email = this.emailVerification.normalizeEmail(emailInput);
    const { challengeId } = await this.emailVerification.issue('email-claim', email, userId);
    return { challengeId, maskedEmail: this.maskEmail(email) };
  }

  async verifyLegacyEmailClaim(userIdInput: string, emailInput: string, challengeId: string, code: string): Promise<LoginResult> {
    const userId = userIdInput.toLowerCase();
    const email = this.emailVerification.normalizeEmail(emailInput);
    const challenge = await this.emailVerification.consume(challengeId, 'email-claim', code, userId, email);
    if (challenge.subject !== this.emailVerification.emailSubject('email-claim', email)) {
      throw new UnauthorizedException('验证码无效或已过期。');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash || user.emailVerifiedAt) throw new ConflictException('账号状态已变化，请重新登录。');
    const owner = await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    if (owner && owner.id !== userId) throw new ConflictException('该邮箱已绑定其他账号。');
    await this.sessions.changePassword(userId, async () => {
      const update = await this.prisma.user.updateMany({
        where: { id: userId, email: user.email, emailVerifiedAt: null, passwordHash: user.passwordHash },
        data: { email, emailVerifiedAt: new Date() },
      });
      if (update.count !== 1) throw new ConflictException('账号状态已变化，请重新登录。');
    });
    const version = await this.sessions.version(userId);
    return this.sessions.issue({ ...user, email }, version);
  }

  async requestPasswordReset(userIdInput: string) {
    const challengeId = randomUUID();
    const userId = typeof userIdInput === 'string' ? userIdInput.toLowerCase() : '';
    if (/^[a-z0-9][a-z0-9_-]{2,31}$/.test(userId)) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user?.emailVerifiedAt) {
        try {
          const challenge = await this.emailVerification.issue('password-reset', user.email, user.id);
          return { accepted: true, challengeId: challenge.challengeId };
        } catch {
          // Keep account existence and delivery configuration out of the public response.
        }
      }
    }
    return { accepted: true, challengeId };
  }

  async resetPassword(userIdInput: string, challengeId: string, code: string, newPassword: string) {
    this.validateUserId(userIdInput);
    this.validatePassword(newPassword);
    const userId = userIdInput.toLowerCase();
    const challenge = await this.emailVerification.consume(challengeId, 'password-reset', code, userId);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.emailVerifiedAt || !user.passwordHash) throw new UnauthorizedException('验证码无效或已过期。');
    if (challenge.subject !== this.emailVerification.emailSubject('password-reset', user.email)) {
      throw new UnauthorizedException('验证码无效或已过期。');
    }
    const passwordHash = await this.hashPassword(newPassword);
    await this.sessions.changePassword(userId, async () => {
      const updated = await this.prisma.user.updateMany({ where: { id: userId, email: user.email, emailVerifiedAt: user.emailVerifiedAt, passwordHash: user.passwordHash }, data: { passwordHash } });
      if (updated.count !== 1) throw new ConflictException('账号状态已变化，请重新发起找回。');
    });
    return { success: true, mustLoginAgain: true };
  }

  async requestPasswordChange(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.emailVerifiedAt) throw new ConflictException('请先完成邮箱验证。');
    const challenge = await this.emailVerification.issue('password-change', user.email, user.id);
    return { challengeId: challenge.challengeId, maskedEmail: this.maskEmail(user.email) };
  }

  async refresh(refreshToken: string): Promise<LoginResult> {
    const session = await this.sessions.consumeRefresh(refreshToken);
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user?.emailVerifiedAt) throw new UnauthorizedException('邮箱尚未验证，请重新登录并完成验证。');
    return this.sessions.issue(user, session.version, session.sid);
  }

  async logout(payload: Record<string, any>, rawToken: string) {
    await this.sessions.logout(payload, rawToken);
    return { success: true };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string, challengeId: string, code: string) {
    this.validatePassword(currentPassword);
    this.validatePassword(newPassword);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash || !(await this.verifyPassword(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('当前密码错误。');
    }
    const challenge = await this.emailVerification.consume(challengeId, 'password-change', code, userId);
    if (!user.emailVerifiedAt || challenge.subject !== this.emailVerification.emailSubject('password-change', user.email)) {
      throw new UnauthorizedException('验证码无效或已过期。');
    }
    const passwordHash = await this.hashPassword(newPassword);
    // 修改期间阻止签发/消费会话；完成后递增用户版本，使全部设备立即下线。
    await this.sessions.changePassword(userId, async () => {
      const result = await this.prisma.user.updateMany({ where: { id: userId, email: user.email, emailVerifiedAt: user.emailVerifiedAt, passwordHash: user.passwordHash }, data: { passwordHash } });
      if (result.count !== 1) throw new ConflictException('密码已变更，请重新登录。');
    });
    return { success: true };
  }

  /**
   * 验证 token 并返回 payload
   * 锁定 algorithm: ['HS256'] 防止 verify 阶段被攻击者用 alg=none 绕过
   */
  async verifyToken(token: string) {
    return this.jwtService.verifyAsync(token, {
      secret: this.config.get<string>('auth.jwtSecret'),
      algorithms: ['HS256'],
    });
  }
}
