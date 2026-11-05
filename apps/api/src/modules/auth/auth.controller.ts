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
  @Post('registration-code')
  @Public()
  @HttpCode(HttpStatus.OK)
  async requestRegistrationCode(@Body() dto: { email: string }) {
    return this.auth.requestRegistrationCode(dto?.email);
  }

  @RateLimitPolicy('auth')
  @Post('register')
  @Public()
  @HttpCode(HttpStatus.OK)
  async register(@Body() dto: { userId: string; email: string; password: string; challengeId: string; code: string }) {
    return this.auth.register(dto?.userId, dto?.password, dto?.email, dto?.challengeId, dto?.code);
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

  @RateLimitPolicy('auth')
  @Post('login/verify-email')
  @Public()
  @HttpCode(HttpStatus.OK)
  verifyLogin(@Body() dto: { challengeId: string; code: string }) {
    return this.auth.verifyLogin(dto?.challengeId, dto?.code);
  }

  @RateLimitPolicy('auth')
  @Post('login/claim-email')
  @Public()
  @HttpCode(HttpStatus.OK)
  claimEmail(@Body() dto: { userId: string; password: string; email: string }) {
    return this.auth.requestLegacyEmailClaim(dto?.userId, dto?.password, dto?.email);
  }

  @RateLimitPolicy('auth')
  @Post('login/claim-email/verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  verifyClaimEmail(@Body() dto: { userId: string; email: string; challengeId: string; code: string }) {
    return this.auth.verifyLegacyEmailClaim(dto?.userId, dto?.email, dto?.challengeId, dto?.code);
  }

  @RateLimitPolicy('auth')
  @Post('password-reset/request')
  @Public()
  @HttpCode(HttpStatus.OK)
  requestPasswordReset(@Body() dto: { email?: string; userId?: string }) {
    return this.auth.requestPasswordReset(dto?.email ?? dto?.userId);
  }

  @RateLimitPolicy('auth')
  @Post('password-reset/complete')
  @Public()
  @HttpCode(HttpStatus.OK)
  completePasswordReset(@Body() dto: { email?: string; userId?: string; challengeId: string; code: string; newPassword: string }) {
    return this.auth.resetPassword(dto?.email ?? dto?.userId, dto?.challengeId, dto?.code, dto?.newPassword);
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
  changePassword(@Req() req: any, @Body() dto: { currentPassword: string; newPassword: string; challengeId: string; code: string }) {
    return this.auth.changePassword(req.user.userId, dto?.currentPassword, dto?.newPassword, dto?.challengeId, dto?.code);
  }

  @Post('change-password/request')
  @RateLimitPolicy('auth')
  @HttpCode(HttpStatus.OK)
  requestPasswordChange(@Req() req: any) {
    return this.auth.requestPasswordChange(req.user.userId);
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
