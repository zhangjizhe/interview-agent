/**
 * Auth Controller
 *
 * P0-1 修复：JWT 认证
 * - POST /auth/login - demo 简化登录
 * - GET /auth/profile - 获取当前用户信息
 */
import { Controller, Post, Get, Body, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService, LoginDto } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  /**
   * POST /auth/login
   * demo 简化：userId 传进来即登录
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
