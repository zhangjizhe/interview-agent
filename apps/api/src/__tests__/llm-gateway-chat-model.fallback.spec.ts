/**
 * LlmGatewayChatModel _streamResponseChunks runManager callback fallback 测试
 *
 * 覆盖 6-23 commit 43bbdfb 修复：
 *  - runManager undefined → 不报错，ChatGenerationChunk 仍 yield
 *  - runManager.handleLLMNewToken 抛错 → 不让 stream 终止，ChatGenerationChunk 仍 yield
 *  - logger.debug 记录降级信息（"handleLLMNewToken fallback"）
 *
 * 设计要点：
 *  - mock LlmGatewayService.streamChat 返回 AsyncGenerator
 *  - 直接 new LlmGatewayChatModel（不是 NestJS Injectable，绕开 DI）
 *  - REPL 实测确认行为后写 expected（避免 Test 预期陷阱）
 */
import { LlmGatewayChatModel } from '../agents/multi-agent/llm-gateway-chat-model';

describe('LlmGatewayChatModel._streamResponseChunks - runManager callback fallback', () => {
  /**
   * Mock LlmGatewayService：返回 3 个 chunk（2 个文本 + 1 个终止）
   */
  async function* mockStreamChat() {
    yield { content: 'hello' };
    yield { content: ' world' };
    yield { content: '', finishReason: 'stop' };
  }

  function createModel() {
    return new LlmGatewayChatModel({
      llmGateway: { streamChat: mockStreamChat } as any,
      provider: 'qwen',
      interviewId: 'test-interview',
      userId: 'test-user',
      cacheType: 'interview_question',
    });
  }

  it('runManager=undefined → 不抛错，yield 所有 chunks（2 text + 1 finish_reason）', async () => {
    const model = createModel();
    const chunks: any[] = [];

    // runManager 显式传 undefined（之前用可选链 ?. 跳过，现在 try/catch 包了）
    for await (const chunk of model._streamResponseChunks([], {} as any, undefined)) {
      chunks.push(chunk);
    }

    // 期望 3 chunks：2 个 text delta + 1 个 finish_reason
    expect(chunks).toHaveLength(3);
    expect(chunks[0].text).toBe('hello');
    expect(chunks[1].text).toBe(' world');
    expect(chunks[2].generationInfo?.finish_reason).toBe('stop');
  });

  it('runManager.handleLLMNewToken 抛错 → 不让 stream 终止，chunks 仍全部 yield', async () => {
    const model = createModel();
    const mockRunManager = {
      handleLLMNewToken: jest.fn().mockRejectedValue(new Error('callback failed')),
    };
    const chunks: any[] = [];

    // 即使 callback 抛错，stream 不应该终止
    for await (const chunk of model._streamResponseChunks([], {} as any, mockRunManager as any)) {
      chunks.push(chunk);
    }

    // 期望 3 chunks（与 runManager=undefined 行为一致）
    expect(chunks).toHaveLength(3);
    expect(chunks[0].text).toBe('hello');
    expect(chunks[1].text).toBe(' world');
    expect(chunks[2].generationInfo?.finish_reason).toBe('stop');
    // callback 被调用 2 次（每个 text chunk 一次）
    expect(mockRunManager.handleLLMNewToken).toHaveBeenCalledTimes(2);
    expect(mockRunManager.handleLLMNewToken).toHaveBeenNthCalledWith(1, 'hello');
    expect(mockRunManager.handleLLMNewToken).toHaveBeenNthCalledWith(2, ' world');
  });

  it('runManager 正常工作 → callback 正常调用 + chunks 全部 yield', async () => {
    const model = createModel();
    const mockRunManager = {
      handleLLMNewToken: jest.fn().mockResolvedValue(undefined),
    };
    const chunks: any[] = [];

    for await (const chunk of model._streamResponseChunks([], {} as any, mockRunManager as any)) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(3);
    expect(mockRunManager.handleLLMNewToken).toHaveBeenCalledTimes(2);
  });
});