import { QuotaService } from './quota.service';
import { tenantContext } from '../../organizations/tenant-context';

describe('组织月度配额', () => {
  const scope = (fn: () => any) => tenantContext.run({ organizationId: 'org-a', userId: 'user-a' }, async () => await fn());
  function setup(used = 0, limit = 10) {
    const ledger = { aggregate: jest.fn().mockResolvedValue({ _sum: { units: used } }), create: jest.fn().mockResolvedValue({ id: 'receipt' }) };
    const tx: any = { organization: { update: jest.fn().mockResolvedValue({ plan: { monthlyLlmCalls: limit, monthlyInterviews: 3, maxOutputTokens: 2048, maxInputBytes: 64000 } }) }, usageLedger: ledger, interview: { create: jest.fn().mockResolvedValue({ id: 'interview' }) } };
    const prisma: any = { $transaction: (fn: any) => fn(tx) };
    return { service: new QuotaService(prisma, { get: () => undefined } as any), tx, ledger };
  }
  it('超限返回明确 429，且不产生新账本', async () => {
    const { service, ledger } = setup(10);
    await expect(scope(() => service.reserveLlm({ messages: [] }))).rejects.toMatchObject({ status: 429, response: { code: 'QUOTA_EXCEEDED' } });
    expect(ledger.create).not.toHaveBeenCalled();
  });
  it('允许调用先记账并限制输出', async () => {
    const { service, ledger } = setup();
    const prepared = await scope(() => service.reserveLlm({ messages: [], maxTokens: 9000 }));
    expect(prepared.maxTokens).toBe(2048);
    expect(ledger.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'user-a', type: 'LLM_CALL', units: 1 }) }));
  });
  it('没有组织身份不得调用模型', async () => {
    await expect(setup().service.reserveLlm({ messages: [] })).rejects.toMatchObject({ status: 503 });
  });
  it('套餐为零表示禁用，不能被默认值兜底放行', async () => {
    await expect(scope(() => setup(0, 0).service.reserveLlm({ messages: [] }))).rejects.toMatchObject({ status: 429 });
  });
  it('90% 首次越线写预警，重复调用不重复预警', async () => {
    const first = setup(8), next = setup(9);
    const warnA = jest.spyOn((first.service as any).logger, 'warn').mockImplementation(() => {});
    const warnB = jest.spyOn((next.service as any).logger, 'warn').mockImplementation(() => {});
    await scope(() => first.service.reserveLlm({ messages: [] }));
    await scope(() => next.service.reserveLlm({ messages: [] }));
    expect(warnA).toHaveBeenCalledWith(expect.objectContaining({ event: 'quota_warning', threshold: 0.9 }));
    expect(warnB).not.toHaveBeenCalled();
  });
  it('超大输入在调用与记账前拒绝', async () => {
    const { service, ledger } = setup();
    await expect(scope(() => service.reserveLlm({ messages: [{ role: 'user', content: 'x'.repeat(64001) }] }))).rejects.toMatchObject({ status: 400 });
    expect(ledger.create).not.toHaveBeenCalled();
  });
  it('数据库失败不降级放行', async () => {
    const service = new QuotaService({ $transaction: async () => { throw new Error('unavailable'); } } as any, {} as any);
    await expect(scope(() => service.reserveLlm({ messages: [] }))).rejects.toMatchObject({ status: 503 });
  });
  it('读取当前缓存约束不产生额度账本，套餐更新立即可见', async () => {
    const plan = { id: 'plan-a', maxInputBytes: 100, maxOutputTokens: 20, monthlyLlmCalls: 10 };
    const prisma: any = { organization: { findUnique: jest.fn(async () => ({ plan: { ...plan } })) }, $transaction: jest.fn() };
    const service = new QuotaService(prisma, {} as any);
    expect(await scope(() => service.getAnswerCacheLimits())).toEqual({ planId: 'plan-a', maxInputBytes: 100, maxOutputTokens: 20, monthlyLlmCalls: 10 });
    plan.maxOutputTokens = 10;
    expect((await scope(() => service.getAnswerCacheLimits())).maxOutputTokens).toBe(10);
    expect(prisma.organization.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'org-a' } }));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('缓存约束读取要求有效身份和组织，已有额度失败不能复用答案', async () => {
    const prisma: any = { organization: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new QuotaService(prisma, {} as any);
    await expect(scope(() => service.getAnswerCacheLimits())).rejects.toMatchObject({ status: 503 });
    prisma.organization.findUnique.mockClear();
    await expect(tenantContext.run({ organizationId: 'org-a', quotaFailure: { code: 'QUOTA_EXCEEDED', status: 429, message: 'exceeded' } }, () => service.getAnswerCacheLimits())).rejects.toMatchObject({ status: 503 });
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });
});
