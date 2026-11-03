jest.mock('../../llm/llm.gateway.service', () => ({ LlmGatewayService: class {} }));
jest.mock('@zilliz/milvus2-sdk-node', () => ({ MilvusClient: jest.fn(() => ({})), ConsistencyLevelEnum: { Strong: 'Strong' } }));
import { QuestionBankService } from './question-bank.service';
import { QuestionVectorIndexService } from './question-vector-index.service';
import { tenantContext } from '../../organizations/tenant-context';
import { ConfigService } from '@nestjs/config';
const scope = (work: () => Promise<any>) => tenantContext.run({ organizationId: 'catalog-synthetic' }, work);
const row = { id: 'entry', questionId: 'saved', position: 'Frontend', level: 'P5', category: 'frontend', question: 'Synthetic question', answer: 'Synthetic answer', tags: 'fixture', createdAt: new Date('2026-10-10'), currentVersion: 1, contentHash: 'hash', indexKey: 'entry:1', indexStatus: 'READY' };
const input = { questionId: 'saved', position: row.position, level: row.level, category: row.category, question: row.question, answer: row.answer, tags: row.tags };
describe('Question catalog business boundary (offline provider/storage doubles)', () => {
  let service: QuestionBankService, tx: any, db: any, legacy: any, index: any;
  beforeEach(() => {
    tx = {
      questionCatalogState: { upsert: jest.fn(), update: jest.fn().mockResolvedValue({ mode: 'CATALOG' }) },
      questionCatalogEntry: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn(), createMany: jest.fn(), updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([row]) },
      questionCatalogVersion: { create: jest.fn(), createMany: jest.fn() },
    };
    db = { ...tx, $transaction: jest.fn(work => work(tx)), questionCatalogState: { findUnique: jest.fn().mockResolvedValue({ mode: 'CATALOG' }) },
      questionCatalogEntry: { ...tx.questionCatalogEntry, count: jest.fn().mockResolvedValue(0) } };
    const validator = new QuestionVectorIndexService(new ConfigService(), {} as any);
    legacy = { validateItems: (items: any[]) => validator.validateItems(items), addQuestions: jest.fn().mockResolvedValue({ count: 1 }), readLegacySnapshot: jest.fn().mockResolvedValue([{ ...input, createdAt: '2026-10-10T00:00:00Z' }]), list: jest.fn(), selectInitial: jest.fn(), search: jest.fn() };
    index = { addQuestions: jest.fn().mockResolvedValue({ count: 1 }), search: jest.fn().mockResolvedValue([]), rerankCurrent: jest.fn(async (_query, rows) => rows) };
    service = new QuestionBankService(db, legacy, index);
  });
  it('retains explicit legacy mode until an administrator adopts, without losing existing rows', async () => {
    db.questionCatalogState.findUnique.mockResolvedValue(null);
    await scope(() => service.list());
    expect(legacy.list).toHaveBeenCalled();
    expect(await scope(() => service.catalogStatus())).toMatchObject({ contractVersion: 'question-catalog/v1', mode: 'LEGACY', adoptionRequired: true });
  });
  it('rejects input before DB/index/provider work', async () => {
    await expect(scope(() => service.addQuestions([{ ...input, question: '' }]))).rejects.toMatchObject({ status: 400 });
    expect(db.$transaction).not.toHaveBeenCalled(); expect(index.addQuestions).not.toHaveBeenCalled();
  });
  it('requires a maintenance declaration before adopting and never invokes a model', async () => {
    await expect(scope(() => service.adoptLegacy(false))).rejects.toMatchObject({ status: 400 });
    tx.questionCatalogState.update.mockResolvedValue({ mode: 'LEGACY' });
    await expect(scope(() => service.adoptLegacy(true))).resolves.toMatchObject({ contractVersion: 'question-catalog/v1', adoptedCount: 1, providerCalls: 0, legacySourceRetained: true });
    expect(legacy.readLegacySnapshot).toHaveBeenCalledTimes(2);
    expect(index.addQuestions).not.toHaveBeenCalled();
    expect(tx.questionCatalogVersion.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ version: 1, snapshot: input })] }));
  });
  it.each(['duplicate', 'changed'])('refuses %s legacy source without marking adoption complete', async kind => {
    tx.questionCatalogState.update.mockResolvedValue({ mode: 'LEGACY' });
    if (kind === 'duplicate') legacy.readLegacySnapshot.mockResolvedValue([{ ...input, createdAt: '2026-10-10' }, { ...input, createdAt: '2026-10-10' }]);
    else legacy.readLegacySnapshot.mockResolvedValueOnce([{ ...input, createdAt: '2026-10-10' }]).mockResolvedValueOnce([{ ...input, answer: 'changed', createdAt: '2026-10-10' }]);
    await expect(scope(() => service.adoptLegacy(true))).rejects.toMatchObject({ status: 409 });
    expect(tx.questionCatalogEntry.createMany).not.toHaveBeenCalled();
    expect(tx.questionCatalogState.update.mock.calls.every(([args]: any) => !args.data.mode)).toBe(true);
  });
  it('returns a durable saved/pending receipt after index failure instead of discarding canonical data', async () => {
    index.addQuestions.mockRejectedValue(new Error('synthetic index unavailable'));
    db.questionCatalogEntry.count.mockResolvedValue(1);
    await expect(scope(() => service.addQuestions([input]))).resolves.toMatchObject({ count: 1, canonicalStatus: 'SAVED', indexStatus: 'PENDING' });
    expect(tx.questionCatalogVersion.create).toHaveBeenCalledTimes(1);
    expect(tx.questionCatalogEntry.updateMany).not.toHaveBeenCalled();
  });
  it('does not retry paid indexing for an identical saved but pending question', async () => {
    const crypto = await import('node:crypto');
    const contentHash = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
    tx.questionCatalogEntry.findUnique.mockResolvedValue({ ...row, contentHash, indexStatus: 'PENDING' });
    db.questionCatalogEntry.count.mockResolvedValue(1);
    await expect(scope(() => service.addQuestions([input]))).resolves.toMatchObject({ canonicalStatus: 'SAVED', indexStatus: 'PENDING' });
    expect(tx.questionCatalogVersion.create).not.toHaveBeenCalled(); expect(index.addQuestions).not.toHaveBeenCalled();
  });
  it('does not call an index if the canonical transaction fails', async () => {
    tx.questionCatalogVersion.create.mockRejectedValue(new Error('synthetic database failure'));
    await expect(scope(() => service.addQuestions([input]))).rejects.toThrow('synthetic database failure');
    expect(index.addQuestions).not.toHaveBeenCalled();
  });
  it('serves initial questions from PostgreSQL without vector/model calls and preserves version identity', async () => {
    const items = await scope(() => service.selectInitial('Frontend', 'P5', 'frontend'));
    expect(items[0]).toMatchObject({ questionId: 'saved', answer: '', catalogVersionId: 'entry:1', catalogContentHash: 'hash' });
    expect(legacy.selectInitial).not.toHaveBeenCalled(); expect(index.search).not.toHaveBeenCalled();
  });
  it('does not send stale/deleted vector text to reranking, and only returns current canonical text', async () => {
    index.search.mockResolvedValue([{ questionId: 'entry:0', answer: 'stale secret', score: 1 }, { questionId: 'deleted:1', answer: 'deleted secret', score: 1 }, { questionId: 'entry:1', question: 'wrong vector text', score: 0.8 }]);
    const hits = await scope(() => service.search('synthetic', { limit: 1 }));
    expect(index.search).toHaveBeenCalledWith('synthetic', expect.objectContaining({ rerank: false, limit: 100 }));
    expect(index.rerankCurrent).toHaveBeenCalledWith('synthetic', [expect.objectContaining({ question: row.question, answer: row.answer })]);
    expect(hits).toHaveLength(1); expect(hits[0].question).toBe(row.question);
  });
  it('blocks semantic search rather than silently omitting pending canonical records', async () => {
    db.questionCatalogEntry.count.mockResolvedValue(1);
    await expect(scope(() => service.search('synthetic'))).rejects.toMatchObject({ status: 503 });
    expect(index.search).not.toHaveBeenCalled();
  });
  it('soft-deletes under the shared row lock even if the vector service is unavailable', async () => {
    await expect(scope(() => service.deleteQuestion('saved'))).resolves.toEqual({ deleted: true });
    expect(tx.questionCatalogEntry.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'catalog-synthetic', questionId: 'saved', deletedAt: null }, data: { deletedAt: expect.any(Date) } }));
  });
});

