/**
 * Auth Controller
 *
 * P0-1 修复：JWT 认证
 * - POST /auth/login - demo 简化登录（userId 传进来即登录，自动 upsert user）
 * - GET /auth/profile - 获取当前用户信息（需 JWT）
 *
 * R-AUTH-1 登录页面化（2026-06-28）：
 * - POST /auth/register - 注册新 ID（已存在 → 409，前端展示"该 ID 已被占用"）
 * - GET /auth/check/:userId - 检查 ID 可用性（前端实时校验）
 *   返回 { userId, available, reason? }
 *
 * ⚠️ /register 与 /login 区别：
 * - /login: 任何合规 userId 都能拿到 token（demo 临时登录 + 已存在 user 自动 upsert）
 * - /register: 严格要求 ID 不存在（创建新身份流程）
 */
import { Controller, Post, Get, Body, UseGuards, Req, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService, LoginDto } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  /**
   * R-AUTH-1 注册新 ID
   * 已存在 → 409 Conflict
   * 格式不合法 / 保留名 → 400 Bad Request
   */
  @Post('register')
  @HttpCode(HttpStatus.OK)
  async register(@Body() dto: LoginDto) {
    return this.auth.register(dto.userId, dto.email);
  }

  /**
   * R-AUTH-1 检查 ID 可用性
   * 永远返回 200 + 结构化结果（前端实时校验用，不抛 4xx）
   */
  @Get('check/:userId')
  async check(@Param('userId') userId: string) {
    return this.auth.checkAvailability(userId);
  }

  /**
   * POST /auth/login
   * demo 简化：userId 传进来即登录（自动 upsert user）
   * 不需要密码验证
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  /**
   * GET /auth/profile
   * 获取当前登录用户信息（需要 JWT token）
   */
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: any) {
    return {
      userId: req.user.userId,
      email: req.user.email,
    };
  }
}
