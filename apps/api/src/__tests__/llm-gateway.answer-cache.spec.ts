jest.mock('../infra/langfuse/langfuse.service', () => ({ LangfuseService: class {} }));
import { LlmGatewayService } from '../modules/llm/llm.gateway.service';
import { PromptCacheInterceptor } from '../modules/llm/cache/prompt-cache.interceptor';
import { SemanticCacheService } from '../modules/llm/cache/semantic-cache.service';
import { tenantContext } from '../modules/organizations/tenant-context';
import type { ChatParams } from '../modules/llm/providers/types';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const initial = () => ({
  messages: [{ role: 'system' as const, content: 'policy-v1' }, { role: 'user' as const, content: 'same question' }],
  interviewId: 'interview-a', semanticCacheType: 'interview_question' as const, maxTokens: 50,
});
describe.each(['chat', 'stream'] as const)('complete request answer cache: %s', mode => {
  let gateway: LlmGatewayService, primary: any, fallback: any, quota: any, redis: any, metrics: any;
  let limits: any;
  beforeEach(() => {
    const entries = new Map();
    redis = { get: jest.fn(async k => entries.get(k) ?? null), set: jest.fn(async (k, v) => { entries.set(k, v); }) };
    const config: any = { get: () => undefined };
    const cache = new SemanticCacheService(config, redis); cache.onModuleInit();
    limits = { planId: 'plan-a', maxInputBytes: 64000, maxOutputTokens: 100, monthlyLlmCalls: 100 };
    quota = { getAnswerCacheLimits: jest.fn(async () => ({ ...limits })), reserveLlm: jest.fn(async p => ({ ...p, maxTokens: Math.min(p.maxTokens ?? limits.maxOutputTokens, limits.maxOutputTokens) })) };
    metrics = { recordLlmCall: jest.fn().mockResolvedValue(undefined) };
    const provider = (name: string) => ({ name, defaultModel: `${name}-v1`,
      chat: jest.fn(async () => ({ content: `${name}-answer`, provider: name, model: `${name}-v1`, finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 5 } })),
      streamChat: jest.fn(async function* () { yield { content: `${name}-answer` }; yield { finishReason: 'stop' }; }),
    });
    primary = provider('qwen'); fallback = provider('deepseek');
    gateway = new LlmGatewayService(primary, fallback, {} as any, new PromptCacheInterceptor(config, metrics), cache, metrics, quota);
  });
  async function run(params: ReturnType<typeof initial> | any = initial(), org = 'org-a', user: string | null = 'user-a', preferred: any = 'qwen') {
    return tenantContext.run({ organizationId: org, userId: user ?? undefined }, async () => {
      let answer: string;
      if (mode === 'chat') answer = (await gateway.chat(params, preferred)).content;
      else {
        answer = '';
        for await (const c of gateway.streamChat(params, preferred)) answer += c.content ?? '';
      }
      await tick(); return answer;
    });
  }
  const calls = () => mode === 'chat' ? primary.chat : primary.streamChat;
  it('reuses only identical complete requests and records zero-token hits', async () => {
    expect(await run()).toBe('qwen-answer');
    expect(await run({ ...initial(), traceId: 'new-trace', userId: 'spoofed' })).toBe('qwen-answer');
    expect(calls()).toHaveBeenCalledTimes(1);
    expect(quota.reserveLlm).toHaveBeenCalledTimes(1);
    expect(metrics.recordLlmCall).toHaveBeenLastCalledWith(expect.objectContaining({ cacheHit: true, promptTokens: 0, completionTokens: 0 }));
    expect(redis.set.mock.calls[0][0]).toMatch(/^sc:answer:v2:interview_question:[a-f0-9]{64}$/);
  });
  it.each([
    ['system policy', (p: any) => { p.messages[0].content = 'policy-v2'; }],
    ['assistant history', (p: any) => { p.messages.splice(1, 0, { role: 'assistant', content: 'previous answer' }); }],
    ['user history', (p: any) => { p.messages.splice(1, 0, { role: 'user', content: 'resume facts' }); }],
    ['case-sensitive query', (p: any) => { p.messages[1].content = 'Same question'; }],
    ['query whitespace', (p: any) => { p.messages[1].content += ' '; }],
    ['temperature', (p: any) => { p.temperature = 0.2; }],
    ['output bound', (p: any) => { p.maxTokens = 20; }],
    ['tool choice', (p: any) => { p.toolChoice = 'none'; }],
    ['session', (p: any) => { p.interviewId = 'interview-b'; }],
  ])('misses when %s changes even if the last user question matches', async (_name, mutate) => {
    await run(); const params = initial(); mutate(params); await run(params);
    expect(calls()).toHaveBeenCalledTimes(2);
  });
  it('isolates authenticated organizations and users', async () => {
    await run(); await run(initial(), 'org-b'); await run(initial(), 'org-a', 'user-b');
    expect(calls()).toHaveBeenCalledTimes(3);
  });
  it('misses on current model, route and plan changes', async () => {
    await run(); primary.defaultModel = 'qwen-v2'; await run();
    limits.maxOutputTokens = 25; await run();
    limits.maxInputBytes = 63000; await run();
    limits.planId = 'plan-b'; await run();
    expect(await run(initial(), 'org-a', 'user-a', 'deepseek')).toBe('deepseek-answer');
    expect(calls()).toHaveBeenCalledTimes(5);
  });
  it('bypasses tools, tool histories, unsupported input and missing authenticated identity', async () => {
    const tools = [{ type: 'function', function: { name: 'lookup', description: 'query', parameters: { type: 'object' } } }];
    const requests = [
      { ...initial(), tools },
      { ...initial(), messages: [...initial().messages, { role: 'tool', content: 'result', toolCallId: 'id' }] },
      { ...initial(), messages: [...initial().messages, { role: 'assistant', content: 'call', tool_calls: [] }] },
      { ...initial(), futureField: () => 'omitted by JSON' },
    ];
    for (const p of requests) { await run(p); await run(p); }
    await run({ ...initial(), userId: 'spoofed' }, 'org-a', null);
    expect(redis.set).not.toHaveBeenCalled(); expect(redis.get).not.toHaveBeenCalled();
  });
  it('bypasses policy and Redis failures without replaying or bypassing reservation', async () => {
    quota.getAnswerCacheLimits.mockRejectedValue(new Error('db unavailable'));
    await run(); expect(redis.get).not.toHaveBeenCalled();
    quota.getAnswerCacheLimits.mockResolvedValue(limits);
    redis.get.mockRejectedValue(new Error('redis unavailable')); redis.set.mockRejectedValue(new Error('redis unavailable'));
    await run(); await run();
    expect(calls()).toHaveBeenCalledTimes(3); expect(quota.reserveLlm).toHaveBeenCalledTimes(3);
  });
  it('does not cache truncated or fallback text', async () => {
    if (mode === 'chat') primary.chat.mockResolvedValueOnce({ content: 'truncated', finishReason: 'length', usage: { promptTokens: 1, completionTokens: 1 } });
    else primary.streamChat.mockImplementationOnce(async function* () { yield { content: 'truncated' }; yield { finishReason: 'length' }; });
    await run(); expect(redis.set).not.toHaveBeenCalled();
    if (mode === 'chat') primary.chat.mockRejectedValueOnce(new Error('temporary'));
    else primary.streamChat.mockImplementationOnce(async function* () { throw new Error('temporary'); });
    expect(await run()).toBe('deepseek-answer'); expect(redis.set).not.toHaveBeenCalled();
    await run(); expect(calls()).toHaveBeenCalledTimes(3);
  });
  it('does not write the original key if the plan changes at reservation', async () => {
    quota.reserveLlm.mockImplementation(async (p: ChatParams) => ({ ...p, maxTokens: 10 }));
    await run(); await run(); expect(redis.set).not.toHaveBeenCalled(); expect(calls()).toHaveBeenCalledTimes(2);
  });
  if (mode === 'stream') it('never caches emitted tool events even if the terminal reason is stop', async () => {
    primary.streamChat.mockImplementation(async function* () {
      yield { content: 'tool preamble' };
      yield { toolCall: { id: 'call', name: 'unexpected-tool', arguments: '{}' } };
      yield { finishReason: 'stop' };
    });
    await run(); await run(); expect(redis.set).not.toHaveBeenCalled();
    expect(primary.streamChat).toHaveBeenCalledTimes(2);
  });
  it('continues reserving quota when answers cannot be cached', async () => {
    quota.reserveLlm.mockRejectedValue(Object.assign(new Error('quota exceeded'), { status: 429 }));
    await expect(run()).rejects.toThrow('quota exceeded');
    expect(calls()).not.toHaveBeenCalled(); expect(redis.set).not.toHaveBeenCalled();
  });
});
