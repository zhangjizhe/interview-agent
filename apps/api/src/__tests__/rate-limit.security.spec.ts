import { Reflector } from '@nestjs/core';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { SecurityThrottlerGuard, RateLimitPolicy } from '../modules/auth/security-throttler.guard';
import { configuration } from '../infra/config/configuration';

class Routes {
  normal() {}
  @RateLimitPolicy('auth') login() {}
  @RateLimitPolicy('sse') stream() {}
}

describe('安全限流', () => {
  let storage: ThrottlerStorageService;
  let guard: SecurityThrottlerGuard;
  const env = process.env;
  beforeEach(async () => {
    process.env = { NODE_ENV: 'test' };
    storage = new ThrottlerStorageService();
    guard = new SecurityThrottlerGuard([{ ttl: 60000, limit: 100 }], storage, new Reflector(), new ConfigService({ throttler: { authLimit: 10, sseLimit: 20 } }));
    await guard.onModuleInit();
  });
  afterEach(() => { storage.onApplicationShutdown(); process.env = env; });
  function context(handler = 'normal', ip = '192.0.2.1') {
    const res = { header: jest.fn(), write: jest.fn(), end: jest.fn() };
    return { res, ctx: { getHandler: () => Routes.prototype[handler], getClass: () => Routes, switchToHttp: () => ({ getRequest: () => ({ ip, headers: {} }), getResponse: () => res }) } as any };
  }
  it('默认窗口为一分钟而非 60 毫秒', () => { expect(configuration().throttler.ttl).toBe(60000); });
  it('默认阈值为 100', () => { expect(configuration().throttler.limit).toBe(100); });
  it('兼容环境变量的秒单位', () => { process.env.THROTTLER_TTL = '120'; expect(configuration().throttler.ttl).toBe(120000); });
  it('正常请求放行', async () => { await expect(guard.canActivate(context().ctx)).resolves.toBe(true); });
  it('超阈值返回 429 和明确错误码', async () => {
    const { ctx, res } = context();
    for (let i = 0; i < 100; i++) await guard.canActivate(ctx);
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: 429, response: expect.objectContaining({ code: 'RATE_LIMIT_EXCEEDED' }) });
    expect(res.header).toHaveBeenCalledWith('Retry-After', expect.any(Number));
  });
  it('登录第 11 次拒绝', async () => {
    const { ctx } = context('login');
    for (let i = 0; i < 10; i++) await guard.canActivate(ctx);
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: 429 });
  });
  it('IP 独立计数', async () => {
    for (let i = 0; i < 10; i++) await guard.canActivate(context('login').ctx);
    await expect(guard.canActivate(context('login', '192.0.2.2').ctx)).resolves.toBe(true);
  });
  it('SSE 按建连次数限流，不写入或关闭已经放行的流', async () => {
    const { ctx, res } = context('stream');
    for (let i = 0; i < 20; i++) await guard.canActivate(ctx);
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: 429 });
    expect(res.write).not.toHaveBeenCalled(); expect(res.end).not.toHaveBeenCalled();
  });
});
