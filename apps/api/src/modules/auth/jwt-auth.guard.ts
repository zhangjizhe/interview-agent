import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuthSessionService } from './auth-session.service';
/**
 * JWT Auth Guard
 *
 * P0-1 修复：JWT 认证 + Rate Limiting
 * - 验证 Authorization: Bearer <token>
 * - 签名通过后校验 Redis 会话版本与吊销状态
 * - 未登录请求返回 401 Unauthorized
 */
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
    private reflector: Reflector,
    private sessions: AuthSessionService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Missing authorization token');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.get<string>('auth.jwtSecret'),
        algorithms: ['HS256'],
      });
      await this.sessions.assertActive(payload, token);
      const identity = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, email: true, role: true, organizationId: true } });
      if (!identity) throw new UnauthorizedException('Invalid identity');
      (request as any).authPayload = payload;
      (request as any).authToken = token;
      (request as any).user = {
        userId: payload.sub,
        email: identity.email,
        role: identity.role,
        organizationId: identity.organizationId,
      };
      return true;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new UnauthorizedException('Invalid token');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
