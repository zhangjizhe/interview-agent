jest.mock('@zilliz/milvus2-sdk-node', () => ({ MilvusClient: jest.fn(() => ({})), ConsistencyLevelEnum: { Strong: 'Strong' } }));
jest.mock('../modules/llm/llm.gateway.service', () => ({ LlmGatewayService: class {} }));
import { ConfigService } from '@nestjs/config';
import { QuestionBankService } from '../modules/interview/services/question-bank.service';
import { DynamicTaskQueueService } from '../modules/interview/services/dynamic-task-queue.service';
import { tenantContext } from '../modules/organizations/tenant-context';

const ok = { status: { error_code: 'Success', code: 0 } };
const scope = (work: () => Promise<any>, organizationId = 'synthetic-initial-owner') => tenantContext.run({ organizationId }, work);
const row = (questionId: string, extra = {}) => ({ questionId, position: 'Frontend Engineer', category: 'frontend', level: 'P5', question: `Synthetic React constraint ${questionId}`, createdAt: '2026-10-24', ...extra });
describe('Initial question selection is an owned stored-row read', () => {
  let bank: any, gateway: any, storage: any, queue: DynamicTaskQueueService;
  beforeEach(() => {
    gateway = { chat: jest.fn(), embedText: jest.fn(), rerank: jest.fn() };
    bank = new QuestionBankService(new ConfigService(), gateway);
    bank.ensureCollection = jest.fn().mockResolvedValue(undefined);
    storage = { query: jest.fn().mockResolvedValue({ ...ok, data: [row('saved-react')] }) }; bank.client = storage;
    queue = new DynamicTaskQueueService({} as any, gateway, bank);
  });
  afterEach(() => jest.useRealTimers());

  it('reuses a real saved question ID, records origin and makes no model call', async () => {
    const tasks = await scope(() => queue.prepareInitialTasks('synthetic-session', 'Frontend Engineer', 'P5', { mode: 'FULL_SIMULATION' }));
    expect(tasks).toHaveLength(1); expect(tasks[0].question).toBe(row('saved-react').question);
    expect(JSON.parse(tasks[0].context as string)).toMatchObject({ questionId: 'saved-react', questionSelectionSource: 'stored-category-level/v1' });
    expect(storage.query).toHaveBeenCalledWith(expect.objectContaining({ consistency_level: 'Strong', filter: 'category == "frontend" and level == "P5"', limit: 100 }));
    expect(gateway.chat).not.toHaveBeenCalled(); expect(gateway.embedText).not.toHaveBeenCalled(); expect(gateway.rerank).not.toHaveBeenCalled();
  });
  it('does not use rows from another role or level or empty/malformed questions', async () => {
    storage.query.mockResolvedValue({ ...ok, data: [row('other-level', { level: 'P4' }), row('other-role', { category: 'backend' }), row('blank', { question: '  ' }), row('', {}), row('good')] });
    const found = await scope(() => bank.selectInitial('Frontend Engineer', 'P5', 'frontend'));
    expect(found.map((item: any) => item.questionId)).toEqual(['good']);
  });
  it('prefers exact position within the bounded matching role/level window', async () => {
    storage.query.mockResolvedValue({ ...ok, data: [row('a-other-position', { position: 'Other frontend role' }), row('z-exact')] });
    const found = await scope(() => bank.selectInitial('Frontend Engineer', 'P5', 'frontend'));
    expect(found.map((item: any) => item.questionId)).toEqual(['z-exact', 'a-other-position']);
    expect(found.every((item: any) => item.answer === '')).toBe(true);
  });
  it('uses distinct tenant collections and does not fall back to the default collection', async () => {
    await scope(() => bank.selectInitial('Frontend Engineer', 'P5', 'frontend'));
    await scope(() => bank.selectInitial('Frontend Engineer', 'P5', 'frontend'), 'synthetic-other-owner');
    const names = storage.query.mock.calls.map((call: any) => call[0].collection_name);
    expect(names[0]).not.toBe(names[1]); expect(names.every((name: string) => name.startsWith('question_bank_v2_'))).toBe(true);
    await expect(bank.selectInitial('Frontend Engineer', 'P5', 'frontend')).rejects.toThrow('Organization context required');
    expect(storage.query).toHaveBeenCalledTimes(2);
  });
  it.each([
    ['no matches', { ...ok, data: [] }, 'no-compatible-stored-question'],
    ['RPC failure', { status: { error_code: 'UnexpectedError', code: 1 }, data: [] }, 'stored-read-unconfirmed'],
    ['missing rows', { ...ok }, 'stored-read-unconfirmed'],
  ])('marks %s as local fallback instead of a saved-bank hit', async (_label, response, reason) => {
    storage.query.mockResolvedValue(response);
    const tasks = await scope(() => queue.prepareInitialTasks('synthetic-session', 'Frontend Engineer', 'P5', { mode: 'FULL_SIMULATION' }));
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((task: any) => JSON.parse(task.context).questionSelectionSource === `local-fallback/${reason}/v1`)).toBe(true);
    expect(gateway.embedText).not.toHaveBeenCalled(); expect(gateway.rerank).not.toHaveBeenCalled();
  });
  it('bounds the entire lazy initialization/read wait and ignores a late result', async () => {
    jest.useFakeTimers(); let release: (value: any) => void;
    bank.ensureCollection = jest.fn(() => new Promise(resolve => { release = resolve; }));
    const pending = scope(() => queue.prepareInitialTasks('synthetic-session', 'Frontend Engineer', 'P5', { mode: 'FULL_SIMULATION' }));
    await jest.advanceTimersByTimeAsync(5000);
    const tasks = await pending;
    expect(JSON.parse(tasks[0].context as string).questionSelectionSource).toBe('local-fallback/stored-read-unconfirmed/v1');
    release!(undefined); await Promise.resolve();
    expect(tasks[0].question).not.toBe(row('saved-react').question);
    expect(gateway.embedText).not.toHaveBeenCalled();
  });
});
