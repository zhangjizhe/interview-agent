jest.mock('../../llm/llm.gateway.service', () => ({ LlmGatewayService: class {} }));
jest.mock('@zilliz/milvus2-sdk-node', () => ({ MilvusClient: jest.fn(() => ({})), ConsistencyLevelEnum: { Strong: 'Strong' } }));
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { QuestionBankService } from './question-bank.service';
import { QuestionVectorIndexService } from './question-vector-index.service';
import { tenantContext } from '../../organizations/tenant-context';
import { tenantMiddleware } from '../../organizations/tenant-policy';
const url = process.env.TENANT_TEST_DATABASE_URL;
(url ? describe : describe.skip)('Question catalog: actual isolated PostgreSQL and two independent clients', () => {
  let raw: PrismaClient, first: PrismaClient, second: PrismaClient, org: string, legacy: any, index: any, bank: QuestionBankService, replica: QuestionBankService;
  const input = { questionId: 'synthetic-question', position: 'Frontend', level: 'P5', category: 'frontend', question: 'Synthetic catalog question', answer: 'Synthetic answer one', tags: '' };
  const scope = (work: () => Promise<any>, organizationId = org) => tenantContext.run({ organizationId }, work);
  beforeAll(async () => {
    if (!url?.includes('phase2_')) throw new Error('Only isolated phase2_ databases are permitted');
    raw = new PrismaClient({ datasources: { db: { url } } });
    first = new PrismaClient({ datasources: { db: { url } } }); first.$use(tenantMiddleware);
    second = new PrismaClient({ datasources: { db: { url } } }); second.$use(tenantMiddleware);
  });
  beforeEach(async () => {
    org = `catalog-${randomUUID()}`;
    await raw.organization.create({ data: { id: org, name: 'Synthetic catalog fixture', planId: 'free' } });
    await raw.organization.create({ data: { id: `${org}-other`, name: 'Synthetic other fixture', planId: 'free' } });
    await raw.questionCatalogState.create({ data: { organizationId: org } });
    const validator = new QuestionVectorIndexService(new ConfigService(), {} as any);
    legacy = { validateItems: (items: any[]) => validator.validateItems(items), readLegacySnapshot: jest.fn().mockResolvedValue([{ ...input, createdAt: '2026-10-10T00:00:00Z' }]), addQuestions: jest.fn().mockResolvedValue({ count: 1 }), list: jest.fn().mockResolvedValue([]) };
    index = { addQuestions: jest.fn().mockResolvedValue({ count: 1 }) };
    bank = new QuestionBankService(first as any, legacy, index);
    replica = new QuestionBankService(second as any, legacy, index);
  });
  afterAll(async () => { await Promise.all([raw?.$disconnect(), first?.$disconnect(), second?.$disconnect()]); });
  it('adopts once, preserves old versions, reuses identical writes and isolates another organization', async () => {
    await scope(() => bank.adoptLegacy(true));
    await scope(() => bank.adoptLegacy(true));
    expect(await raw.questionCatalogVersion.count({ where: { organizationId: org } })).toBe(1);
    await scope(() => bank.addQuestions([input]));
    expect(index.addQuestions).not.toHaveBeenCalled(); // Identical saved PENDING is not a paid retry.
    expect(await raw.questionCatalogVersion.count({ where: { organizationId: org } })).toBe(1);
    await scope(() => bank.addQuestions([{ ...input, answer: 'Synthetic answer two' }]));
    const versions = await raw.questionCatalogVersion.findMany({ where: { organizationId: org }, orderBy: { version: 'asc' } });
    expect(versions.map(version => (version.snapshot as any).answer)).toEqual(['Synthetic answer one', 'Synthetic answer two']);
    await expect(raw.questionCatalogVersion.update({ where: { id: versions[0].id }, data: { contentHash: 'altered' } })).rejects.toThrow('immutable');
    expect(await scope(() => replica.list(), `${org}-other`)).toEqual([]);
    await expect(scope(() => first.questionCatalogEntry.findUniqueOrThrow({ where: { id: versions[0].entryId } }), `${org}-other`)).rejects.toThrow();
  });
  it('rolls back a failed adoption completely and retries without partial canonical state', async () => {
    legacy.readLegacySnapshot.mockResolvedValueOnce([{ ...input, createdAt: '2026-10-10' }]).mockResolvedValueOnce([{ ...input, answer: 'changed', createdAt: '2026-10-10' }]);
    await expect(scope(() => bank.adoptLegacy(true))).rejects.toMatchObject({ status: 409 });
    expect(await raw.questionCatalogEntry.count({ where: { organizationId: org } })).toBe(0);
    expect((await raw.questionCatalogState.findUniqueOrThrow({ where: { organizationId: org } })).mode).toBe('LEGACY');
    await scope(() => bank.adoptLegacy(true));
    expect(await raw.questionCatalogVersion.count({ where: { organizationId: org } })).toBe(1);
  });
  it('holds a real PostgreSQL row lock during adoption and serializes another instance write', async () => {
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    legacy.readLegacySnapshot.mockImplementationOnce(async () => { entered(); await gate; return [{ ...input, createdAt: '2026-10-10T00:00:00Z' }]; });
    const adoption = scope(() => bank.adoptLegacy(true));
    await started;
    const update = scope(() => replica.addQuestions([{ ...input, answer: 'Concurrent canonical answer' }]));
    let blocked = false;
    try {
      for (let attempt = 0; attempt < 50; attempt++) {
        const waiting = await raw.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM pg_locks WHERE NOT granted AND locktype IN ('transactionid', 'tuple')`;
        if (Number(waiting[0].count) > 0) { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(blocked).toBe(true);
      expect(index.addQuestions).not.toHaveBeenCalled();
    } finally { release(); }
    await Promise.all([adoption, update]);
    const versions = await raw.questionCatalogVersion.findMany({ where: { organizationId: org }, orderBy: { version: 'asc' } });
    expect(versions).toHaveLength(2);
    expect(versions.map(item => (item.snapshot as any).answer)).toEqual(['Synthetic answer one', 'Concurrent canonical answer']);
    expect(legacy.addQuestions).not.toHaveBeenCalled();
    const current = await raw.questionCatalogEntry.findFirstOrThrow({ where: { organizationId: org } });
    expect(current.currentVersion).toBe(2);
    expect(current.answer).toBe('Concurrent canonical answer');
  });
});
