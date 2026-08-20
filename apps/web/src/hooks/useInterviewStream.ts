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
 * - 收到 thinking / searching / recalling / meta 等 → 追加到 CoT 事件流
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
            useInterviewStore.getState().appendAgentEvent({
              type: 'error',
              error: 'SSE 流式超时（60 秒无事件），已结束本次请求，请重试',
            });
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
            store.appendAgentEvent({
              type: 'meta',
              content: `连接断开，第 ${attempt} 次重连中...`,
            });

            // R-P1-9 已知限制：项目 SSE 协议未设计 offset / Last-Event-ID 字段，
            // server 端不存消息状态，所以无法做真正的断点续传。
            // 当前降级处理：依赖 store.appendToLastMessage 的 dedup 逻辑
            // （MAX_OVERLAP=200，R-P2-14 修复）检测 lastContent 末尾与 delta
            // 开头的重叠，server 完全重发时 200 字符上限足够覆盖 token 级重复。
            // 用户感知：极少见重复 token（最多 200 字符），不会看到明显重复内容。
            // 真断点续传需要 server-side 支持（详见未来 ADR）。

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
              body: JSON.stringify({ userId, content }),
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

                // 收到任何有效事件都重置 idle timer（说明 SSE 还活着）
                resetStreamIdleTimer();

                if (event.type === 'token' && event.content) {
                  store.appendToLastMessage(event.content);
                  store.forceRender(); // 关键：每次 token 都强制重渲染
                } else if (
                  event.type === 'tool_call' ||
                  event.type === 'tool_result' ||
                  event.type === 'thinking' ||
                  event.type === 'searching' ||
                  event.type === 'recalling' ||
                  event.type === 'meta' ||
                  event.type === 'token_usage'
                ) {
                  store.appendAgentEvent(event);
                  store.forceRender();
                } else if (event.type === 'error') {
                  store.appendAgentEvent({
                    type: 'error',
                    error: event.error || 'LLM 调用失败',
                  });
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
              store.appendAgentEvent({
                type: 'meta',
                content: `SSE 连接第 ${attempt + 1} 次失败：${lastError.message}`,
              });
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
            store.appendAgentEvent({ type: 'error', error: lastError.message });
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
