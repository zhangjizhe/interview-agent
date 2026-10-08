jest.mock('../modules/organizations/tenant-context', () => ({ requireTenant: () => ({ organizationId: 'test-org', userId: 'test-user' }) }));
import { QuotaExceededException } from '../modules/llm/usage/quota.service';
jest.mock('../infra/langfuse/langfuse.service', () => ({ LangfuseService: class {} }));
import { LlmGatewayService } from '../modules/llm/llm.gateway.service';
import { PromptCacheInterceptor } from '../modules/llm/cache/prompt-cache.interceptor';
import type { StreamChunk } from '../modules/llm/providers/types';

describe('LLM gateway failure boundaries (offline fault injection)', () => {
  const answer = { content: 'answer', model: 'qwen-test', finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 2 } };
  const params = { messages: [{ role: 'system' as const, content: 'interviewer' }, { role: 'user' as const, content: 'hello' }], interviewId: 'test-session', userId: 'test-user' };
  let primary: any, fallback: any, metrics: any, telemetry: any, semantic: any, quota: any, gateway: LlmGatewayService;
  beforeEach(() => {
    quota = { reserveLlm: jest.fn(async params => params) };
    primary = { name: 'qwen', defaultModel: 'qwen-test', chat: jest.fn().mockResolvedValue(answer), streamChat: jest.fn(async function* () { yield { content: 'answer' }; yield { finishReason: 'stop' }; }) };
    fallback = { name: 'deepseek', defaultModel: 'deepseek-test', chat: jest.fn().mockResolvedValue({ ...answer, model: 'deepseek-test' }), streamChat: jest.fn(async function* () { yield { content: 'fallback' }; yield { finishReason: 'stop' }; }) };
    metrics = { recordLlmCall: jest.fn().mockResolvedValue(undefined) };
    telemetry = { logGeneration: jest.fn() };
    semantic = { lookup: jest.fn().mockResolvedValue({ hit: false }), setAsync: jest.fn() };
    const cache = new PromptCacheInterceptor({ get: () => undefined } as any, metrics);
    gateway = new LlmGatewayService(primary, fallback, telemetry, cache, semantic, metrics, quota);
  });
  async function collect() {
    const chunks: StreamChunk[] = [];
    for await (const chunk of gateway.streamChat(params, 'qwen')) chunks.push(chunk);
    return chunks;
  }
  it('passes prepared cache parameters to the provider without mutating caller input', async () => {
    await gateway.chat(params, 'qwen');
    expect(primary.chat.mock.calls[0][0].__promptCacheKey).toContain('test-org:test-user::sys-v1::');
    expect(params).not.toHaveProperty('__promptCacheKey');
  });
  it('falls back on primary failure and records the actual provider', async () => {
    primary.chat.mockRejectedValue(Object.assign(new Error('upstream'), { status: 503 }));
    expect((await gateway.chat(params, 'qwen')).model).toBe('deepseek-test');
    expect(fallback.chat).toHaveBeenCalledTimes(1);
    expect(metrics.recordLlmCall).toHaveBeenLastCalledWith(expect.objectContaining({ provider: 'deepseek', isFallback: true }));
  });
  it('disables both permanently failed providers and avoids repeated calls', async () => {
    primary.chat.mockRejectedValue(Object.assign(new Error('unauthorized'), { status: 401 }));
    fallback.chat.mockRejectedValue(Object.assign(new Error('billing'), { status: 402 }));
    await expect(gateway.chat(params, 'qwen')).rejects.toThrow('billing');
    await expect(gateway.chat(params, 'qwen')).rejects.toThrow('所有模型');
    expect(primary.chat).toHaveBeenCalledTimes(1);
    expect(fallback.chat).toHaveBeenCalledTimes(1);
  });
  it('does not replay a successful call when cost storage or telemetry fails', async () => {
    metrics.recordLlmCall.mockRejectedValue(new Error('redis unavailable'));
    telemetry.logGeneration.mockImplementation(() => { throw new Error('telemetry unavailable'); });
    await expect(gateway.chat({ ...params, traceId: 'trace' }, 'qwen')).resolves.toEqual(answer);
    expect(primary.chat).toHaveBeenCalledTimes(1);
    expect(fallback.chat).not.toHaveBeenCalled();
  });
  it('falls back before the first visible stream event without injecting fake model text', async () => {
    primary.streamChat.mockImplementation(async function* () { throw new Error('unavailable'); });
    const chunks = await collect();
    expect(chunks.map(c => c.content || '').join('')).toBe('fallback');
    expect(chunks.some(c => c.isFallbackMarker)).toBe(false);
  });
  it.each([
    { content: 'partial answer' },
    { toolCall: { id: 'call', name: 'tool', arguments: '{}' } },
    { finishReason: 'stop' as const },
  ])('does not replay a stream after emitting %j', async (first) => {
    primary.streamChat.mockImplementation(async function* () { yield first; throw new Error('stream disconnected'); });
    const chunks: StreamChunk[] = [];
    await expect((async () => { for await (const chunk of gateway.streamChat(params, 'qwen')) chunks.push(chunk); })()).rejects.toThrow('stream disconnected');
    expect(chunks).toEqual([first]);
    expect(fallback.streamChat).not.toHaveBeenCalled();
    expect(semantic.setAsync).not.toHaveBeenCalled();
  });
  it('keeps successful streaming intact when cost persistence fails', async () => {
    metrics.recordLlmCall.mockRejectedValue(new Error('db unavailable'));
    expect((await collect()).map(c => c.content || '').join('')).toBe('answer');
    expect(fallback.streamChat).not.toHaveBeenCalled();
  });
  it('preserves received usage when the stream later fails', async () => {
    primary.streamChat.mockImplementation(async function* () {
      yield { content: 'partial' };
      yield { usage: { promptTokens: 12, completionTokens: 3 } };
      throw new Error('disconnected');
    });
    await expect(collect()).rejects.toThrow('disconnected');
    expect(metrics.recordLlmCall).toHaveBeenLastCalledWith(expect.objectContaining({ provider: 'qwen', promptTokens: 12, completionTokens: 3, isError: true }));
  });
  it('rejects truncated EOF instead of treating partial output as complete', async () => {
    primary.streamChat.mockImplementation(async function* () { yield { content: 'truncated' }; });
    await expect(collect()).rejects.toThrow('without a completion event');
    expect(fallback.streamChat).not.toHaveBeenCalled();
    expect(semantic.setAsync).not.toHaveBeenCalled();
  });
  it('disables a permanently failed streaming fallback', async () => {
    primary.streamChat.mockImplementation(async function* () { throw new Error('unavailable'); });
    fallback.streamChat.mockImplementation(async function* () { throw Object.assign(new Error('billing'), { status: 402 }); });
    await expect(collect()).rejects.toThrow('billing');
    expect(gateway.getProviderStatus().deepseek.enabled).toBe(false);
  });

  it('quota rejection never calls primary or fallback', async () => {
    quota.reserveLlm.mockRejectedValue(new QuotaExceededException());
    await expect(gateway.chat(params)).rejects.toMatchObject({ status: 429 });
    expect(primary.chat).not.toHaveBeenCalled();
    expect(fallback.chat).not.toHaveBeenCalled();
  });
  it('stream quota rejection never calls providers', async () => {
    quota.reserveLlm.mockRejectedValue(new QuotaExceededException());
    await expect(collect()).rejects.toMatchObject({ status: 429 });
    expect(primary.streamChat).not.toHaveBeenCalled();
    expect(fallback.streamChat).not.toHaveBeenCalled();
  });
  it('each fallback attempt requires a separate reservation', async () => {
    primary.chat.mockRejectedValue(new Error('provider failed'));
    await gateway.chat(params);
    expect(quota.reserveLlm).toHaveBeenCalledTimes(2);
  });
});
