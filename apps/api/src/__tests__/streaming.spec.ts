/**
 * 流式输出测试 - 验证 streamEvents + on_chat_model_stream 链路
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MultiAgentService } from '../modules/agent/multi-agent.service';
import { LlmGatewayChatModel } from '../agents/multi-agent/llm-gateway-chat-model';

describe('MultiAgent streaming', () => {
  let multiAgentService: MultiAgentService;

  beforeEach(() => {
    // Mock 所有依赖
    const mockLlmGateway = {
      chat: jest.fn().mockResolvedValue({ content: 'test response', usage: {}, model: 'test', finishReason: 'stop' }),
      streamChat: jest.fn().mockImplementation(function* () {
        // 模拟真实流式输出
        const tokens = ['你', '好', '，', '我', '是', '面', '试', '官', '。'];
        for (const token of tokens) {
          yield { content: token };
        }
        yield { finishReason: 'stop' };
      }),
    };

    const mockBocha = { execute: jest.fn() };
    const mockMemory = { recall: jest.fn().mockResolvedValue([]) };
    const mockKb = { recall: jest.fn().mockResolvedValue([]) };
    const mockGithub = { execute: jest.fn() };
    const mockNotion = { execute: jest.fn() };
    const mockConfig = { get: jest.fn().mockReturnValue('multi') };

    // 动态创建实例
    multiAgentService = new MultiAgentService(
      mockConfig as any,
      mockLlmGateway as any,
      mockBocha as any,
      mockMemory as any,
      mockKb as any,
      mockGithub as any,
      mockNotion as any,
    );
  });

  it('should receive tokens from streamEvents on_chat_model_stream', async () => {
    // 手动初始化 graph
    const model = new LlmGatewayChatModel({
      llmGateway: {
        chat: jest.fn(),
        streamChat: jest.fn().mockImplementation(function* () {
          const tokens = ['你', '好', '，', '面', '试', '官'];
          for (const token of tokens) {
            yield { content: token };
          }
          yield { finishReason: 'stop' };
        }),
      } as any,
      provider: 'qwen',
    });

    // 直接测试 streamEvents 行为
    // 这个测试会暴露真实的流式链路问题
    const tokens: string[] = [];
    
    // 模拟 LangGraph streamEvents 的行为
    // 如果 on_chat_model_stream 事件没有触发，tokens 会是空的
    console.log('=== 测试开始 ===');
    
    // 测试关键：检查 handleLLMNewToken 是否被调用
    const mockRunManager = {
      handleLLMNewToken: jest.fn((token: string) => {
        console.log(`handleLLMNewToken 被调用: "${token}"`);
        tokens.push(token);
      }),
    };

    // 直接调用 model._streamResponseChunks 测试
    const messages = [{ role: 'user', content: 'hi' }];
    const stream = model._streamResponseChunks(
      messages as any,
      {},
      mockRunManager as any,
    );

    for await (const chunk of stream) {
      console.log(`收到 chunk:`, chunk);
    }

    console.log(`最终收集到的 tokens:`, tokens);
    expect(tokens.length).toBeGreaterThan(0);
  });
});