import { isCandidateVisibleAgentEvent } from '../utils/candidateEvents';
import { useCallback, useRef } from 'react';
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
 *
 * 核心设计：
 * - 收到 token 事件 → 直接追加到 zustand store 的最后一条 assistant 消息
 * - 仅展示候选人允许的文本、错误和完成事件，心跳只刷新超时计时器
 * - 自动重连：最多 3 次，指数退避
 * - 使用 forceRender 机制确保每次 token 更新都触发 React 重渲染
 */
export function useInterviewStream(): UseInterviewStreamReturn {
  const abortRef = useRef<AbortController | null>(null);
  const reconnectingRef = useRef(false);
  const requestIdRef = useRef(0);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const send = useCallback(
    async (interviewId: string, userId: string, content: string) => {
      // Each send owns its own lifecycle. A stale timeout or aborted reader from
      // an earlier turn must never finalize the newer turn's placeholder message.
      abortRef.current?.abort();
      const requestId = ++requestIdRef.current;
      const isCurrentRequest = () => requestIdRef.current === requestId;
      const clientMessageId = globalThis.crypto?.randomUUID?.()
        || `message-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      const store = useInterviewStore.getState();

      // 1) 把用户消息和空的 assistant 占位压入 store
      store.addMessage({ role: 'user', content, streaming: false });
      store.addMessage({ role: 'assistant', content: '', streaming: true });
      store.clearAgentEvents();
      store.setStreaming(true);
      store.setError(null);
      store.forceRender(); // 立即渲染用户消息 + 空 assistant

      const controller = new AbortController();
      abortRef.current = controller;

      let lastError: Error | null = null;

      // Only start this after fetch has received the SSE response headers.
      // Server-side validation, queueing, and graph setup happen before that
      // point and must not consume this turn's stream inactivity budget.
      const STREAM_IDLE_TIMEOUT_MS = 60_000;
      let streamIdleTimer: ReturnType<typeof setTimeout> | null = null;
      const clearStreamIdleTimer = () => {
        if (streamIdleTimer) clearTimeout(streamIdleTimer);
        streamIdleTimer = null;
      };
      const resetStreamIdleTimer = () => {
        clearStreamIdleTimer();
        streamIdleTimer = setTimeout(() => {
          if (isCurrentRequest() && useInterviewStore.getState().streaming) {
            useInterviewStore.getState().setError('回复超时，请稍后重试。');
            useInterviewStore.getState().finalizeLastMessage();
            useInterviewStore.getState().setStreaming(false);
            controller.abort();
            useInterviewStore.getState().forceRender();
          }
        }, STREAM_IDLE_TIMEOUT_MS);
      };

      try {
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          if (controller.signal.aborted || !isCurrentRequest()) break;

          if (attempt > 0) {
            clearStreamIdleTimer();
            reconnectingRef.current = true;
            store.setReconnecting(true);

            // Reuse clientMessageId so retries replay the persisted response.
            store.forceRender();
            await sleep(RETRY_DELAY_MS * Math.pow(2, attempt - 1));
            if (controller.signal.aborted || !isCurrentRequest()) break;
          }

          try {
            reconnectingRef.current = false;
            store.setReconnecting(false);

            const res = await fetch(`/api/interview/${interviewId}/message`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId, content, clientMessageId }),
              signal: controller.signal,
            });

            if (!res.ok || !res.body) {
              throw new Error(`HTTP ${res.status}`);
            }
            if (!isCurrentRequest()) return;

            // This is a fresh SSE connection (including reconnects), so it gets
            // a fresh 60-second inactivity window.
            resetStreamIdleTimer();
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
              const { done, value } = await reader.read();
              if (!isCurrentRequest()) return;
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (!line.startsWith('data:')) continue;
                const data = line.slice(5).trim();
                if (data === '[DONE]') {
                  store.finalizeLastMessage();
                  store.setStreaming(false);
                  store.forceRender();
                  return;
                }

                let event: AgentEvent;
                try {
                  event = JSON.parse(data);
                } catch {
                  // The SSE payload may be split across browser stream chunks.
                  // Keep waiting for the next complete event.
                  continue;
                }

                if (event.type !== 'heartbeat' && !isCandidateVisibleAgentEvent(event)) continue;
                // 收到有效事件重置 idle timer
                resetStreamIdleTimer();

                if (event.type === 'token' && event.content) {
                  store.appendToLastMessage(event.content);
                  store.forceRender(); // 关键：每次 token 都强制重渲染
                } else if (event.type === 'error') {
                  store.setError(event.error || 'LLM 调用失败');
                  store.finalizeLastMessage();
                  store.setStreaming(false);
                  store.forceRender();
                  return;
                } else if (event.type === 'heartbeat') {
                  // 心跳只用于刷新 idle timer，不展示在思考过程里。
                } else if (event.type === 'done') {
                  store.finalizeLastMessage();
                  store.setStreaming(false);
                  store.forceRender();
                  return;
                }
              }
            }

            // 正常读完流但无 [DONE] 标记
            store.setStreaming(false);
            store.finalizeLastMessage();
            store.forceRender();
            return;
          } catch (err) {
            if ((err as Error).name === 'AbortError' || !isCurrentRequest()) {
              return;
            }
            clearStreamIdleTimer();
            lastError = err as Error;
            // P2-15 修复：移除 console.error 调试残留，错误由外层 lastError + appendAgentEvent 处理
            if (attempt < MAX_RETRIES) {
              store.forceRender();
            }
          }
        }

        // 所有重试耗尽
        if (isCurrentRequest()) {
          store.setReconnecting(false);
          store.setStreaming(false);
          store.finalizeLastMessage();
          store.forceRender();
          if (lastError) {
            store.setError(lastError.message);
            store.forceRender();
          }
        }
      } finally {
        clearStreamIdleTimer();
        if (isCurrentRequest()) {
          abortRef.current = null;
          reconnectingRef.current = false;
          const currentStore = useInterviewStore.getState();
          currentStore.setReconnecting(false);
          // Every terminal path must release the composer. This protects the UI
          // from malformed SSE payloads or an upstream stream ending in an
          // unexpected state without overriding a newer request.
          if (currentStore.streaming) {
            currentStore.finalizeLastMessage();
            currentStore.setStreaming(false);
            currentStore.forceRender();
          }
        }
      }
    },
    [],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    requestIdRef.current += 1;
    reconnectingRef.current = false;
    useInterviewStore.getState().reset();
  }, []);

  // 从 store 读取状态（用于触发组件重渲染）
  const streaming = useInterviewStore((s) => s.streaming);
  const reconnecting = useInterviewStore((s) => s.reconnecting);
  const error = useInterviewStore((s) => s.error);

  return { streaming, reconnecting, error, send, reset };
}
