/**
 * Auth Service
 *
 * P0-5 修复（最小可行版，demo 阶段保留）：
 * - demo 简化：userId 传进来即登录（不做密码 hash，商用前必须替换为密码/OAuth）
 * - 加 userId 格式校验：拒绝空 / 超长 / 非 cuid 格式，防止任意字符串构造 JWT
 * - 锁定 JWT 算法为 HS256：防 algorithm confusion attack（攻击者把 alg 改成 none
 *   或换成 RS256 让 server 用公钥验证）
 *
 * R-AUTH-1 登录页面化（2026-06-28）：
 * - 新增 /register endpoint：创建/复用 user by id（已存在 → 报错，由前端展示"该 ID 已被占用"）
 * - 新增 /check/:userId endpoint：检查 ID 是否可用（前端实时校验）
 * - 严格 userId 正则：^[a-z0-9][a-z0-9_-]{2,31}$（3-32 字符，小写 + 数字 + -/_，不能以 -_ 开头）
 * - 保留名黑名单：admin/api/system/root 等系统名不能注册
 * - 自动 upsert User by id（保证 DB 里永远有对应 user 记录）
 *
 * ⚠️ 商用前必须替换：
 * - 加密码（bcrypt/argon2）+ 注册流程
 * - 加 refresh token + token 黑名单
 * - 加 OAuth（GitHub/Google/飞书）
 * - 加 rate limiting + IP 风控
 * - 真正的"账号系统"远不止一个 JWT 签发服务
 */
import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface LoginResult {
  accessToken: string;
  tokenType: string;
  expiresIn: string;
  userId: string;
  email: string;
  name: string | null;
}

export interface RegisterResult {
  userId: string;
  email: string;
  name: string | null;
  created: boolean;
}

export interface CheckResult {
  userId: string;
  available: boolean;
  reason?: string;
}

export interface LoginDto {
  userId: string;
  email?: string;
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

  /**
   * R-AUTH-1 注册新 ID：检查格式 + 保留名 + 是否已占用 → 创建 User
   *
   * 与 /login 区别：
   * - /login 接受任何合规 userId（已存在或不存在都返回 token）— 适合 demo 临时登录
   * - /register 严格拒绝已存在 ID（返回 409）— 适合"创建新身份"流程
   */
  async register(userId: string, email?: string): Promise<RegisterResult> {
    this.validateUserId(userId);

    const lowerUserId = userId.toLowerCase();
    const finalEmail = email || `${lowerUserId}@local`;

    const existing = await this.prisma.user.findUnique({ where: { id: lowerUserId } });
    if (existing) {
      throw new ConflictException(`ID "${userId}" 已被占用`);
    }

    const user = await this.prisma.user.create({
      data: {
        id: lowerUserId,
        email: finalEmail,
        name: userId,  // 默认 name = userId（前端可改）
      },
    });

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
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
   * demo 登录：userId 传进来即生成 token
   * 不做密码验证（demo 阶段；商用前必须替换）
   *
   * R-AUTH-1 改进：登录时自动 upsert User（保证 DB 里永远有 user 记录）
   * - 已存在 user → update email
   * - 不存在 user → create（与 /register 行为对齐，但 login 不要求"新"ID）
   */
  async login(dto: LoginDto): Promise<LoginResult> {
    this.validateUserId(dto.userId);

    const lowerUserId = dto.userId.toLowerCase();
    const finalEmail = dto.email || `${lowerUserId}@local`;

    // R-AUTH-1 自动 upsert user（demo 阶段保证 userId → user 记录 1:1 映射）
    const user = await this.prisma.user.upsert({
      where: { id: lowerUserId },
      create: {
        id: lowerUserId,
        email: finalEmail,
        name: dto.userId,
      },
      update: {
        email: finalEmail,
      },
    });

    const expiresIn = this.config.get<string>('auth.jwtExpiresIn') || '7d';

    const payload = {
      sub: lowerUserId,  // JWT subject = userId
      email: user.email,
    };

    // 锁定算法为 HS256，防止 algorithm confusion（攻击者伪造 alg=none / RS256）
    // @types/jsonwebtoken 9.x 升级：expiresIn 类型从 string 收紧到 StringValue | number
    // （StringValue = `${number}d|h|m|s` 模板字面量）。config 读出的动态 string 不自动
    // narrow 到 StringValue，所以显式 cast。
    //
    // 注：'ms' 是 @types/jsonwebtoken 的间接依赖，不在 apps/api/package.json 显式列出，
    // 无法 `import type { StringValue } from 'ms'`。这里用内联模板字面量类型表达相同约束。
    const accessToken = await this.jwtService.signAsync(payload, {
      algorithm: 'HS256',
      expiresIn: expiresIn as unknown as `${number}${'d' | 'h' | 'm' | 's'}`,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
      userId: user.id,
      email: user.email,
      name: user.name,
    };
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
