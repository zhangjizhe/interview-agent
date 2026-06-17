import { describe, it, expect, beforeEach } from 'vitest';
import { useInterviewStore } from '../store/interview-store';

describe('useInterviewStore', () => {
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
  });

  it('addMessage 添加消息', () => {
    useInterviewStore.getState().addMessage({ role: 'user', content: '你好' });
    const { messages } = useInterviewStore.getState();
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('你好');
  });

  it('updateLastMessage 更新最后一条 assistant 消息', () => {
    const store = useInterviewStore.getState();
    store.addMessage({ role: 'user', content: '你好' });
    store.addMessage({ role: 'assistant', content: '', streaming: true });

    useInterviewStore.getState().updateLastMessage('你好！我是面试官', true);
    const { messages } = useInterviewStore.getState();
    expect(messages[1].content).toBe('你好！我是面试官');
    expect(messages[1].streaming).toBe(true);
  });

  it('updateLastMessage 不更新非 streaming 消息', () => {
    const store = useInterviewStore.getState();
    store.addMessage({ role: 'user', content: '你好' });
    store.addMessage({ role: 'assistant', content: '已回复', streaming: false });

    useInterviewStore.getState().updateLastMessage('新内容', true);
    const { messages } = useInterviewStore.getState();
    // streaming=false 的消息不应被更新
    expect(messages[1].content).toBe('已回复');
  });

  it('addTokens 累加 token 数', () => {
    useInterviewStore.getState().addTokens(100);
    expect(useInterviewStore.getState().sessionTokens).toBe(100);
    useInterviewStore.getState().addTokens(50);
    expect(useInterviewStore.getState().sessionTokens).toBe(150);
  });

  it('reset 恢复初始状态', () => {
    const store = useInterviewStore.getState();
    store.addMessage({ role: 'user', content: 'test' });
    store.addTokens(999);
    store.setEnding(true);

    useInterviewStore.getState().reset();
    const state = useInterviewStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.sessionTokens).toBe(0);
    expect(state.ending).toBe(false);
  });
});
