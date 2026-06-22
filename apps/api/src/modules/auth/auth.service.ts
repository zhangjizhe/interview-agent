/**
 * Auth Service
 *
 * P0-5 修复（最小可行版，demo 阶段保留）：
 * - demo 简化：userId 传进来即登录（不做密码 hash，商用前必须替换为密码/OAuth）
 * - 加 userId 格式校验：拒绝空 / 超长 / 非 cuid 格式，防止任意字符串构造 JWT
 * - 锁定 JWT 算法为 HS256：防 algorithm confusion attack（攻击者把 alg 改成 none
 *   或换成 RS256 让 server 用公钥验证）
 *
 * ⚠️ 商用前必须替换：
 * - 加密码（bcrypt/argon2）+ 注册流程
 * - 加 refresh token + token 黑名单
 * - 加 OAuth（GitHub/Google/飞书）
 * - 加 rate limiting + IP 风控
 * - 真正的"账号系统"远不止一个 JWT 签发服务
 */
import { Injectable, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

export interface LoginResult {
  accessToken: string;
  tokenType: string;
  expiresIn: string;
  userId: string;
}

export interface LoginDto {
  userId: string;
  email?: string;
}

/**
 * Demo userId 校验：宽松匹配，只挡空 / 超长 / 注入字符。
 *
 * 为什么不用 cuid：现有调用方传的是 'u1' / 'user-1' / 'demo-user' / 'system'
 * 等非 cuid 字符串，严格 cuid 校验会破坏现有 demo。商用前必须替换为：
 * - 真实账号系统（密码 / OAuth）
 * - 真实 userId（数据库生成 cuid / uuid v7）
 */
const SAFE_USERID_REGEX = /^[a-zA-Z0-9_-]{2,50}$/;

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  /**
   * demo 登录：userId 传进来即生成 token
   * 不做密码验证（demo 阶段；商用前必须替换）
   */
  async login(dto: LoginDto): Promise<LoginResult> {
    // userId 格式校验：拒绝空 / 超长 / 注入字符（demo 阶段最小化）
    if (!dto.userId || typeof dto.userId !== 'string' || !SAFE_USERID_REGEX.test(dto.userId)) {
      throw new BadRequestException('userId must be 2-50 chars of [a-zA-Z0-9_-]');
    }

    const expiresIn = this.config.get<string>('auth.jwtExpiresIn') || '7d';

    const payload = {
      sub: dto.userId,  // JWT subject = userId
      email: dto.email || `${dto.userId}@local`,
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
      userId: dto.userId,
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
