import { AuthSessionService } from './auth-session.service';
import { Injectable, BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

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
  async register(userId: string, password: string): Promise<RegisterResult> {
    this.validateUserId(userId);
    this.validatePassword(password);

    const lowerUserId = userId.toLowerCase();
    const finalEmail = `${lowerUserId}@local`;
    const isBootstrapAdmin = (this.config.get<string[]>('auth.adminUserIds') || [])
      .includes(lowerUserId);

    const existing = await this.prisma.user.findUnique({ where: { id: lowerUserId } });
    if (existing) {
      throw new ConflictException(`ID "${userId}" 已被占用`);
    }

    const user = await this.prisma.user.create({
      data: {
        id: lowerUserId,
        email: finalEmail,
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
  async login(dto: LoginDto): Promise<LoginResult> {
    this.validateUserId(dto.userId);
    this.validatePassword(dto.password);

    const lowerUserId = dto.userId.toLowerCase();
    const version = await this.sessions.version(lowerUserId);
    const user = await this.prisma.user.findUnique({
      where: { id: lowerUserId },
    });
    if (!user?.passwordHash || !(await this.verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    return this.sessions.issue(user, version);
  }

  async refresh(refreshToken: string): Promise<LoginResult> {
    const session = await this.sessions.consumeRefresh(refreshToken);
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) throw new UnauthorizedException('用户不存在。');
    return this.sessions.issue(user, session.version, session.sid);
  }

  async logout(payload: Record<string, any>, rawToken: string) {
    await this.sessions.logout(payload, rawToken);
    return { success: true };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    this.validatePassword(currentPassword);
    this.validatePassword(newPassword);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash || !(await this.verifyPassword(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('当前密码错误。');
    }
    const passwordHash = await this.hashPassword(newPassword);
    // 修改期间阻止签发/消费会话；完成后递增用户版本，使全部设备立即下线。
    await this.sessions.changePassword(userId, async () => {
      const result = await this.prisma.user.updateMany({ where: { id: userId, passwordHash: user.passwordHash }, data: { passwordHash } });
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
