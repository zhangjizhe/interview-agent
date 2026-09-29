import { Controller, Post, Get, Body, UseGuards, Req, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService, LoginDto } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RateLimitPolicy } from './security-throttler.guard';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  /**
   * R-AUTH-1 注册新 ID
   * 已存在 → 409 Conflict
   * 格式不合法 / 保留名 → 400 Bad Request
   */
  @RateLimitPolicy('auth')
  @Post('register')
  @Public()
  @HttpCode(HttpStatus.OK)
  async register(@Body() dto: LoginDto) {
    return this.auth.register(dto.userId, dto.password);
  }

  /**
   * R-AUTH-1 检查 ID 可用性
   * 永远返回 200 + 结构化结果（前端实时校验用，不抛 4xx）
   */
  @Get('check/:userId')
  @Public()
  async check(@Param('userId') userId: string) {
    return this.auth.checkAvailability(userId);
  }

  /**
   * POST /auth/login
   * 校验密码，签发 access/refresh token。
   */
  @RateLimitPolicy('auth')
  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @Public()
  @RateLimitPolicy('auth')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: { refreshToken: string }) {
    return this.auth.refresh(dto?.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Req() req: any) {
    return this.auth.logout(req.authPayload, req.authToken);
  }

  @Post('change-password')
  @RateLimitPolicy('auth')
  @HttpCode(HttpStatus.OK)
  changePassword(@Req() req: any, @Body() dto: { currentPassword: string; newPassword: string }) {
    return this.auth.changePassword(req.user.userId, dto?.currentPassword, dto?.newPassword);
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
      role: req.user.role,
    };
  }
}
