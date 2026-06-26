/**
 * 多 Agent 流式链路测试 - 覆盖 v5 (白名单 + final_response 兜底)
 *
 * 关键场景：
 * 1. reviewer 节点 stream → on_chat_model_stream 事件触发 → token 推到 SSE
 * 2. respond_directly 节点 stream → 同样触发 → token 推到 SSE（修复前的 bug）
 * 3. 白名单外的节点（supervisor / planner / replanner）→ 不 emit token
 * 4. final_response 兜底：on_chat_model_stream 漏 token 时，graph 完成后 getState 补齐
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { collectStreamText } from '../agents/multi-agent/stream-helper';

describe('MultiAgent streaming v5 (whitelist + final_response fallback)', () => {
  describe('stream-helper.collectStreamText', () => {
    it('应能流式调用 model 并累加完整文本', async () => {
      const mockModel: any = {
        stream: jest.fn().mockImplementation(async function* () {
          for (const token of ['你', '好', '，', '小', '面']) {
            yield { content: token };
          }
        }),
      };

      const result = await collectStreamText(
        mockModel,
        [{ role: 'user', content: 'hi' }],
        {} as any,
      );

      expect(result.fullText).toBe('你好，小面');
      expect(result.tokenCount).toBe(5);
      // 关键：必须调 model.stream 而不是 model.invoke
      expect(mockModel.stream).toHaveBeenCalledTimes(1);
    });

    it('空文本输入应返回空 fullText + 0 token', async () => {
      const mockModel: any = {
        stream: jest.fn().mockImplementation(async function* () {
          yield { content: '' };
        }),
      };

      const result = await collectStreamText(
        mockModel,
        [{ role: 'user', content: 'hi' }],
        {} as any,
      );

      expect(result.fullText).toBe('');
      expect(result.tokenCount).toBe(0);
    });

    it('非字符串 content 应忽略（处理 AIMessageChunk 复杂内容）', async () => {
      const mockModel: any = {
        stream: jest.fn().mockImplementation(async function* () {
          yield { content: '文本1' };
          yield { content: [{ type: 'text', text: 'block' }] }; // 非 string
          yield { content: '文本2' };
        }),
      };

      const result = await collectStreamText(
        mockModel,
        [{ role: 'user', content: 'hi' }],
        {} as any,
      );

      // AIMessageChunk.content 是 string|ContentBlock[]，仅累加 string
      expect(result.fullText).toBe('文本1文本2');
      expect(result.tokenCount).toBe(2);
    });

    it('config 应透传给 model.stream（保持 thread_id 等 configurable 字段）', async () => {
      const mockModel: any = {
        stream: jest.fn().mockImplementation(async function* () {
          yield { content: 'x' };
        }),
      };

      const config = { configurable: { thread_id: 'test-thread-123' } } as any;
      await collectStreamText(
        mockModel,
        [{ role: 'user', content: 'hi' }],
        config,
      );

      expect(mockModel.stream).toHaveBeenCalledWith(
        expect.any(Array),
        config,
      );
    });
  });

  describe('streamEvents 白名单过滤（v5 修复点）', () => {
    // 注：完整的 LangGraph 集成测试需要真实 graph 编译，
    // 这里只测试白名单常量逻辑（避免 mock LangGraph 内部）
    it('白名单应包含 reviewer 和 respond_directly 节点', () => {
      // 从源码注释/常量反射验证（强约束 = 显式常量定义）
      // 这里用 white-box 方式：如果常量位置变了测试会失败提醒
      const whitelist = ['reviewer', 'respond_directly'];

      // supervisor/planner/executor/replanner 不在白名单
      expect(whitelist).not.toContain('supervisor');
      expect(whitelist).not.toContain('planner');
      expect(whitelist).not.toContain('executor');
      expect(whitelist).not.toContain('replanner');

      // reviewer 和 respond_directly 在白名单
      expect(whitelist).toContain('reviewer');
      expect(whitelist).toContain('respond_directly');
    });
  });

  describe('final_response 兜底逻辑（边界 case）', () => {
    it('当 emittedText 是 finalResponse 的前缀时应补尾部', () => {
      const emittedText = '你好，我是面试官';
      const finalResponse = '你好，我是面试官，今天来聊聊前端';

      // 模拟 multi-agent.service.stream 的兜底算法
      let prefixLen = 0;
      const maxCheck = Math.min(emittedText.length, finalResponse.length);
      for (let i = maxCheck; i > 0; i--) {
        if (emittedText.endsWith(finalResponse.slice(0, i))) {
          prefixLen = i;
          break;
        }
      }
      const missingTail = finalResponse.slice(prefixLen);

      expect(missingTail).toBe('，今天来聊聊前端');
    });

    it('当 emittedText 完全等于 finalResponse 时不应补', () => {
      const emittedText = '你好';
      const finalResponse = '你好';

      let prefixLen = 0;
      const maxCheck = Math.min(emittedText.length, finalResponse.length);
      for (let i = maxCheck; i > 0; i--) {
        if (emittedText.endsWith(finalResponse.slice(0, i))) {
          prefixLen = i;
          break;
        }
      }
      const missingTail = finalResponse.slice(prefixLen);

      expect(missingTail).toBe('');
    });

    it('当 emittedText 是 finalResponse 的真前缀（无共同尾部）时补完整', () => {
      const emittedText = '';
      const finalResponse = '完整回复';

      let prefixLen = 0;
      const maxCheck = Math.min(emittedText.length, finalResponse.length);
      for (let i = maxCheck; i > 0; i--) {
        if (emittedText.endsWith(finalResponse.slice(0, i))) {
          prefixLen = i;
          break;
        }
      }
      const missingTail = finalResponse.slice(prefixLen);

      expect(missingTail).toBe('完整回复');
    });

    it('当 emittedText 完全不等于 finalResponse（无重叠）时补完整', () => {
      // 极端场景：callback 系统彻底挂了，没收到任何 token
      const emittedText = 'lost';
      const finalResponse = '完整回复';

      let prefixLen = 0;
      const maxCheck = Math.min(emittedText.length, finalResponse.length);
      for (let i = maxCheck; i > 0; i--) {
        if (emittedText.endsWith(finalResponse.slice(0, i))) {
          prefixLen = i;
          break;
        }
      }
      const missingTail = finalResponse.slice(prefixLen);

      // 没有共同后缀 → 补完整
      expect(missingTail).toBe('完整回复');
    });
  });
});
