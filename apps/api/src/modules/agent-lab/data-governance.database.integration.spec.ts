import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { tenantMiddleware } from '../organizations/tenant-policy';
import { tenantContext } from '../organizations/tenant-context';
import { DataGovernanceService } from './data-governance.service';
import { ConfiguredRuntimeService } from './configured-runtime.service';
import { DataPageDto } from './dto/data.dto';
import { TraceEventService } from './trace-event.service';
jest.mock('../llm/llm.gateway.service', () => ({ LlmGatewayService: class {} }));
jest.mock('../llm/cost/llm-pricing-catalog.service', () => ({ LlmPricingCatalogService: class {} }));
const databaseUrl = process.env.TENANT_TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const page = (extra: Partial<DataPageDto> = {}) => ({ ...new DataPageDto(), ...extra });
suite('Agent Lab generic data isolation with real PostgreSQL', () => {
  let raw: PrismaClient, scoped: PrismaClient, service: DataGovernanceService;
  const prefix = `data-${randomUUID().slice(0, 8)}`, org = `${prefix}-org`, foreignOrg = `${prefix}-foreign`;
  const owner = `${prefix}-owner`, reader = `${prefix}-reader`, stranger = `${prefix}-stranger`, foreign = `${prefix}-outsider`;
  // PrismaPromise is lazy: consume it inside ALS rather than after run() exits.
  const scope = <T>(userId: string, work: () => Promise<T>) => tenantContext.run({ organizationId: userId === foreign ? foreignOrg : org, userId }, async () => await work());
  let collection: any, record: any;
  beforeAll(async () => {
    if (!databaseUrl?.includes('phase2_')) throw new Error('Only isolated phase2_ databases are authorized');
    raw = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    scoped = new PrismaClient({ datasources: { db: { url: databaseUrl } } }); scoped.$use(tenantMiddleware);
    service = new DataGovernanceService(scoped as any);
    for (const id of [org, foreignOrg]) await raw.organization.create({ data: { id, name: 'Synthetic data organization' } });
    for (const id of [owner, reader, stranger, foreign]) await raw.user.create({ data: { id, email: `${id}@example.invalid`, organizationId: id === foreign ? foreignOrg : org, role: 'ADMIN', emailVerifiedAt: new Date() } });
  });
  afterAll(async () => { await Promise.all([raw?.$disconnect(), scoped?.$disconnect()]); });
  beforeEach(async () => {
    collection = await scope(owner, () => service.create(owner, { name: 'Private articles', kind: 'ARTICLE' }));
    record = await scope(owner, () => service.createRecord(owner, collection.id, { title: 'ALPHA article', content: 'ALPHA private article content', sourceUrl: 'https://example.invalid/source' }));
  });
  const version = async (userId: string, ids: string[]) => scope(userId, async () => {
    await service.create(userId, { name: 'Ensure own workspace', kind: 'DOCUMENT' });
    const workspace = await scoped.workspace.findFirstOrThrow({ where: { ownerId: userId } });
    const agent = await scoped.agent.create({ data: { workspaceId: workspace.id, key: `a-${randomUUID()}`, name: 'Synthetic Agent', type: 'CUSTOM' } });
    const v = await scoped.agentVersion.create({ data: { agentId: agent.id, version: '1.0.0', systemPrompt: 'Use permitted data', knowledgeBindings: { collectionIds: ids },
      modelConfig: { provider: 'qwen', maxTokens: 64, temperature: 0 }, runtimeConfig: { adapter: 'single-agent-v1', maxDurationMs: 1000, maxEstimatedCostCny: 0.05 } } });
    return { workspace, agent, version: v };
  });
  it('creates private typed collections without exposing another same-org ADMIN’s content or metadata', async () => {
    expect((await scope(stranger, () => service.list(stranger, page()))).items.some(row => row.id === collection.id)).toBe(false);
    for (const work of [() => service.records(stranger, collection.id, page()), () => service.history(stranger, collection.id, record.id, page()),
      () => service.createRecord(stranger, collection.id, { title: 'attack', content: 'attack' }), () => service.grants(stranger, collection.id, page()), () => service.auditEvents(stranger, collection.id, page())]) {
      await expect(scope(stranger, work)).rejects.toMatchObject({ status: 404 });
    }
    expect((await raw.labDataRecord.findUniqueOrThrow({ where: { id: record.id } })).content).toBe(record.content);
  });
  it('rejects foreign-org guessing and actor impersonation, even for platform ADMIN', async () => {
    await expect(scope(foreign, () => service.records(foreign, collection.id, page()))).rejects.toMatchObject({ status: 404 });
    await expect(scope(stranger, () => service.records(owner, collection.id, page()))).rejects.toMatchObject({ status: 403 });
    await expect(scope(owner, () => service.grant(owner, collection.id, { userId: foreign, access: 'READ' }))).rejects.toMatchObject({ status: 404 });
    expect(await raw.labDataGrant.count({ where: { collectionId: collection.id } })).toBe(0);
  });
  it('READ permits content and history but cannot write, delegate, inspect grants/audit or archive', async () => {
    await scope(owner, () => service.grant(owner, collection.id, { userId: reader, access: 'READ' }));
    expect((await scope(reader, () => service.records(reader, collection.id, page()))).items[0].id).toBe(record.id);
    expect((await scope(reader, () => service.history(reader, collection.id, record.id, page()))).items[0].snapshot).toMatchObject({ content: record.content });
    const before = await raw.labDataCollection.findUniqueOrThrow({ where: { id: collection.id } });
    for (const work of [() => service.createRecord(reader, collection.id, { title: 'attack', content: 'attack' }),
      () => service.updateRecord(reader, collection.id, record.id, { title: 'attack', content: 'attack', revision: 1 }), () => service.deleteRecord(reader, collection.id, record.id, 1),
      () => service.grant(reader, collection.id, { userId: stranger, access: 'WRITE' }), () => service.revoke(reader, collection.id, owner),
      () => service.archive(reader, collection.id), () => service.grants(reader, collection.id, page()), () => service.auditEvents(reader, collection.id, page())]) {
      await expect(scope(reader, work)).rejects.toMatchObject({ status: 404 });
    }
    expect((await raw.labDataCollection.findUniqueOrThrow({ where: { id: collection.id } })).revision).toBe(before.revision);
  });
  it('WRITE can edit and delete content while permission management stays owner-only', async () => {
    await scope(owner, () => service.grant(owner, collection.id, { userId: reader, access: 'WRITE' }));
    const created = await scope(reader, () => service.createRecord(reader, collection.id, { title: 'Editor', content: 'Editor content' }));
    const updated = await scope(reader, () => service.updateRecord(reader, collection.id, created.id, { title: 'Editor updated', content: 'New body', revision: 1 }));
    expect(updated.revision).toBe(2);
    await expect(scope(reader, () => service.grant(reader, collection.id, { userId: stranger, access: 'READ' }))).rejects.toMatchObject({ status: 404 });
    await expect(scope(reader, () => service.archive(reader, collection.id))).rejects.toMatchObject({ status: 404 });
    expect(await scope(reader, () => service.deleteRecord(reader, collection.id, created.id, 2))).toMatchObject({ deleted: true });
    expect((await scope(owner, () => service.history(owner, collection.id, created.id, page()))).items).toHaveLength(2);
  });
  it('serializes competing edits and rejects stale revisions without losing immutable history', async () => {
    const results = await Promise.allSettled(['first', 'second'].map(content => scope(owner, () => service.updateRecord(owner, collection.id, record.id, { title: record.title, content, revision: 1 }))));
    expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(row => row.status === 'rejected')).toHaveLength(1);
    expect((results.find(row => row.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ status: 409 });
    const history = await scope(owner, () => service.history(owner, collection.id, record.id, page()));
    expect(history.items.map(row => row.revision)).toEqual([2, 1]);
    expect(history.items[1].snapshot).toMatchObject({ content: record.content });
    await expect(raw.labDataRecordVersion.update({ where: { id: `${record.id}:1` }, data: { snapshot: { content: 'tamper' } } })).rejects.toBeDefined();
    await expect(raw.labDataRecordVersion.delete({ where: { id: `${record.id}:1` } })).rejects.toBeDefined();
    const audit = await raw.labDataAudit.findFirstOrThrow({ where: { collectionId: collection.id } });
    await expect(raw.labDataAudit.delete({ where: { id: audit.id } })).rejects.toBeDefined();
  });
  it('isolates question/article/document collections and sibling Agent bindings', async () => {
    const questions = await scope(owner, () => service.create(owner, { name: 'Questions', kind: 'QUESTION' }));
    await scope(owner, () => service.createRecord(owner, questions.id, { title: 'ALPHA question', content: 'ALPHA QUESTION_SECRET' }));
    const bound = await version(owner, [collection.id]), sibling = await version(owner, []);
    const result = await scope(owner, () => service.contextForVersion(owner, bound.workspace.id, bound.version.id, 'ALPHA'));
    expect(result.references).toEqual([expect.objectContaining({ collectionId: collection.id, kind: 'ARTICLE', versionId: `${record.id}:1`, contentHash: record.contentHash })]);
    expect(result.text).not.toContain('QUESTION_SECRET');
    expect(await scope(owner, () => service.contextForVersion(owner, sibling.workspace.id, sibling.version.id, 'ALPHA'))).toEqual({ text: '', references: [] });
    expect((await scope(owner, () => service.list(owner, page({ kind: 'QUESTION', limit: 50 })))).items.every(row => row.kind === 'QUESTION')).toBe(true);
  });
  it('checks persisted Agent ownership, not supplied workspace or version identifiers', async () => {
    const own = await version(owner, [collection.id]);
    const other = await version(reader, []);
    await expect(scope(reader, () => service.contextForVersion(reader, own.workspace.id, own.version.id, 'ALPHA'))).rejects.toMatchObject({ status: 404 });
    await expect(scope(reader, () => service.contextForVersion(reader, other.workspace.id, own.version.id, 'ALPHA'))).rejects.toMatchObject({ status: 404 });
  });
  it('revocation blocks already-prepared Agent execution before any model or pricing call', async () => {
    await scope(owner, () => service.grant(owner, collection.id, { userId: reader, access: 'READ' }));
    const bound = await version(reader, [collection.id]);
    const gateway = { chat: jest.fn(), getConfiguredModels: jest.fn() }, pricing = { estimateCall: jest.fn() };
    const runtime = new ConfiguredRuntimeService(scoped as any, gateway as any, pricing as any, { append: jest.fn() } as any, service);
    const prepared = await scope(reader, () => runtime.prepare(bound.version, bound.workspace.id, true));
    const run = await scope(reader, () => scoped.run.create({ data: { workspaceId: bound.workspace.id, agentId: bound.agent.id, agentVersionId: bound.version.id, status: 'RUNNING', input: { message: 'ALPHA' } } }));
    await scope(owner, () => service.revoke(owner, collection.id, reader));
    await expect(scope(reader, () => runtime.execute(reader, run, bound.version, { message: 'ALPHA' }, prepared))).rejects.toMatchObject({ status: 404 });
    expect(gateway.chat).not.toHaveBeenCalled(); expect(pricing.estimateCall).not.toHaveBeenCalled();
    await expect(scope(reader, () => service.history(reader, collection.id, record.id, page()))).rejects.toMatchObject({ status: 404 });
  });
  it('archive blocks future binds/reads, retains history and lets only owner read its audit', async () => {
    const bound = await version(owner, [collection.id]);
    await scope(owner, () => service.archive(owner, collection.id));
    await expect(scope(owner, () => service.validateBindings(bound.workspace.id, [collection.id]))).rejects.toMatchObject({ status: 404 });
    expect((await raw.labDataRecordVersion.findMany({ where: { recordId: record.id } }))).toHaveLength(1);
    const audit = await scope(owner, () => service.auditEvents(owner, collection.id, page()));
    expect(audit.items.some(row => row.action === 'COLLECTION_ARCHIVE')).toBe(true);
    expect(JSON.stringify(audit)).not.toContain(record.content);
    await expect(scope(reader, () => service.auditEvents(reader, collection.id, page()))).rejects.toMatchObject({ status: 404 });
  });
  it('record deletion cannot reappear as live Agent context or be confused with another collection', async () => {
    const bound = await version(owner, [collection.id]);
    const other = await scope(owner, () => service.create(owner, { name: 'Other', kind: 'DOCUMENT' }));
    await expect(scope(owner, () => service.updateRecord(owner, other.id, record.id, { title: 'attack', content: 'attack', revision: 1 }))).rejects.toMatchObject({ status: 404 });
    await scope(owner, () => service.deleteRecord(owner, collection.id, record.id, 1));
    expect((await scope(owner, () => service.contextForVersion(owner, bound.workspace.id, bound.version.id, 'ALPHA'))).references).toEqual([]);
  });
  it('database constraints reject cross-tenant records, grants and forged collection owners even without middleware', async () => {
    const own = await raw.labDataCollection.findUniqueOrThrow({ where: { id: collection.id } });
    await expect(raw.labDataRecord.create({ data: { organizationId: foreignOrg, collectionId: own.id, title: 'attack', content: 'attack', contentHash: 'bad' } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(raw.labDataGrant.create({ data: { organizationId: org, collectionId: own.id, userId: foreign, access: 'READ' } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(raw.labDataCollection.create({ data: { organizationId: org, workspaceId: own.workspaceId, ownerId: reader, name: 'forged', kind: 'ARTICLE' } })).rejects.toMatchObject({ code: 'P2003' });
  });
  it('paginates shared principals instead of silently hiding grants after the first page', async () => {
    for (const userId of [reader, stranger]) await scope(owner, () => service.grant(owner, collection.id, { userId, access: 'READ' }));
    const first = await scope(owner, () => service.grants(owner, collection.id, page({ limit: 1 })));
    const second = await scope(owner, () => service.grants(owner, collection.id, page({ limit: 1, page: 2 })));
    expect(first.hasMore).toBe(true); expect(second.hasMore).toBe(false);
    expect(first.items[0].userId).not.toBe(second.items[0].userId);
  });
  it('bounds multi-byte model context and references actual retained record revisions', async () => {
    await scope(owner, () => service.updateRecord(owner, collection.id, record.id, { title: record.title, content: 'ALPHA ' + '中'.repeat(19000), revision: 1 }));
    const bound = await version(owner, [collection.id]);
    const context = await scope(owner, () => service.contextForVersion(owner, bound.workspace.id, bound.version.id, 'ALPHA'));
    expect(Buffer.byteLength(context.text, 'utf8')).toBeLessThanOrEqual(8000);
    expect(context.references[0]).toMatchObject({ versionId: `${record.id}:2`, revision: 2 });
    expect(await raw.labDataRecordVersion.findUnique({ where: { id: context.references[0].versionId } })).not.toBeNull();
  });
  it('persists exact authorized source revisions on Trace without copying source bodies into evidence', async () => {
    const bound = await version(owner, [collection.id]);
    const run = await scope(owner, () => scoped.run.create({ data: { workspaceId: bound.workspace.id, agentId: bound.agent.id,
      agentVersionId: bound.version.id, status: 'RUNNING', input: { message: 'ALPHA' } } }));
    const gateway = { getConfiguredModels: () => [{ provider: 'qwen', model: 'synthetic-only', enabled: true }],
      chat: jest.fn().mockResolvedValue({ content: 'Synthetic response', provider: 'qwen', model: 'synthetic-only', usage: { promptTokens: 80, completionTokens: 5 } }) };
    const pricing = { estimateCall: jest.fn().mockReturnValue({ status: 'available', totalCny: 0.001 }) };
    const runtime = new ConfiguredRuntimeService(scoped as any, gateway as any, pricing as any, new TraceEventService(scoped as any), service);
    await scope(owner, async () => {
      const prepared = await runtime.prepare(bound.version, bound.workspace.id, true);
      await runtime.execute(owner, run, bound.version, { message: 'ALPHA' }, prepared);
    });
    expect(gateway.chat).toHaveBeenCalledTimes(1);
    expect(gateway.chat.mock.calls[0][0].messages[1].content).toContain(record.content);
    const events = await raw.traceEvent.findMany({ where: { runId: run.id }, orderBy: { seq: 'asc' } });
    const read = events.find(event => event.type === 'data.read');
    expect(read?.metadata).toMatchObject({ collectionIds: [collection.id], references: [expect.objectContaining({ recordId: record.id, versionId: `${record.id}:1`, contentHash: record.contentHash })] });
    expect(read?.modelVisible).toBe(false);
    expect(JSON.stringify(events)).not.toContain(record.content);
    const retained = await raw.labDataRecordVersion.findUniqueOrThrow({ where: { id: `${record.id}:1` } });
    expect(retained.contentHash).toBe(record.contentHash);
  });
});
