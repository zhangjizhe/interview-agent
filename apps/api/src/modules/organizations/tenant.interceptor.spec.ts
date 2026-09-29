import { firstValueFrom, defer, of } from 'rxjs';
import { TenantInterceptor } from './tenant.interceptor';
import { requireTenant } from './tenant-context';

describe('TenantInterceptor quota error contract', () => {
  it('业务层吞掉额度错误后，JSON 响应仍是 429', async () => {
    const context = { switchToHttp: () => ({ getRequest: () => ({ user: { userId: 'u', organizationId: 'o' } }), getResponse: () => ({ headersSent: false }) }) };
    const next = { handle: () => defer(() => {
      requireTenant().quotaFailure = { status: 429, code: 'QUOTA_EXCEEDED', message: '额度已用完' };
      return of({ fallback: true });
    }) };
    await expect(firstValueFrom(new TenantInterceptor().intercept(context as any, next))).rejects.toMatchObject({ status: 429 });
  });
});
