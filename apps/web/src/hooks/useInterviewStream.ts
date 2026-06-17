import { useState, useRef, useCallback } from 'react';
import { useInterviewStore } from '../store/interview-store';
import type { AgentEvent } from '@interview-agent/shared-types';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

interface UseInterviewStreamReturn {
  streaming: boolean;
  reconnecting: boolean;
  error: string | null;
  send: (interviewId: string, userId: string, content: string) => Promise<void>;
  reset: () => void;
}

/**
 * SSE 流式对话 hook
 * - 收到 token 事件 → 直接追加到 zustand store 的最后一条 assistant 消息
 * - 收到 tool_call / tool_result / thinking / searching / recalling 等 → 追加到 CoT 事件流
 * - 自动重连：最多 3 次，指数退避
 *
 * 设计思路：让 hook 直接写入 store，避免 InterviewPage 用 useState 做"中转"造成的
 * stale closure / 状态不同步 / 重渲染漏掉等问题。
 */
export function useInterviewStream(): UseInterviewStreamReturn {
  const [streaming, setStreaming] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    // 只清 hook 自己的 transient 状态，消息/事件由 send() 开始时重置
    setError(null);
    setReconnecting(false);
    setStreaming(false);
  }, []);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const send = useCallback(
    async (interviewId: string, userId: string, content: string) => {
      // 1) 先把用户消息压到 store，再加一条空的 assistant 消息（streaming=true）
      const store = useInterviewStore.getState();
      store.addMessage({ role: 'user', content, streaming: false });
      store.addMessage({ role: 'assistant', content: '', streaming: true });
      store.clearAgentEvents();
      setStreaming(true);
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (controller.signal.aborted) break;
        // 非首次 → 进入重连逻辑
        if (attempt > 0) {
          setReconnecting(true);
          const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          useInterviewStore
            .getState()
            .appendAgentEvent({
              type: 'meta',
              content: `连接断开，第 ${attempt} 次重连中...`,
            });
          await sleep(delay);
          if (controller.signal.aborted) break;
        }

        try {
          const res = await fetch(`/api/interview/${interviewId}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, content }),
            signal: controller.signal,
          });

          if (!res.ok || !res.body) {
            throw new Error(`HTTP ${res.status}`);
          }

          setReconnecting(false);
          lastError = null;

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.startsWith('data:')) continue;
              const data = line.slice(5).trim();
              if (data === '[DONE]') {
                // 流结束 → 标记最后一条消息 streaming=false
                useInterviewStore.getState().finalizeLastMessage();
                setStreaming(false);
                setReconnecting(false);
                return;
              }
              try {
                const event: AgentEvent = JSON.parse(data);

                if (event.type === 'token' && event.content) {
                  useInterviewStore
                    .getState()
                    .appendToLastMessage(event.content);
                } else if (
                  event.type === 'tool_call' ||
                  event.type === 'tool_result' ||
                  event.type === 'thinking' ||
                  event.type === 'searching' ||
                  event.type === 'recalling' ||
                  event.type === 'meta' ||
                  event.type === 'token_usage'
                ) {
                  useInterviewStore.getState().appendAgentEvent(event);
                } else if (event.type === 'error') {
                  useInterviewStore
                    .getState()
                    .appendAgentEvent({
                      type: 'error',
                      error: event.error || 'LLM 调用失败',
                    });
                  throw new Error(event.error || 'LLM 调用失败');
                } else if (event.type === 'done') {
                  useInterviewStore.getState().finalizeLastMessage();
                  setStreaming(false);
                  setReconnecting(false);
                  return;
                }
              } catch (e) {
                // JSON parse error — 忽略（可能是 SSE 中间 chunk）
                if (e instanceof Error && e.message && !e.message.startsWith('Unexpected')) {
                  console.error('[SSE] parse error:', e);
                }
              }
            }
          }

          // 正常读完流但没 [DONE] 标记 — 也视为结束
          useInterviewStore.getState().finalizeLastMessage();
          setStreaming(false);
          setReconnecting(false);
          return;
        } catch (err) {
          if ((err as Error).name === 'AbortError') {
            setStreaming(false);
            setReconnecting(false);
            useInterviewStore.getState().finalizeLastMessage();
            return;
          }
          lastError = err as Error;
          console.error(`[SSE] 第 ${attempt + 1} 次失败:`, err);
        }
      }

      // 所有重试耗尽
      setReconnecting(false);
      setStreaming(false);
      useInterviewStore.getState().finalizeLastMessage();
      if (lastError) {
        useInterviewStore
          .getState()
          .appendAgentEvent({ type: 'error', error: lastError.message });
        setError(lastError.message);
      }
    },
    [],
  );

  return { streaming, reconnecting, error, send, reset };
}
