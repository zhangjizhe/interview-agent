import { ConfigService } from '@nestjs/config';
import { LlmGatewayService } from '../modules/llm/llm.gateway.service';
import { QuotaService } from '../modules/llm/usage/quota.service';
import { QwenProvider } from '../modules/llm/providers/qwen.provider';
import { tenantContext } from '../modules/organizations/tenant-context';
jest.mock('../infra/langfuse/langfuse.service', () => ({ LangfuseService: class {} }));
jest.mock('../infra/prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('openai', () => ({ __esModule: true, default: jest.fn(() => ({})) }));
const scoped = (fn: () => Promise<any>, blocked = false) => tenantContext.run({ organizationId: 'synthetic-org', userId: 'synthetic-user', ...(blocked ? { quotaFailure: { status: 429, code: 'QUOTA_EXHAUSTED', message: 'Synthetic quota exhausted' } } : {}) }, fn);
describe('Auxiliary gateway actual quota boundary without provider network', () => {
  let provider: any, ledger: any, prisma: any, pricing: any, gateway: LlmGatewayService;
  beforeEach(() => {
    provider = { name: 'qwen', embedText: jest.fn().mockResolvedValue({ vector: Array(1024).fill(0), promptTokens: 5 }), rerank: jest.fn().mockResolvedValue({ rankings: [{ index: 0, relevance_score: 1 }], promptTokens: 5 }) };
    ledger = { create: jest.fn().mockResolvedValue({}), aggregate: jest.fn().mockResolvedValue({ _sum: { units: 0 } }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
    const tx = { organization: { update: jest.fn().mockResolvedValue({ plan: { monthlyLlmCalls: 10, maxInputBytes: 10000 } }) }, usageLedger: ledger };
    prisma = { $transaction: jest.fn().mockImplementation(async action => action(tx)), usageLedger: ledger };
    const quota = new QuotaService(prisma, new ConfigService());
    pricing = { version: 'synthetic-prices', estimateCall: jest.fn().mockReturnValue({ status: 'available', totalCny: 0.001 }) };
    gateway = new LlmGatewayService(provider, { name: 'deepseek' } as any, {} as any, {} as any, {} as any, {} as any, quota, pricing);
  });
  it.each(['embedding', 'rerank'])('blocks %s before provider execution for exhausted authenticated quota', async task => {
    await expect(scoped(() => task === 'embedding' ? gateway.embedText('synthetic') : gateway.rerank('synthetic', ['document']), true)).rejects.toMatchObject({ status: 429 });
    expect(provider.embedText).not.toHaveBeenCalled(); expect(provider.rerank).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each([{ status: 'unavailable' }, { status: 'available', totalCny: 0.06 }])('rejects unavailable or excessive cost before quota reservation (%j)', estimate => {
    pricing.estimateCall.mockReturnValue(estimate);
    return scoped(async () => {
      await expect(gateway.embedText('synthetic')).rejects.toMatchObject({ status: 400 });
      expect(prisma.$transaction).not.toHaveBeenCalled(); expect(provider.embedText).not.toHaveBeenCalled();
    });
  });
  it('atomically reserves quota before provider and settles scoped metadata without input content', async () => {
    provider.embedText.mockImplementation(async () => { expect(ledger.create).toHaveBeenCalledTimes(1); return { vector: Array(1024).fill(0), promptTokens: 5 }; });
    await expect(scoped(() => gateway.embedText('secret synthetic document'))).resolves.toHaveLength(1024);
    expect(ledger.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: 'synthetic-org', userId: 'synthetic-user', type: 'LLM_CALL' }), data: expect.objectContaining({ metadata: expect.objectContaining({ state: 'COMPLETED', estimatedCostCny: 0.001 }) }) }));
    expect(JSON.stringify([...ledger.create.mock.calls, ...ledger.updateMany.mock.calls])).not.toContain('secret synthetic document');
  });
  it('keeps unknown usage as unknown cost and does not retry the paid request', async () => {
    provider.embedText.mockResolvedValue({ vector: Array(1024).fill(0) });
    await expect(scoped(() => gateway.embedText('synthetic'))).rejects.toMatchObject({ status: 503 });
    expect(provider.embedText).toHaveBeenCalledTimes(1);
    expect(ledger.updateMany.mock.calls[0][0].data.metadata).toMatchObject({ state: 'COST_UNKNOWN', estimatedCostCny: null, usage: null });
  });
  it('retains a failed request receipt with unknown charges and no automatic replay', async () => {
    provider.embedText.mockRejectedValue(new Error('Synthetic response lost'));
    await expect(scoped(() => gateway.embedText('synthetic'))).rejects.toThrow('Synthetic response lost');
    expect(provider.embedText).toHaveBeenCalledTimes(1);
    expect(ledger.updateMany.mock.calls[0][0].data.metadata).toMatchObject({ state: 'FAILED', estimatedCostCny: null });
  });
  it('fails closed if settlement cannot confirm the receipt after a successful model response', async () => {
    ledger.updateMany.mockResolvedValue({ count: 0 });
    await expect(scoped(() => gateway.embedText('synthetic'))).rejects.toMatchObject({ status: 503 });
    expect(provider.embedText).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid rerank indexes instead of deleting retrieved results silently', async () => {
    provider.rerank.mockResolvedValue({ rankings: [], promptTokens: 5 });
    await expect(scoped(() => gateway.rerank('synthetic', ['document']))).rejects.toMatchObject({ status: 503 });
    expect(provider.rerank).toHaveBeenCalledTimes(1);
    expect(ledger.updateMany.mock.calls[0][0].data.metadata.state).toBe('COMPLETED');
  });
  it('requests explicit float encoding for embeddings to prevent SDK base64 reinterpretation', async () => {
    const create = jest.fn().mockResolvedValue({ data: [{ embedding: Array(1024).fill(0) }], usage: { prompt_tokens: 5 } });
    const qwen = new QwenProvider(new ConfigService());
    (qwen as any).client = { embeddings: { create } };
    await expect(qwen.embedText('synthetic')).resolves.toMatchObject({ vector: expect.any(Array), promptTokens: 5 });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ encoding_format: 'float', dimensions: 1024 }));
  });
  it('bounds reranker HTTP duration with an abort signal', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ output: { results: [] }, usage: { total_tokens: 1 } }) } as any);
    try {
      const qwen = new QwenProvider(new ConfigService());
      await qwen.rerank('synthetic', ['document']);
      expect(fetchMock.mock.calls[0][1]?.signal).toBeDefined();
    } finally { fetchMock.mockRestore(); }
  });
});
