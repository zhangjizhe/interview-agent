import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

describe('Metrics scrape boundary', () => {
  it.each([undefined, '', 'Bearer wrong', 'Bearer 秘密'])('rejects missing/invalid credential %s', async authorization => {
    const c = new MetricsController(new MetricsService(), { get: () => 'fixture-secret' } as any);
    await expect(c.scrape({ headers: { authorization } } as any, {} as any)).rejects.toMatchObject({ status: 401 });
  });
  it('disabled without server secret', async () => {
    const c = new MetricsController(new MetricsService(), { get: () => undefined } as any);
    await expect(c.scrape({ headers: { authorization: 'Bearer undefined' } } as any, {} as any)).rejects.toMatchObject({ status: 401 });
  });
  it('authenticated scrape is Prometheus text', async () => {
    const metrics = new MetricsService(); metrics.reject('quota');
    const c = new MetricsController(metrics, { get: () => 'fixture-secret' } as any);
    const res = { setHeader: jest.fn(), send: jest.fn() };
    await c.scrape({ headers: { authorization: 'Bearer fixture-secret' } } as any, res as any);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', metrics.registry.contentType);
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('security_rejections_total{kind="quota"} 1'));
  });
});
