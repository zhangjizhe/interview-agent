import {
  LlmGatewayChatModel,
  threadIdStorage,
} from '../agents/multi-agent/llm-gateway-chat-model';

describe('LlmGatewayChatModel usage evidence', () => {
  it('aggregates real provider usage across graph model calls', async () => {
    const gateway = {
      chat: jest.fn()
        .mockResolvedValueOnce({
          content: '{}', usage: { promptTokens: 10, completionTokens: 5 },
          model: 'qwen-plus', finishReason: 'stop',
        })
        .mockResolvedValueOnce({
          content: '{}', usage: { promptTokens: 20, completionTokens: 7 },
          model: 'qwen-plus', finishReason: 'stop',
        }),
    };
    const model = new LlmGatewayChatModel({ llmGateway: gateway as any, provider: 'qwen' });
    const usage = { promptTokens: 0, completionTokens: 0, calls: 0, models: new Set<string>() };

    await threadIdStorage.run({ threadId: 'evaluation-run', usage }, async () => {
      await model._generate([], {} as any);
      await model._generate([], {} as any);
    });

    expect(usage).toMatchObject({ promptTokens: 30, completionTokens: 12, calls: 2 });
    expect([...usage.models]).toEqual(['qwen-plus']);
  });
});
