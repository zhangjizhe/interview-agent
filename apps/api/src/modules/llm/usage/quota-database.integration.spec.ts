import { PrismaClient } from '@prisma/client';
import { QuotaService } from './quota.service';
import { tenantContext } from '../../organizations/tenant-context';
import { tenantMiddleware } from '../../organizations/tenant-policy';

const url = process.env.TENANT_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite('真实 PostgreSQL 并发配额', () => {
  let raw: PrismaClient, scoped: PrismaClient, quota: QuotaService;
  const prefix = `quota-${Date.now()}`;
  const run = (id: string, fn: () => any) => tenantContext.run({ organizationId: id, userId: id }, async () => await fn());
  const request = { messages: [{ role: 'user' as const, content: 'synthetic' }] };
  async function fixture(suffix: string, limit = 3) {
    const id = `${prefix}-${suffix}`;
    await raw.plan.create({ data: { id, name: 'fixture', monthlyInterviews: limit, monthlyLlmCalls: limit, maxInputBytes: 1024, maxOutputTokens: 64 } });
    await raw.organization.create({ data: { id, name: 'fixture', planId: id } });
    await raw.user.create({ data: { id, email: `${id}@example.invalid`, organizationId: id } });
    return id;
  }
  beforeAll(async () => {
    if (!url?.includes('phase2_')) throw new Error('Only phase2_ fixture databases are allowed');
    raw = new PrismaClient({ datasources: { db: { url } } });
    scoped = new PrismaClient({ datasources: { db: { url } } });
    scoped.$use(tenantMiddleware);
    quota = new QuotaService(scoped as any, { get: () => undefined } as any);
  });
  afterAll(async () => { await Promise.all([raw?.$disconnect(), scoped?.$disconnect()]); });
  it('20 个并发调用只有 3 个获准，其余明确 429', async () => {
    const id = await fixture('concurrent');
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => run(id, () => quota.reserveLlm(request))));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(3);
    const denied = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
    expect(denied).toHaveLength(17);
    for (const r of denied) expect(r.reason.getResponse().code).toBe('QUOTA_EXCEEDED');
    expect(await raw.usageLedger.count({ where: { organizationId: id } })).toBe(3);
  });
  it('上一月账单不占本月额度，其他组织互不影响', async () => {
    const a = await fixture('month', 1), b = await fixture('separate', 1);
    const now = new Date();
    await raw.usageLedger.create({ data: { userId: a, organizationId: a, type: 'LLM_CALL', units: 999, periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)) } });
    await run(a, () => quota.reserveLlm(request));
    await expect(run(a, () => quota.reserveLlm(request))).rejects.toMatchObject({ status: 429 });
    await expect(run(b, () => quota.reserveLlm(request))).resolves.toMatchObject({ maxTokens: 64 });
  });
  it('删除面试保留消费记录，不能退款后无限创建', async () => {
    const id = await fixture('delete', 1);
    const interview = await run(id, () => quota.createInterview({ userId: id, position: 'fixture' }));
    await run(id, () => scoped.interview.delete({ where: { id: interview.id } }));
    expect(await raw.usageLedger.findFirst({ where: { organizationId: id } })).toMatchObject({ interviewId: null, units: 1 });
    await expect(run(id, () => quota.createInterview({ userId: id, position: 'fixture' }))).rejects.toMatchObject({ status: 429 });
  });
  it('创建失败事务回滚，不消耗面试额度', async () => {
    const id = await fixture('atomic', 1);
    await expect(run(id, () => quota.createInterview({ userId: id, position: 'fixture', targetJobId: 'missing-fixture' }))).rejects.toBeDefined();
    expect(await raw.usageLedger.count({ where: { organizationId: id } })).toBe(0);
    await expect(run(id, () => quota.createInterview({ userId: id, position: 'fixture' }))).resolves.toHaveProperty('id');
  });
});
