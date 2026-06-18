/**
 * JWT Auth Guard
 *
 * P0-1 修复：JWT 认证 + Rate Limiting
 * - 验证 Authorization: Bearer <token>
 * - demo 阶段：userId 放在 token subject 里，不需要密码
 * - 未登录请求返回 401 Unauthorized
 */
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      // demo 阶段允许无 token 访问（生产环境改成 throw）
      const isDemo = this.config.get<string>('nodeEnv') === 'development';
      if (isDemo) {
        // 开发模式：无 token 时注入 mock userId
        (request as any).user = { userId: 'demo-user', email: 'demo@local' };
        return true;
      }
      throw new UnauthorizedException('Missing authorization token');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.get<string>('auth.jwtSecret'),
      });
      // demo 阶段：userId 放在 token subject 里
      (request as any).user = {
        userId: payload.sub || payload.userId,
        email: payload.email,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
