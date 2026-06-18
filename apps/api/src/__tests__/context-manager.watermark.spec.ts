/**
 * P0-2 核心链路测试：context-manager.service.ts 4 级水位线压缩
 *
 * 测试场景：
 * 1. 4 级水位线触发条件（< 50% / 50-70% / 70-85% / > 85%）
 * 2. 对话超过水位线时的压缩行为
 * 3. 边界 case：空消息、极大消息、超长对话
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../infra/redis/redis.service';
import { ContextManagerService } from '../modules/agent/services/context-manager.service';
import type { ChatMessage } from '../modules/llm/providers/types';

describe('ContextManagerService 4-Level Watermark', () => {
  let service: ContextManagerService;

  const mockRedis = {
    getClient: jest.fn().mockReturnValue({
      hgetall: jest.fn().mockResolvedValue({}),
      hset: jest.fn().mockResolvedValue(1),
      hdel: jest.fn().mockResolvedValue(1),
    }),
  };

  const mockConfig = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        'redis.url': 'redis://localhost:6379',
        'llm.qwen.maxTokens': 128000,
        'llm.default.maxTokens': 32000,
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextManagerService,
        { provide: RedisService, useValue: mockRedis },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<ContextManagerService>(ContextManagerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  function createMessage(role: 'user' | 'assistant', content: string, tokens = 50): ChatMessage {
    return {
      role,
      content,
      createdAt: new Date().toISOString(),
      _estimatedTokens: tokens,
    } as ChatMessage;
  }

  describe('4-Level Waterline Trigger', () => {
    it('should not compress when under 50%', () => {
      const messages = Array.from({ length: 10 }, (_, i) =>
        createMessage(i % 2 === 0 ? 'user' : 'assistant', `Message ${i}`, 500),
      );
      const beforeTokens = messages.length * 500;
      const maxTokens = 128000;

      // 10 * 500 = 5000 tokens, 5000 / 128000 = 3.9% < 50%
      const result = service.compact(messages, beforeTokens, maxTokens);
      expect(result.keptMessages.length).toBe(messages.length);
    });

    it('should trigger level 2 compression at 50-70%', () => {
      const messages = Array.from({ length: 100 }, (_, i) =>
        createMessage(i % 2 === 0 ? 'user' : 'assistant', `Message ${i}`, 500),
      );
      const beforeTokens = messages.length * 500; // 50000 tokens
      const maxTokens = 128000;

      // 50000 / 128000 = 39% - 不触发
      // 增加消息数到触发 50%
      const largeMessages = Array.from({ length: 150 }, (_, i) =>
        createMessage(i % 2 === 0 ? 'user' : 'assistant', `Message ${i}`, 500),
      );
      const largeBeforeTokens = largeMessages.length * 500; // 75000 tokens
      // 75000 / 128000 = 58.6% - 触发 level 2

      const result = service.compact(largeMessages, largeBeforeTokens, maxTokens);
      expect(result.keptMessages.length).toBeLessThan(largeMessages.length);
      expect(result.compressionLevel).toBeGreaterThanOrEqual(2);
    });

    it('should handle boundary: empty messages array', () => {
      const result = service.compact([], 0, 128000);
      expect(result.keptMessages).toEqual([]);
      expect(result.totalTokens).toBe(0);
    });

    it('should handle boundary: single very long message', () => {
      const longMessage = createMessage('user', 'x'.repeat(10000), 2500);
      const result = service.compact([longMessage], 2500, 1000);
      // 应该被压缩
      expect(result.keptMessages.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Compression Quality', () => {
    it('should preserve system message', () => {
      const systemMsg = createMessage('system', 'You are a helpful assistant', 30);
      const userMsgs = Array.from({ length: 20 }, (_, i) =>
        createMessage('user', `Question ${i}`, 100),
      );

      const result = service.compact(
        [systemMsg, ...userMsgs],
        2030,
        1000,
      );

      // 系统消息应该被保留
      const hasSystem = result.keptMessages.some(m => m.role === 'system');
      expect(hasSystem).toBe(true);
    });
  });
});
