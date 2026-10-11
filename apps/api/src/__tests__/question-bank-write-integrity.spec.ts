jest.mock('@zilliz/milvus2-sdk-node', () => ({ MilvusClient: jest.fn(() => ({})), ConsistencyLevelEnum: { Strong: 'Strong' } }));
jest.mock('../modules/llm/llm.gateway.service', () => ({ LlmGatewayService: class {} }));
import { ConfigService } from '@nestjs/config';
import { QuestionBankService } from '../modules/interview/services/question-bank.service';
import { tenantContext } from '../modules/organizations/tenant-context';

const ok = { status: { error_code: 'Success', code: 0 } };
const item = { questionId: 'synthetic-write', position: 'Engineering', level: 'P5', category: 'Design', question: 'Synthetic question', answer: 'Synthetic answer', tags: '' };
const scope = (fn: () => Promise<any>) => tenantContext.run({ organizationId: 'synthetic-integrity' }, fn);
// Independent failure contracts: no network, provider or business storage is accessed.
describe('Question bank write acknowledgement and compensation integrity', () => {
  let service: any, storage: any, gateway: any;
  beforeEach(() => {
    gateway = { embedText: jest.fn().mockResolvedValue([1]) };
    service = new QuestionBankService(new ConfigService(), gateway);
    service.ensureCollection = jest.fn().mockResolvedValue(undefined);
    storage = {
      insert: jest.fn().mockResolvedValue({ ...ok, insert_cnt: 1, IDs: { int_id: { data: ['42'] } } }),
      flush: jest.fn().mockResolvedValue({ ...ok, coll_segIDs: {} }),
      getFlushState: jest.fn().mockResolvedValue({ ...ok, flushed: true }),
      delete: jest.fn().mockResolvedValue(ok), query: jest.fn().mockResolvedValue({ ...ok, data: [] }),
    };
    service.client = storage;
  });
  const run = (count = 1) => scope(() => service.addQuestions(Array.from({ length: count }, (_, i) => ({ ...item, questionId: `${item.questionId}-${i}` }))));
  it.each([
    ['sparse', Array(1), 1],
    ['duplicate', ['42', '42'], 2],
    ['int64 overflow', ['9223372036854775808'], 1],
    ['noninteger string', ['42.5'], 1],
    ['unsafe number', [9007199254740992], 1],
    ['canonical duplicate', ['042', '42'], 2],
    ['coerced object', [{ toString: () => '42' }], 1],
  ])('rejects %s IDs without compensating through unverifiable primary keys', async (_name, ids, count) => {
    storage.insert.mockResolvedValue({ ...ok, insert_cnt: count, IDs: { int_id: { data: ids } } });
    await expect(run(count as number)).rejects.toThrow('QUESTION_WRITE_UNCONFIRMED');
    expect(storage.delete).not.toHaveBeenCalled();
    expect(storage.insert).toHaveBeenCalledTimes(1);
    expect(gateway.embedText).toHaveBeenCalledTimes(count as number);
  });
  it.each([
    ['remaining row', { ...ok, data: [{ id: '42' }] }],
    ['RPC error', { status: { error_code: 'UnexpectedError', code: 1 }, data: [] }],
    ['missing status', { data: [] }],
    ['missing rows', { ...ok }],
  ])('keeps compensation unknown for %s despite delete and flush acknowledgements', async (_name, response) => {
    storage.flush.mockRejectedValueOnce(new Error('synthetic initial flush failure'));
    storage.query.mockResolvedValue(response);
    await expect(run()).rejects.toThrow('QUESTION_WRITE_UNCONFIRMED');
    expect(storage.query).toHaveBeenCalledWith(expect.objectContaining({ consistency_level: 'Strong', filter: 'id in [42]' }));
    expect(storage.insert).toHaveBeenCalledTimes(1);
    expect(gateway.embedText).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledTimes(1);
  });
  it('reports rolled back only after successful Strong empty readback of the new primary key', async () => {
    storage.flush.mockRejectedValueOnce(new Error('synthetic initial flush failure'));
    await expect(run()).rejects.toThrow('QUESTION_WRITE_ROLLED_BACK');
    expect(storage.query).toHaveBeenCalledWith(expect.objectContaining({ consistency_level: 'Strong', filter: 'id in [42]' }));
    expect(storage.delete).toHaveBeenCalledWith(expect.objectContaining({ filter: 'id in [42]' }));
    expect(storage.insert).toHaveBeenCalledTimes(1);
    expect(gateway.embedText).toHaveBeenCalledTimes(1);
  });
  it('accepts the exact signed int64 maximum without number conversion', async () => {
    storage.insert.mockResolvedValue({ ...ok, insert_cnt: 1, IDs: { int_id: { data: ['9223372036854775807'] } } });
    await expect(run()).resolves.toEqual({ count: 1 });
    expect(storage.delete).not.toHaveBeenCalled();
  });
  it('keeps total rollback unknown when only one of two written primary keys is acknowledged', async () => {
    storage.insert.mockResolvedValue({ ...ok, insert_cnt: 2, IDs: { int_id: { data: ['42'] } } });
    await expect(run(2)).rejects.toThrow('QUESTION_WRITE_UNCONFIRMED');
    expect(storage.delete).toHaveBeenCalledWith(expect.objectContaining({ filter: 'id in [42]' }));
    expect(storage.insert).toHaveBeenCalledTimes(1);
    expect(gateway.embedText).toHaveBeenCalledTimes(2);
  });
  it('keeps rollback unknown if Strong readback throws', async () => {
    storage.flush.mockRejectedValueOnce(new Error('synthetic initial flush failure'));
    storage.query.mockRejectedValue(new Error('synthetic read failure'));
    await expect(run()).rejects.toThrow('QUESTION_WRITE_UNCONFIRMED');
    expect(storage.delete).toHaveBeenCalledTimes(1);
    expect(storage.insert).toHaveBeenCalledTimes(1);
    expect(gateway.embedText).toHaveBeenCalledTimes(1);
  });

});
