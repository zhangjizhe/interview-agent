jest.mock('../../../infra/langfuse/langfuse.service', () => ({ LangfuseService: class {} }));
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { LlmGatewayService } from '../llm.gateway.service';
import { SemanticCacheService } from './semantic-cache.service';
import { PromptCacheInterceptor } from './prompt-cache.interceptor';
import { tenantContext } from '../../organizations/tenant-context';

// Explicit opt-in; use synthetic identities and remove only keys created here.
const redisUrl = process.env.ANSWER_CACHE_TEST_REDIS_URL;
(redisUrl ? describe : describe.skip)('Gateway answer cache with real Redis (offline model fixtures)', () => {
  let client: Redis, cache: SemanticCacheService, gateway: LlmGatewayService, primary: any;
  const keys = new Set<string>();
  const organizationId = `cache-acceptance-${randomUUID()}`;
  const limits = { planId: 'synthetic-plan', maxInputBytes: 64000, maxOutputTokens: 100, monthlyLlmCalls: 100 };
  beforeAll(async () => {
    client = new Redis(redisUrl!, { lazyConnect: true, maxRetriesPerRequest: 1 }); await client.connect();
    const redis: any = {
      get: (key: string) => client.get(key),
      set: async (key: string, value: string, ttl: number) => { keys.add(key); await client.set(key, value, 'EX', ttl); },
    };
    const config: any = { get: () => undefined };
    cache = new SemanticCacheService(config, redis); cache.onModuleInit();
    const metrics: any = { recordLlmCall: jest.fn().mockResolvedValue(undefined) };
    primary = { name: 'qwen', defaultModel: 'synthetic-v1',
      chat: jest.fn(async () => ({ content: 'synthetic answer', model: 'synthetic-v1', provider: 'qwen', finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 5 } })),
      streamChat: jest.fn(async function* () { yield { content: 'synthetic stream' }; yield { finishReason: 'stop' }; }),
    };
    const quota: any = { getAnswerCacheLimits: async () => ({ ...limits }), reserveLlm: async (p: any) => ({ ...p, maxTokens: p.maxTokens ?? limits.maxOutputTokens }) };
    gateway = new LlmGatewayService(primary, { name: 'deepseek' } as any, {} as any, new PromptCacheInterceptor(config, metrics), cache, metrics, quota);
  });
  afterAll(async () => {
    if (client) {
      if (keys.size) await client.del(...keys);
      await client.quit();
    }
  });
  async function flush() {
    await new Promise(resolve => setImmediate(resolve));
    // Redis command ordering ensures scheduled SET operations have completed.
    await client.ping();
  }
  function params(policy = 'policy-v1') {
    return { messages: [{ role: 'system' as const, content: policy }, { role: 'user' as const, content: 'same synthetic question' }], interviewId: 'synthetic-session', semanticCacheType: 'interview_question' as const };
  }
  function run(p = params(), userId = 'synthetic-user', org = organizationId) {
    return tenantContext.run({ organizationId: org, userId }, () => gateway.chat(p, 'qwen'));
  }
  it('hits identical requests, isolates changed context and expires only fixture keys', async () => {
    await run(); await flush();
    expect((await run()).provider).toBe('semantic_cache');
    await run(params('policy-v2')); await run(params(), 'another-user'); await run(params(), 'synthetic-user', `${organizationId}-other`);
    primary.defaultModel = 'synthetic-v2'; await run();
    limits.maxOutputTokens = 80; await run(); await flush();
    expect(primary.chat).toHaveBeenCalledTimes(6);
    expect(keys.size).toBe(6);
    for (const key of keys) {
      const ttl = await client.ttl(key); expect(ttl).toBeGreaterThan(3590); expect(ttl).toBeLessThanOrEqual(3600);
    }
    const currentKey = [...keys].at(-1)!;
    await client.pexpire(currentKey, 1); await new Promise(resolve => setTimeout(resolve, 10));
    expect((await run()).provider).toBe('qwen'); await flush();
  });
  it('isolates simultaneous user requests and preserves complete streaming hits', async () => {
    const users = Array.from({ length: 12 }, (_, i) => `concurrent-user-${i}`);
    await Promise.all(users.map(user => run(params('parallel-policy'), user))); await flush();
    const repeat = await Promise.all(users.map(user => run(params('parallel-policy'), user)));
    expect(repeat.every(r => r.provider === 'semantic_cache')).toBe(true);
    const stream = () => tenantContext.run({ organizationId, userId: 'stream-user' }, async () => {
      const chunks = []; for await (const chunk of gateway.streamChat(params(), 'qwen')) chunks.push(chunk); return chunks;
    });
    await stream(); await flush();
    const cached = await stream();
    expect(primary.streamChat).toHaveBeenCalledTimes(1);
    expect(cached.map(c => c.content ?? '').join('')).toBe('synthetic stream');
    expect(cached).toContainEqual(expect.objectContaining({ usage: { promptTokens: 0, completionTokens: 0 }, provider: 'semantic_cache' }));
  });
});
