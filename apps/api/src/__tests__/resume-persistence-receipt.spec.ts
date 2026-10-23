jest.mock('@zilliz/milvus2-sdk-node', () => ({ MilvusClient: jest.fn(() => ({})), ConsistencyLevelEnum: { Strong: 0 } }));
jest.mock('../modules/llm/llm.gateway.service', () => ({ LlmGatewayService: class {} }));
import { ConfigService } from '@nestjs/config';
import { ResumeController } from '../modules/interview/controllers/resume.controller';
import { ResumeParserService } from '../modules/interview/services/resume-parser.service';
import { ResumeRAGService } from '../modules/interview/services/resume-rag.service';

const ok = { status: { error_code: 'Success', code: 0 } };
const file = { originalname: 'synthetic.txt', mimetype: 'text/plain', buffer: Buffer.from('Synthetic Candidate\nTypeScript Node.js\nSynthetic project'), size: 70 };
const unknown = '简历保存结果尚未确认，请刷新简历列表核验后再重试。';

describe('Resume persistence receipt: independent offline contracts', () => {
  let service: any, storage: any, parsed: any;
  beforeEach(async () => {
    parsed = await new ResumeParserService().parse(file, 'Backend');
    service = new ResumeRAGService(new ConfigService({ qwen: { apiKey: 'synthetic-not-used' } }));
    service.ensureCollection = jest.fn().mockResolvedValue(undefined);
    service.embedText = jest.fn().mockResolvedValue(Array(1024).fill(0));
    storage = {
      insert: jest.fn().mockResolvedValue({ ...ok, insert_cnt: 1, IDs: { int_id: { data: ['42'] } } }),
      query: jest.fn().mockImplementation(async () => ({ ...ok, data: [{ id: '42', ...storage.insert.mock.calls[0][0].data[0] }] })),
    };
    service.client = storage;
  });
  const ingest = () => service.ingestResume('synthetic-owner', 'Backend', parsed);

  it('controller fails closed with safe503 and never generates personalized questions after unknown storage', async () => {
    const gateway = { chat: jest.fn().mockResolvedValue({ content: '{"questions":[]}' }) };
    const rag = { ingestResume: jest.fn().mockRejectedValue(new Error('synthetic storage failure')) };
    const controller = new ResumeController(new ResumeParserService(), rag as any, gateway as any, {} as any);
    let failure: any;
    try { await controller.uploadResume(file, 'Backend', { user: { userId: 'synthetic-owner' } }); } catch (error) { failure = error; }
    expect(gateway.chat).not.toHaveBeenCalled();
    expect(failure?.getStatus()).toBe(503);
    expect(failure?.message).toBe(unknown);
  });

  it.each([
    ['non-Success', { status: { error_code: 'UnexpectedError', code: 1 }, insert_cnt: 1, IDs: { int_id: { data: ['42'] } } }],
    ['missing status', { insert_cnt: 1, IDs: { int_id: { data: ['42'] } } }],
    ['zero count', { ...ok, insert_cnt: 0, IDs: { int_id: { data: ['42'] } } }],
    ['missing count', { ...ok, IDs: { int_id: { data: ['42'] } } }],
    ['missing IDs', { ...ok, insert_cnt: 1 }],
    ['sparse IDs', { ...ok, insert_cnt: 1, IDs: { int_id: { data: Array(1) } } }],
    ['unsafe number', { ...ok, insert_cnt: 1, IDs: { int_id: { data: [9007199254740992] } } }],
    ['int64 overflow', { ...ok, insert_cnt: 1, IDs: { int_id: { data: ['9223372036854775808'] } } }],
    ['fraction ID', { ...ok, insert_cnt: 1, IDs: { int_id: { data: ['42.5'] } } }],
  ])('rejects insert acknowledgement: %s', async (_label, receipt) => {
    storage.insert.mockResolvedValue(receipt);
    await expect(ingest()).rejects.toThrow();
    expect(storage.insert).toHaveBeenCalledTimes(1);
  });

  it.each(['throw', 'missing status', 'non-Success', 'empty', 'wrong id', 'wrong user', 'wrong payload', 'duplicate'])('rejects unconfirmed Strong read: %s', async mode => {
    storage.query.mockImplementation(async () => {
      if (mode === 'throw') throw new Error('Synthetic read unavailable');
      const row = { id: '42', ...storage.insert.mock.calls[0][0].data[0] };
      if (mode === 'wrong id') row.id = '43';
      if (mode === 'wrong user') row.userId = 'different-owner';
      if (mode === 'wrong payload') row.summary = 'different summary';
      return { ...(mode === 'missing status' ? {} : mode === 'non-Success' ? { status: { error_code: 'UnexpectedError', code: 1 } } : ok), data: mode === 'empty' ? [] : mode === 'duplicate' ? [row, row] : [row] };
    });
    await expect(ingest()).rejects.toThrow();
    expect(storage.insert).toHaveBeenCalledTimes(1);
  });

  it('resolves only after Strong read verifies the exact inserted owner and payload', async () => {
    await expect(ingest()).resolves.toBeUndefined();
    expect(storage.insert).toHaveBeenCalledTimes(1);
    expect(storage.query).toHaveBeenCalledTimes(1);
    const request = storage.query.mock.calls[0][0];
    expect(request.consistency_level).toBe(0);
    expect(request.filter ?? request.expr).toMatch(/42/);
    expect(request.filter ?? request.expr).toContain('synthetic-owner');
  });

  it.each([
    ['missing status', { data: [] }],
    ['non-Success', { status: { error_code: 'UnexpectedError', code: 1 }, data: [] }],
    ['missing data', ok],
    ['null data', { ...ok, data: null }],
    ['object data', { ...ok, data: {} }],
  ])('public owner read rejects an unconfirmed response: %s', async (_label, response) => {
    storage.query.mockResolvedValue(response);
    await expect(service.searchByUser('synthetic-owner', 3)).rejects.toThrow();
    expect(service.embedText).not.toHaveBeenCalled();
  });

  it('public owner read uses Strong consistency and preserves cleaning and latest-first order', async () => {
    storage.query.mockResolvedValue({ ...ok, data: [
      { name: 'Older synthetic', position: 'Backend', summary: 'Older', skills: 'TypeScript,Node', createdAt: '2026-10-01T00:00:00.000Z' },
      { name: 'Newer synthetic', position: 'Backend', summary: 'Newer', skills: 'TypeScript、Node', createdAt: '2026-10-02T00:00:00.000Z' },
    ] });
    const rows = await service.searchByUser('synthetic-owner', 3);
    expect(rows.map((row: any) => row.name)).toEqual(['Newer synthetic', 'Older synthetic']);
    expect(rows[1].skills).toBe('TypeScript、Node');
    expect(storage.query.mock.calls[0][0]).toEqual(expect.objectContaining({ consistency_level: 0, limit: 3 }));
    expect(storage.query.mock.calls[0][0].filter).toContain('synthetic-owner');
    expect(service.embedText).not.toHaveBeenCalled();
  });

  it('bounds actual SDK schema preflight even when its describe request omits the insert deadline', async () => {
    // A child avoids the isolated test module's intentionally mocked SDK index.
    const { spawnSync } = require('node:child_process');
    const actual = spawnSync(process.execPath, ['-e', `
      const { MilvusClient } = require(process.argv[1]);
      let described;
      const receiver = { _insert: MilvusClient.prototype._insert,
        describeCollection: request => { described = request; return new Promise(() => {}); } };
      MilvusClient.prototype.insert.call(receiver, { collection_name: 'resumes', timeout: 5000, data: [{ userId: 'synthetic-owner' }] }).catch(() => {});
      setImmediate(() => process.stdout.write(JSON.stringify(described)));
    `, require.resolve('@zilliz/milvus2-sdk-node')], { encoding: 'utf8', timeout: 5000 });
    expect(actual.status).toBe(0);
    const described = JSON.parse(actual.stdout);
    expect(described.collection_name).toBe('resumes'); expect(described.timeout).toBeUndefined();
    let rejectDescribe!: (error: Error) => void;
    storage.insert.mockImplementation(() => new Promise((_resolve, reject) => { rejectDescribe = reject; }));
    jest.useFakeTimers();
    try {
      let outcome = 'pending';
      const request = ingest().then(() => { outcome = 'resolved'; }, () => { outcome = 'rejected'; });
      await jest.advanceTimersByTimeAsync(5001);
      expect(outcome).toBe('rejected');
      expect(storage.query).not.toHaveBeenCalled();
      rejectDescribe(new Error('Synthetic late schema failure'));
      await request; await Promise.resolve();
      expect(storage.insert).toHaveBeenCalledTimes(1);
    } finally { rejectDescribe?.(new Error('Synthetic cleanup')); jest.useRealTimers(); }
  });

  it('bounds public owner read including transports that ignore their SDK deadline', async () => {
    let release!: (value: any) => void;
    storage.query.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    jest.useFakeTimers();
    try {
      let outcome = 'pending';
      const request = service.searchByUser('synthetic-owner').then(() => { outcome = 'resolved'; }, () => { outcome = 'rejected'; });
      await jest.advanceTimersByTimeAsync(5001);
      expect(outcome).toBe('rejected');
      release({ ...ok, data: [] }); await request;
      expect(outcome).toBe('rejected'); expect(storage.query).toHaveBeenCalledTimes(1);
    } finally { release?.({ ...ok, data: [] }); jest.useRealTimers(); }
  });

  it('keeps a late successful insert unknown without continuing readback or retrying', async () => {
    let release!: (value: any) => void;
    storage.insert.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    jest.useFakeTimers();
    try {
      let outcome = 'pending';
      const request = ingest().then(() => { outcome = 'resolved'; }, () => { outcome = 'rejected'; });
      await jest.advanceTimersByTimeAsync(5001); expect(outcome).toBe('rejected');
      release({ ...ok, insert_cnt: 1, IDs: { int_id: { data: ['42'] } } });
      await request; await jest.advanceTimersByTimeAsync(1);
      expect(outcome).toBe('rejected'); expect(storage.query).not.toHaveBeenCalled();
      expect(storage.insert).toHaveBeenCalledTimes(1);
    } finally { release?.({ ...ok, insert_cnt: 1, IDs: { int_id: { data: ['42'] } } }); jest.useRealTimers(); }
  });

  it('requests explicit float encoding for the actual embedding method', async () => {
    const vector = Array(1024).fill(0);
    const create = jest.fn().mockResolvedValue({ data: [{ embedding: vector }] });
    service.embedder = { embeddings: { create } };
    await expect(ResumeRAGService.prototype['embedText'].call(service, 'Synthetic input')).resolves.toEqual(vector);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ encoding_format: 'float' }));
  });

  it.each([['wrong dimension', Array(256).fill(0)], ['sparse', Array(1024)], ['nonfinite', [...Array(1023).fill(0), Infinity]]])('rejects invalid embedding %s before storage', async (_label, vector) => {
    service.embedder = { embeddings: { create: jest.fn().mockResolvedValue({ data: [{ embedding: vector }] }) } };
    await expect(ResumeRAGService.prototype['embedText'].call(service, 'Synthetic input')).rejects.toThrow('RESUME_EMBEDDING_INVALID');
    expect(storage.insert).not.toHaveBeenCalled();
  });
});
