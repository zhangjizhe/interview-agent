/**
 * Auth Service
 *
 * P0-1 修复：JWT 认证 + Rate Limiting
 * - demo 简化：userId 传进来即登录
 * - 不做密码 hash（商用才需要）
 */
import { Injectable } from '@nestjs/common';
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

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  /**
   * demo 登录：userId 传进来即生成 token
   * 不做密码验证（demo 阶段）
   */
  async login(dto: LoginDto): Promise<LoginResult> {
    const expiresIn = this.config.get<string>('auth.jwtExpiresIn') || '7d';
    
    const payload = {
      sub: dto.userId,  // JWT subject = userId
      email: dto.email || `${dto.userId}@local`,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
      userId: dto.userId,
    };
  }

  /**
   * 验证 token 并返回 payload
   */
  async verifyToken(token: string) {
    return this.jwtService.verifyAsync(token, {
      secret: this.config.get<string>('auth.jwtSecret'),
    });
  }
}
