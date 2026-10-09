import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QuestionBankService } from '../modules/interview/services/question-bank.service';
import { tenantContext } from '../modules/organizations/tenant-context';
jest.mock('@zilliz/milvus2-sdk-node', () => ({ MilvusClient: jest.fn(() => ({})), ConsistencyLevelEnum: { Strong: 'Strong' } }));
jest.mock('../modules/llm/llm.gateway.service', () => ({ LlmGatewayService: class {} }));
jest.mock('openai', () => ({ __esModule: true, default: jest.fn(() => ({})) }));
const ok = { status: { error_code: 'Success', code: 0 } };
const item = { questionId: 'synthetic-question', position: 'Engineering', level: 'P5', category: 'Design', question: 'Synthetic question', answer: 'Synthetic evidence', tags: '' };
const scope = (fn: () => Promise<any>, blocked = false) => tenantContext.run({ organizationId: 'synthetic-org', userId: 'synthetic-user', ...(blocked ? { quotaFailure: { status: 429, code: 'QUOTA_EXHAUSTED', message: 'Synthetic quota exhausted' } } : {}) }, fn);
/** All providers/vector RPCs are mocked; failure assertions never access external services. */
describe('Question bank independent cost and persistence boundaries', () => {
  let service: any, storage: any, gateway: any;
  beforeEach(() => {
    gateway = { embedText: jest.fn().mockResolvedValue([1]), rerank: jest.fn().mockResolvedValue([{ index: 0, relevance_score: 1 }]) };
    service = new QuestionBankService(new ConfigService(), gateway);
    service.ensureCollection = jest.fn().mockResolvedValue(undefined);
    storage = { insert: jest.fn().mockResolvedValue({ ...ok, insert_cnt: 1, IDs: { int_id: { data: ['1'] } } }),
      flush: jest.fn().mockResolvedValue({ ...ok, coll_segIDs: {} }), getFlushState: jest.fn().mockResolvedValue({ ...ok, flushed: true }),
      delete: jest.fn().mockResolvedValue(ok), query: jest.fn().mockResolvedValue({ ...ok, data: [] }),
      hybridSearch: jest.fn().mockResolvedValue({ ...ok, results: [{ ...item, id: '1', score: 1 }] }) };
    service.client = storage;
  });
  afterEach(() => { jest.restoreAllMocks(); });
  it('delegates vector generation to the metered gateway before storage', async () => {
    gateway.embedText.mockImplementation(async () => { expect(storage.insert).not.toHaveBeenCalled(); return [1]; });
    await expect(scope(() => service.addQuestions([item]))).resolves.toEqual({ count: 1 });
    expect(gateway.embedText).toHaveBeenCalledTimes(1);
  });
  it.each([
    { question: '题'.repeat(1000), answer: '答'.repeat(1700), tags: 'tag' },
    { question: 'q'.repeat(1000), answer: 'a'.repeat(6994), tags: 'tag' },
  ])('rejects combined UTF-8 content above 8000 bytes before collection or model work', async content => {
    expect(Buffer.byteLength(`${content.question}\n\n${content.answer}\n\n${content.tags}`, 'utf8')).toBeGreaterThan(8000);
    await expect(scope(() => service.addQuestions([{ ...item, ...content }]))).rejects.toMatchObject({ status: 400 });
    expect(service.ensureCollection).not.toHaveBeenCalled();
    expect(gateway.embedText).not.toHaveBeenCalled();
    expect(storage.insert).not.toHaveBeenCalled();
  });
  it('delegates the complete 8000-byte combined text including its tail without silent truncation', async () => {
    const boundary = { ...item, question: 'q'.repeat(1000), answer: 'a'.repeat(6993), tags: 'tag' };
    const fullText = `${boundary.question}\n\n${boundary.answer}\n\n${boundary.tags}`;
    expect(Buffer.byteLength(fullText, 'utf8')).toBe(8000);
    await expect(scope(() => service.addQuestions([boundary]))).resolves.toEqual({ count: 1 });
    expect(gateway.embedText).toHaveBeenCalledWith(fullText);
    expect(storage.insert.mock.calls[0][0].data[0].text).toBe(fullText);
  });
  it('does not report deletion success for a resolved RPC failure status', async () => {
    storage.delete.mockResolvedValue({ status: { error_code: 'UnexpectedError', code: 1 } });
    await expect(scope(() => service.deleteQuestion(item.questionId))).resolves.toMatchObject({ deleted: false });
  });
  it('does not report deletion confirmed while strong readback still finds the target', async () => {
    storage.query.mockResolvedValue({ ...ok, data: [{ ...item, id: '1' }] });
    await expect(scope(() => service.deleteQuestion(item.questionId))).resolves.toMatchObject({ deleted: false });
  });
  it('does not turn a failed list RPC into an empty successful list', async () => {
    storage.query.mockResolvedValue({ status: { error_code: 'UnexpectedError', code: 1 }, data: [] });
    await expect(scope(() => service.list())).rejects.toThrow();
  });
  it('rejects a failed search RPC even if it contains apparently usable result rows', async () => {
    storage.hybridSearch.mockResolvedValue({ status: { error_code: 'UnexpectedError', code: 1 }, results: [{ ...item, id: '1', score: 1 }] });
    await expect(scope(() => service.search('synthetic', { rerank: false }))).rejects.toThrow();
  });
  it('rejects a missing list acknowledgement instead of reporting an empty success', async () => {
    storage.query.mockResolvedValue({ data: [] });
    await expect(scope(() => service.list())).rejects.toThrow();
  });
  it.each([{ results: [] }, { status: { error_code: 'UnexpectedError', code: 1 }, results: [] }])('rejects unconfirmed dense fallback RPC (%j)', async result => {
    storage.hybridSearch.mockResolvedValue({ ...ok, results: [] });
    storage.search = jest.fn().mockResolvedValue(result);
    await expect(scope(() => service.search('synthetic', { rerank: false }))).rejects.toThrow();
    expect(storage.search).toHaveBeenCalledTimes(1);
  });
  it('propagates a metered rerank failure rather than showing a false empty success', async () => {
    gateway.rerank.mockRejectedValue(new ServiceUnavailableException('Invalid rankings'));
    await expect(service.rerankResults('synthetic', [{ ...item, id: '1', score: 1 }])).rejects.toThrow('Invalid rankings');
  });
});