describe('Legacy adoption snapshot pagination', () => {
  const ok = { status: { error_code: 'Success', code: 0 } };
  let vector: any, client: any;
  beforeEach(() => {
    vector = new QuestionVectorIndexService(new ConfigService(), {} as any);
    vector.ensureCollection = jest.fn().mockResolvedValue(undefined);
    client = { hasCollection: jest.fn().mockResolvedValue({ ...ok, value: true }), query: jest.fn() };
    vector.client = client;
  });
  it('confirms every bounded Strong page and before/after count', async () => {
    const rows = Array.from({ length: 101 }, (_, i) => ({ ...input, id: String(i + 1), questionId: `synthetic-${i}`, createdAt: '2026-10-10' }));
    client.query.mockResolvedValueOnce({ ...ok, data: [{ 'count(*)': '101' }] })
      .mockResolvedValueOnce({ ...ok, data: rows.slice(0, 100) }).mockResolvedValueOnce({ ...ok, data: rows.slice(100) })
      .mockResolvedValueOnce({ ...ok, data: [{ 'count(*)': '101' }] });
    expect(await scope(() => vector.readLegacySnapshot())).toHaveLength(101);
    expect(client.query).toHaveBeenNthCalledWith(3, expect.objectContaining({ offset: 100, limit: 1, consistency_level: 'Strong' }));
  });
  it.each(['short-page', 'duplicate-primary', 'changed-count', 'missing-ack', 'oversized'])('refuses %s instead of adopting a partial source', async kind => {
    const count = kind === 'oversized' ? 1001 : 2;
    const rows = [{ ...input, id: '1' }, { ...input, id: kind === 'duplicate-primary' ? '1' : '2' }];
    client.query.mockResolvedValueOnce({ ...ok, data: [{ 'count(*)': count }] })
      .mockResolvedValueOnce({ ...(kind === 'missing-ack' ? {} : ok), data: kind === 'short-page' ? rows.slice(0, 1) : rows })
      .mockResolvedValueOnce({ ...ok, data: [{ 'count(*)': kind === 'changed-count' ? 1 : 2 }] });
    await expect(scope(() => vector.readLegacySnapshot())).rejects.toThrow();
  });
});
