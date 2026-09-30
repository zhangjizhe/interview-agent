import { MetricsService } from './metrics.service';
import { SecurityThrottlerGuard } from '../auth/security-throttler.guard';
import { QuotaService, QuotaExceededException } from '../llm/usage/quota.service';
import { tenantContext } from '../organizations/tenant-context';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { SsrfBlockedException } from '../interview/controllers/external-url.util';

describe('安全执行路径指标', () => {
  it('限流 Guard 拒绝时增长', async () => {
    const metrics = new MetricsService();
    const guard = new SecurityThrottlerGuard([] as any, {} as any, {} as any, {} as any, metrics);
    await expect((guard as any).throwThrottlingException({})).rejects.toMatchObject({ status: 429 });
    expect(await metrics.registry.metrics()).toContain('security_rejections_total{kind="rate_limit"} 1');
  });
  it('额度拒绝计一次，业务重试 sticky failure 不重复计数', async () => {
    const metrics = new MetricsService();
    const quota = new QuotaService({ $transaction: async () => { throw new QuotaExceededException(); } } as any, {} as any, metrics);
    await tenantContext.run({ organizationId: 'fixture', userId: 'fixture' }, async () => {
      for (let i = 0; i < 2; i++) await expect(quota.reserveLlm({ messages: [] })).rejects.toMatchObject({ status: 429 });
    });
    expect(await metrics.registry.metrics()).toContain('security_rejections_total{kind="quota"} 1');
  });
  it('SSRF 错误经 HTTP filter 计数', async () => {
    const metrics = new MetricsService();
    const response = { getHeader: () => undefined, status: jest.fn().mockReturnThis(), json: jest.fn() };
    new GlobalExceptionFilter(metrics).catch(new SsrfBlockedException('url blocked: non-public address'), { switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({ method: 'POST', path: '/api/import' }) }) } as any);
    expect(await metrics.registry.metrics()).toContain('security_rejections_total{kind="ssrf"} 1');
  });
});
