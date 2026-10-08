jest.mock('@zilliz/milvus2-sdk-node', () => ({ MilvusClient: jest.fn(() => ({})) }));
jest.mock('../modules/llm/llm.gateway.service', () => ({ LlmGatewayService: class {} }));
jest.mock('openai', () => ({ __esModule: true, default: jest.fn(() => ({})) }));
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QuestionBatchDto, QuestionSearchDto, GenerateQuestionsDto } from '../modules/interview/dto/question-bank.dto';
import { QuestionBankService } from '../modules/interview/services/question-bank.service';
import { tenantContext } from '../modules/organizations/tenant-context';

const question = { questionId: 'fixture-one', position: 'Engineering', question: 'Explain one tradeoff', answer: 'Synthetic evidence', tags: [] };
const pipe = new ValidationPipe({ transform: true, whitelist: true });
const valid = (input: unknown, metatype: any) => pipe.transform(input, { type: 'body', metatype });
describe('question input and bounded writes', () => {
  it('rejects malformed nested fields, oversized batches and unbounded numeric query values', async () => {
    for (const questions of [[], Array(21).fill(question), [{ ...question, tags: 'invalid' }], [{ ...question, answer: '测'.repeat(3000) }]]) {
      await expect(valid({ questions }, QuestionBatchDto)).rejects.toMatchObject({ status: 400 });
    }
    for (const limit of ['NaN', '-1', '0', '101', '1.5']) await expect(valid({ limit }, QuestionSearchDto)).rejects.toMatchObject({ status: 400 });
    await expect(valid({ limit: '20' }, QuestionSearchDto)).resolves.toMatchObject({ limit: 20 });
    await expect(valid({ text: 'fixture '.repeat(10), count: 100000 }, GenerateQuestionsDto)).rejects.toMatchObject({ status: 400 });
  });
  let service: any, client: any;
  const ok = { status: { error_code: 'Success', code: 0 } };
  const scope = (fn: () => any) => tenantContext.run({ organizationId: 'fixture-org' }, fn);
  beforeEach(() => {
    service = new QuestionBankService(new ConfigService(), {} as any);
    client = { insert: jest.fn().mockResolvedValue({ ...ok, insert_cnt: '1', IDs: { int_id: { data: ['9007199254740993'] } } }),
      flush: jest.fn().mockResolvedValue({ ...ok, coll_segIDs: {} }), getFlushState: jest.fn().mockResolvedValue({ ...ok, flushed: true }), delete: jest.fn().mockResolvedValue(ok) };
    service.client = client; service.ensureCollection = jest.fn().mockResolvedValue(undefined);
    service.embedText = jest.fn().mockResolvedValue([1]);
  });
  const item = { ...question, level: 'P5', category: 'Design', tags: '' };
  it('rejects internal invalid input before network work and duplicate IDs before embedding', async () => {
    await expect(scope(() => service.addQuestions([item, item]))).rejects.toMatchObject({ status: 400 });
    await expect(scope(() => service.addQuestions([{ ...item, question: ' ' }]))).rejects.toMatchObject({ status: 400 });
    expect(service.ensureCollection).not.toHaveBeenCalled(); expect(service.embedText).not.toHaveBeenCalled();
  });
  it('performs at most two embeddings concurrently and never inserts a partially embedded batch', async () => {
    let active = 0, peak = 0;
    service.embedText.mockImplementation(async () => { active++; peak = Math.max(peak, active); await new Promise(done => setTimeout(done, 1)); active--; return [1]; });
    client.insert.mockResolvedValue({ ...ok, insert_cnt: '5', IDs: { int_id: { data: ['1', '2', '3', '4', '5'] } } });
    const items = Array.from({ length: 5 }, (_, index) => ({ ...item, questionId: `fixture-${index}` }));
    await expect(scope(() => service.addQuestions(items))).resolves.toEqual({ count: 5 });
    expect(peak).toBe(2);
    client.insert.mockClear(); service.embedText.mockRejectedValueOnce(new Error('provider failed'));
    await expect(scope(() => service.addQuestions(items))).rejects.toThrow('provider failed');
    expect(client.insert).not.toHaveBeenCalled();
  });
  it('confirms flush and compensates only newly inserted primary IDs on storage failure', async () => {
    client.flush.mockRejectedValueOnce(new Error('flush failed'));
    await expect(scope(() => service.addQuestions([item]))).rejects.toThrow('QUESTION_WRITE_ROLLED_BACK');
    expect(client.delete).toHaveBeenCalledWith(expect.objectContaining({ filter: 'id in [9007199254740993]' }));
    client.flush.mockRejectedValueOnce(new Error('flush failed')); client.delete.mockRejectedValueOnce(new Error('delete failed'));
    await expect(scope(() => service.addQuestions([item]))).rejects.toThrow('QUESTION_WRITE_UNCONFIRMED');
  });
  it('does not turn an RPC failure status or missing acknowledgement into success', async () => {
    client.insert.mockResolvedValue({ status: { error_code: 'UnexpectedError' } });
    await expect(scope(() => service.addQuestions([item]))).rejects.toThrow('QUESTION_WRITE_UNCONFIRMED');
    expect(client.delete).not.toHaveBeenCalled();
  });
});
