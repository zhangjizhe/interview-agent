jest.mock('../../infra/langfuse/langfuse.service', () => ({ LangfuseService: class {} }));

import { LlmGatewayService } from './llm.gateway.service';
import { tenantContext } from '../organizations/tenant-context';

describe('LlmGatewayService dual-provider circuit breaker & fallback', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.LLM_CB_FAILURE_THRESHOLD = '2';
    process.env.LLM_CB_COOLDOWN_MS = '1000';
    delete process.env.LLM_PRIMARY_PROVIDER;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  function buildGateway(overrides: {
    deepseekChat?: jest.Mock;
    qwenChat?: jest.Mock;
  } = {}) {
    const qwen = {
      name: 'qwen',
      defaultModel: 'qwen-plus',
      chat: overrides.qwenChat ?? jest.fn(async () => ({
        content: 'from-qwen',
        usage: { promptTokens: 10, completionTokens: 5 },
        finishReason: 'stop',
        model: 'qwen-plus',
        provider: 'qwen',
      })),
      streamChat: jest.fn(),
    } as any;

    const deepseek = {
      name: 'deepseek',
      defaultModel: 'deepseek-chat',
      chat: overrides.deepseekChat ?? jest.fn(async () => ({
        content: 'from-deepseek',
        usage: { promptTokens: 10, completionTokens: 5 },
        finishReason: 'stop',
        model: 'deepseek-chat',
        provider: 'deepseek',
      })),
      streamChat: jest.fn(),
    } as any;

    const langfuse = { logGeneration: jest.fn() } as any;
    const promptCache = {
      wrapChat: jest.fn((fn: any, params: any) => fn(params)),
      wrapStream: jest.fn((fn: any, params: any) => fn(params)),
    } as any;
    const semanticCache = { lookup: jest.fn(async () => ({ hit: false })), setAsync: jest.fn() } as any;
    const costTracker = { recordLlmCall: jest.fn(), startSession: jest.fn(), endSession: jest.fn() } as any;
    const quota = {
      reserveLlm: jest.fn(async (p: any) => p),
      getAnswerCacheLimits: jest.fn(),
    } as any;

    const gateway = new LlmGatewayService(
      qwen,
      deepseek,
      langfuse,
      promptCache,
      semanticCache,
      costTracker,
      quota,
    );

    return { gateway, qwen, deepseek };
  }

  it('defaults to DeepSeek primary and falls back to Qwen on transient errors, then opens circuit', async () => {
    const transientErr = Object.assign(new Error('503 upstream timeout'), { status: 503 });
    const deepseekChat = jest.fn(async () => { throw transientErr; });
    const { gateway, qwen } = buildGateway({ deepseekChat });

    const runChat = () =>
      tenantContext.run({ organizationId: 'org-1', userId: 'user-1' }, () =>
        gateway.chat({ messages: [{ role: 'user', content: '请做自我介绍' }] }),
      );

    // 1st & 2nd failures trip circuit (threshold=2) and fall back to Qwen
    const r1 = await runChat();
    const r2 = await runChat();
    expect(r1.provider).toBe('qwen');
    expect(r2.provider).toBe('qwen');
    expect(deepseekChat).toHaveBeenCalledTimes(2);
    expect(gateway.getProviderStatus().deepseek.circuitState).toBe('OPEN');
    expect(gateway.getProviderStatus().deepseek.totalTrips).toBe(1);
    expect(gateway.getProviderStatus().deepseek.totalFallbacks).toBe(2);

    // 3rd call routes directly to Qwen without hitting DeepSeek while circuit is OPEN
    const r3 = await runChat();
    expect(r3.provider).toBe('qwen');
    expect(deepseekChat).toHaveBeenCalledTimes(2);
    expect(qwen.chat).toHaveBeenCalledTimes(3);
  });

  it('recovers from OPEN -> HALF_OPEN -> CLOSED after cooldown succeeds', async () => {
    const transientErr = Object.assign(new Error('429 rate limit'), { status: 429 });
    let fail = true;
    const deepseekChat = jest.fn(async () => {
      if (fail) throw transientErr;
      return {
        content: 'recovered-deepseek',
        usage: { promptTokens: 8, completionTokens: 4 },
        finishReason: 'stop',
        model: 'deepseek-chat',
        provider: 'deepseek',
      };
    });
    const { gateway } = buildGateway({ deepseekChat });

    const runChat = () =>
      tenantContext.run({ organizationId: 'org-1', userId: 'user-1' }, () =>
        gateway.chat({ messages: [{ role: 'user', content: '解释事件循环' }] }),
      );

    await runChat();
    await runChat();
    expect(gateway.getProviderStatus().deepseek.circuitState).toBe('OPEN');

    // Simulate cooldown elapsed
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 5000);
    fail = false;

    const recovered = await runChat();
    expect(recovered.provider).toBe('deepseek');
    expect(gateway.getProviderStatus().deepseek.circuitState).toBe('CLOSED');
    expect(gateway.getProviderStatus().deepseek.consecutiveFailures).toBe(0);
    nowSpy.mockRestore();
  });

  it('permanently disables provider on 401/402/403/404 and routes to backup', async () => {
    const authErr = Object.assign(new Error('401 invalid api key'), { status: 401 });
    const deepseekChat = jest.fn(async () => { throw authErr; });
    const { gateway } = buildGateway({ deepseekChat });

    const res = await tenantContext.run({ organizationId: 'org-1', userId: 'user-1' }, () =>
      gateway.chat({ messages: [{ role: 'user', content: '你好' }] }),
    );
    expect(res.provider).toBe('qwen');
    expect(gateway.getProviderStatus().deepseek.enabled).toBe(false);
  });
});
