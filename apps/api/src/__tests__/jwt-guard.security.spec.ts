import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard';
import { UnauthorizedException } from '@nestjs/common';

describe('JWT Guard 吊销检查', () => {
  function setup(revoked = false, isPublic = false) {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'user', role: 'USER' }) };
    const sessions = { assertActive: revoked ? jest.fn().mockRejectedValue(new UnauthorizedException()) : jest.fn().mockResolvedValue(undefined) };
    const request: any = { headers: { authorization: 'Bearer token' } };
    const guard = new JwtAuthGuard(jwt as any, { get: () => 'test' } as any, { getAllAndOverride: () => isPublic } as any, sessions as any);
    const context: any = { getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => request }) };
    return { guard, context, sessions, request, jwt };
  }
  it('签名正确但已吊销的 JWT 不放行', async () => {
    const { guard, context, request } = setup(true);
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 401 });
    expect(request.user).toBeUndefined();
  });
  it('正常 token 查询吊销状态后设置身份', async () => {
    const { guard, context, sessions, request } = setup();
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(sessions.assertActive).toHaveBeenCalledWith({ sub: 'user', role: 'USER' }, 'token');
    expect(request.user.userId).toBe('user');
  });
  it('公开刷新入口不要求有效 access token', async () => {
    const { guard, context, jwt } = setup(false, true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });
});
