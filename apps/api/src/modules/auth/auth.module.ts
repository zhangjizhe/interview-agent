/**
 * Auth Module
 *
 * P0-1 修复：JWT 认证 + Rate Limiting
 * - JwtModule 注册 JwtService
 * - ThrottlerModule 配置 60 req/min/IP
 */
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [
    // JwtModule - 使用配置中的 secret 和 expiresIn
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (config: ConfigService) => ({
        secret: config.get<string>('auth.jwtSecret'),
        signOptions: {
          expiresIn: config.get<string>('auth.jwtExpiresIn') || '7d',
        },
      }),
      inject: [ConfigService],
    }),

    // ThrottlerModule - Rate Limiting 60 req/min/IP
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (config: ConfigService) => ([{
        ttl: config.get<number>('throttler.ttl') || 60000,
        limit: config.get<number>('throttler.limit') || 60,
      }]),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    // 全局 Rate Limiting Guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
