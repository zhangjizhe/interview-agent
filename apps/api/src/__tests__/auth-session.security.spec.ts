import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthSessionService } from '../modules/auth/auth-session.service';

// 内存替身只模拟 Redis 的原子命令；不启动网络服务或读取真实凭据。
class MemoryRedis {
  values = new Map<string, string>();
  get = jest.fn(async (key: string) => this.values.get(key) ?? null);
  set = jest.fn(async (key: string, value: string, option?: string) => { if (option === 'NX' && this.values.has(key)) return null; this.values.set(key, value); return 'OK'; });
  incr = jest.fn(async (key: string) => { const n = Number(this.values.get(key) || 0) + 1; this.values.set(key, String(n)); return n; });
  eval = jest.fn(async (_script: string, count: number, ...args: string[]) => {
    if (_script.startsWith('-- revoke-session')) {
      this.values.set(args[0], '1');
      if (args[4] === '1') this.values.set(args[1], '1');
      return 1;
    }
    if (count === 1) { const value = this.values.get(args[0]) ?? null; this.values.delete(args[0]); return value; }
    if (count === 2) { await this.incr(args[0]); this.values.delete(args[1]); return 1; }
    if ((this.values.get(args[0]) || '0') !== args[3] || this.values.has(args[1]) || this.values.has(args[2])) return 0;
    this.values.set(args[4], args[5]); return 1;
  });
}

describe('JWT 会话安全', () => {
  let redis: MemoryRedis;
  let service: AuthSessionService;
  let jwt: JwtService;
  const user = { id: 'user-1', email: 'user@local', role: 'USER', name: null };
  beforeEach(() => {
    redis = new MemoryRedis(); jwt = new JwtService({ secret: 'test-only-secret' });
    service = new AuthSessionService({ getClient: () => redis } as any, jwt, new ConfigService());
  });
  const payload = (token: string) => jwt.verify(token);
  it('access 默认 30 分钟，refresh 白名单只存哈希键', async () => {
    const pair = await service.issue(user, '0'); const decoded = payload(pair.accessToken);
    expect(decoded.exp - decoded.iat).toBe(1800);
    expect([...redis.values.keys()].join(' ')).not.toContain(pair.refreshToken);
    expect(pair.refreshExpiresIn).toBe(604800);
  });
  it('refresh 使用一次后失效', async () => {
    const pair = await service.issue(user, '0');
    const session = await service.consumeRefresh(pair.refreshToken);
    const next = await service.issue(user, session.version, session.sid);
    expect(next.refreshToken).not.toBe(pair.refreshToken);
    await expect(service.consumeRefresh(pair.refreshToken)).rejects.toMatchObject({ status: 401 });
  });
  it('并发消费同一 refresh 只有一个成功', async () => {
    const pair = await service.issue(user, '0');
    const results = await Promise.allSettled([service.consumeRefresh(pair.refreshToken), service.consumeRefresh(pair.refreshToken)]);
    expect(results.filter(x => x.status === 'fulfilled')).toHaveLength(1);
  });
  it('logout 后 access 立即失效，黑名单 TTL 为剩余有效期', async () => {
    const pair = await service.issue(user, '0'); const decoded = payload(pair.accessToken);
    await service.logout(decoded, pair.accessToken);
    await expect(service.assertActive(decoded, pair.accessToken)).rejects.toMatchObject({ status: 401 });
    expect(redis.eval).toHaveBeenLastCalledWith(expect.stringContaining('-- revoke-session'), 2,
      `auth:blacklist:${decoded.jti}`, `auth:session-revoked:${decoded.sid}`, expect.stringMatching(/^\d+$/), '604800', '1');
  });
  it('logout 同时使 refresh 失效', async () => {
    const pair = await service.issue(user, '0'); await service.logout(payload(pair.accessToken), pair.accessToken);
    await expect(service.consumeRefresh(pair.refreshToken)).rejects.toMatchObject({ status: 401 });
  });
  it('单会话退出不吊销其他设备，Redis 失败不伪装成功', async () => {
    const a = await service.issue(user, '0'); const b = await service.issue(user, '0');
    await service.logout(payload(a.accessToken), a.accessToken);
    await expect(service.assertActive(payload(b.accessToken), b.accessToken)).resolves.toBeUndefined();
    redis.eval.mockRejectedValueOnce(new Error('unavailable'));
    await expect(service.logout(payload(b.accessToken), b.accessToken)).rejects.toMatchObject({ status: 503 });
  });
  it('吊销用户全部会话会拒绝所有设备', async () => {
    const a = await service.issue(user, '0'); const b = await service.issue(user, '0');
    await service.revokeUser(user.id);
    for (const pair of [a, b]) {
      await expect(service.assertActive(payload(pair.accessToken), pair.accessToken)).rejects.toMatchObject({ status: 401 });
      await expect(service.consumeRefresh(pair.refreshToken)).rejects.toMatchObject({ status: 401 });
    }
  });
  it('密码变更期间旧版本登录不能签发新会话', async () => {
    await service.revokeUser(user.id); await expect(service.issue(user, '0')).rejects.toMatchObject({ status: 401 });
  });
  it('未吊销的旧无 jti token 兼容', async () => {
    await expect(service.assertActive({ sub: user.id }, 'legacy')).resolves.toBeUndefined();
  });
  it('旧 token 可 logout 且不会使其他旧 token 下线', async () => {
    await service.logout({ sub: user.id, exp: Math.floor(Date.now()/1000) + 60 }, 'legacy');
    await expect(service.assertActive({ sub: user.id }, 'legacy')).rejects.toMatchObject({ status: 401 });
    await expect(service.assertActive({ sub: user.id }, 'other')).resolves.toBeUndefined();
  });
  it('未知 refresh 返回 401', async () => { await expect(service.consumeRefresh('a'.repeat(64))).rejects.toMatchObject({ status: 401 }); });
  it('Redis 故障不能放行 access', async () => {
    redis.get.mockRejectedValue(new Error('internal redis error'));
    await expect(service.assertActive({ sub: user.id }, 'token')).rejects.toMatchObject({ status: 503 });
  });
  it('修改密码期间拒绝旧 access 和并发签发，成功后全部设备失效', async () => {
    const pair = await service.issue(user, '0');
    await service.changePassword(user.id, async () => {
      await expect(service.assertActive(payload(pair.accessToken), pair.accessToken)).rejects.toMatchObject({ status: 401 });
      await expect(service.issue(user, '0')).rejects.toMatchObject({ status: 401 });
    });
    await expect(service.assertActive(payload(pair.accessToken), pair.accessToken)).rejects.toMatchObject({ status: 401 });
    await expect(service.issue(user, await service.version(user.id))).resolves.toHaveProperty('accessToken');
  });

});
