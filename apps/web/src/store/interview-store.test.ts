/**
 * P2-7 前端基础测试：interview-store.ts
 *
 * 测试场景：
 * 1. zustand store 的 token 流式更新逻辑
 * 2. 消息追加、finalize 逻辑
 * 3. forceRender 机制
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useInterviewStore } from '../store/interview-store';

describe('useInterviewStore - Token Streaming', () => {
  beforeEach(() => {
    useInterviewStore.getState().reset();
  });

  it('初始状态正确', () => {
    const state = useInterviewStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.report).toBeNull();
    expect(state.resume).toBeNull();
    expect(state.ending).toBe(false);
    expect(state.sessionTokens).toBe(0);
    expect(state.streaming).toBe(false);
  });

  describe('addMessage', () => {
    it('添加用户消息', () => {
      useInterviewStore.getState().addMessage({ role: 'user', content: '你好' });
      const { messages } = useInterviewStore.getState();
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('你好');
    });

    it('添加多条消息保持顺序', () => {
      useInterviewStore.getState().addMessage({ role: 'user', content: '问题1' });
      useInterviewStore.getState().addMessage({ role: 'assistant', content: '回答1' });
      useInterviewStore.getState().addMessage({ role: 'user', content: '问题2' });

      const { messages } = useInterviewStore.getState();
      expect(messages).toHaveLength(3);
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
      expect(messages[2].role).toBe('user');
    });
  });

  describe('appendToLastMessage - Token 流式追加', () => {
    it('追加 token 到 streaming 的 assistant 消息', () => {
      const store = useInterviewStore.getState();
      store.addMessage({ role: 'user', content: '你好' });
      store.addMessage({ role: 'assistant', content: '', streaming: true });

      store.appendToLastMessage('你');
      store.appendToLastMessage('好');
      store.appendToLastMessage('！');

      const { messages } = useInterviewStore.getState();
      expect(messages[1].content).toBe('你好！');
      expect(messages[1].streaming).toBe(true);
    });

    it('不追加到非 streaming 消息', () => {
      const store = useInterviewStore.getState();
      store.addMessage({ role: 'user', content: '你好' });
      store.addMessage({ role: 'assistant', content: '已回复', streaming: false });

      store.appendToLastMessage('新内容');

      const { messages } = useInterviewStore.getState();
      expect(messages[1].content).toBe('已回复'); // 未被修改
    });

    it('空消息数组时不报错', () => {
      const store = useInterviewStore.getState();
      expect(() => store.appendToLastMessage('test')).not.toThrow();
    });

    it('最后一条不是 assistant 时不追加', () => {
      const store = useInterviewStore.getState();
      store.addMessage({ role: 'user', content: '你好' });

      store.appendToLastMessage('should not add');

      const { messages } = useInterviewStore.getState();
      expect(messages[0].content).toBe('你好');
    });
  });

  describe('finalizeLastMessage - 流式结束', () => {
    it('设置最后一条 streaming=false', () => {
      const store = useInterviewStore.getState();
      store.addMessage({ role: 'assistant', content: '内容', streaming: true });

      store.finalizeLastMessage();

      const { messages } = useInterviewStore.getState();
      expect(messages[0].streaming).toBe(false);
    });

    it('非 assistant 消息不做修改', () => {
      const store = useInterviewStore.getState();
      store.addMessage({ role: 'user', content: '你好' });

      store.finalizeLastMessage();

      const { messages } = useInterviewStore.getState();
      expect(messages[0].role).toBe('user');
      expect((messages[0] as any).streaming).toBeUndefined();
    });
  });

  describe('setMessages - 批量替换', () => {
    it('整体替换消息数组', () => {
      useInterviewStore.getState().addMessage({ role: 'user', content: '旧消息' });
      useInterviewStore.getState().setMessages([
        { role: 'user', content: '新消息1' },
        { role: 'assistant', content: '回复' },
      ]);

      const { messages } = useInterviewStore.getState();
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('新消息1');
    });
  });

  describe('addTokens - Token 计量', () => {
    it('累加 token 数', () => {
      useInterviewStore.getState().addTokens(100);
      expect(useInterviewStore.getState().sessionTokens).toBe(100);

      useInterviewStore.getState().addTokens(50);
      expect(useInterviewStore.getState().sessionTokens).toBe(150);
    });
  });

  describe('reset - 重置状态', () => {
    it('恢复初始状态', () => {
      const store = useInterviewStore.getState();
      store.addMessage({ role: 'user', content: 'test' });
      store.addTokens(999);
      store.setEnding(true);
      store.setInput('some input');
      store.setStreaming(true);

      store.reset();

      const state = useInterviewStore.getState();
      expect(state.messages).toEqual([]);
      expect(state.sessionTokens).toBe(0);
      expect(state.ending).toBe(false);
      expect(state.input).toBe('');
      expect(state.streaming).toBe(false);
    });
  });

  describe('forceRender - 渲染触发器', () => {
    it('forceRender 递增 _renderCount', () => {
      const store = useInterviewStore.getState();
      const initialCount = store._renderCount;

      store.forceRender();
      expect(store._renderCount).toBe(initialCount + 1);

      store.forceRender();
      expect(store._renderCount).toBe(initialCount + 2);
    });
  });

  describe('streaming 状态', () => {
    it('setStreaming 设置流式状态', () => {
      const store = useInterviewStore.getState();
      expect(store.streaming).toBe(false);

      store.setStreaming(true);
      expect(store.streaming).toBe(true);

      store.setStreaming(false);
      expect(store.streaming).toBe(false);
    });
  });

  describe('error 处理', () => {
    it('setError 设置错误信息', () => {
      const store = useInterviewStore.getState();
      expect(store.error).toBeNull();

      store.setError('Network error');
      expect(store.error).toBe('Network error');

      store.setError(null);
      expect(store.error).toBeNull();
    });
  });
});
