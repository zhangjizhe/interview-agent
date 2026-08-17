import { useCallback, useRef } from 'react';
import { useInterviewStore } from '../store/interview-store';
import type { AgentEvent } from '@interview-agent/shared-types';
import { isCandidateVisibleAgentEvent } from '../utils/candidateEvents';

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
 * - 候选人只处理 token、可操作错误和完成事件；内部 Agent 事件一律丢弃
 * - 自动重连：最多 3 次，指数退避
 * - 使用 forceRender 机制确保每次 token 更新都触发 React 重渲染
 */
export function useInterviewStream(): UseInterviewStreamReturn {
  const abortRef = useRef<AbortController | null>(null);
  const reconnectingRef = useRef(false);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const send = useCallback(
    async (interviewId: string, userId: string, content: string) => {
      const store = useInterviewStore.getState();
      const clientMessageId = globalThis.crypto?.randomUUID?.()
        || `message-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

      // 1) 把用户消息和空的 assistant 占位压入 store
      store.addMessage({ role: 'user', content, streaming: false });
      store.addMessage({ role: 'assistant', content: '', streaming: true });
      store.setStreaming(true);
      store.setError(null);
      store.forceRender(); // 立即渲染用户消息 + 空 assistant

      const controller = new AbortController();
      abortRef.current = controller;

      let lastError: Error | null = null;

      // 2026-06-23 修复：loading 兜底 — 即使后端 SSE 没正常发 [DONE]，
      // 60 秒无新事件就强制 setStreaming(false)，避免按钮永久转圈。
      // 后端已经在 controller 加了 [DONE] flush 等待，这里是最后防线。
      const STREAM_IDLE_TIMEOUT_MS = 60_000;
      let streamIdleTimer: ReturnType<typeof setTimeout> | null = null;
      const resetStreamIdleTimer = () => {
        if (streamIdleTimer) clearTimeout(streamIdleTimer);
        streamIdleTimer = setTimeout(() => {
          // 60 秒没新事件 + 还在 streaming → 强制兜底
          const currentStreaming = useInterviewStore.getState().streaming;
          if (currentStreaming) {
            useInterviewStore.getState().setError('回复超时，请稍后重试。');
            useInterviewStore.getState().finalizeLastMessage();
            useInterviewStore.getState().setStreaming(false);
            useInterviewStore.getState().forceRender();
          }
        }, STREAM_IDLE_TIMEOUT_MS);
      };
      resetStreamIdleTimer();

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (controller.signal.aborted) break;

        if (attempt > 0) {
          reconnectingRef.current = true;
          store.setReconnecting(true);
          // 重试复用同一个客户端请求 ID。服务端只会重放已经持久化的回复，
          // 或等待原请求完成，因此不会再创建重复回答或触发第二次模型调用。

          store.forceRender();
          await sleep(RETRY_DELAY_MS * Math.pow(2, attempt - 1));
          if (controller.signal.aborted) break;
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
                continue;
              }

              if (!isCandidateVisibleAgentEvent(event)) continue;
              resetStreamIdleTimer();

              if (event.type === 'token' && event.content) {
                store.appendToLastMessage(event.content);
                store.forceRender();
              } else if (event.type === 'error') {
                store.setError(event.error || '当前回答暂时无法处理，请稍后重试。');
                throw new Error(event.error || '当前回答暂时无法处理，请稍后重试。');
              } else if (event.type === 'done') {
                store.finalizeLastMessage();
                store.setStreaming(false);
                store.forceRender();
                return;
              }
            }
          }

          // 正常读完流但无 [DONE] 标记
          store.finalizeLastMessage();
          store.setStreaming(false);
          store.forceRender();
          return;
        } catch (err) {
          if ((err as Error).name === 'AbortError') {
            store.setStreaming(false);
            store.finalizeLastMessage();
            store.forceRender();
            return;
          }
          lastError = err as Error;
          if (attempt < MAX_RETRIES) {
            store.forceRender();
          }
        }
      }

      // 所有重试耗尽
      store.setReconnecting(false);
      store.setStreaming(false);
      store.finalizeLastMessage();
      store.forceRender();
      if (lastError) {
        store.setError(lastError.message);
        store.forceRender();
      }
      // 清理 idle timer
      if (streamIdleTimer) clearTimeout(streamIdleTimer);
    },
    [],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    reconnectingRef.current = false;
    useInterviewStore.getState().reset();
  }, []);

  // 从 store 读取状态（用于触发组件重渲染）
  const streaming = useInterviewStore((s) => s.streaming);
  const reconnecting = useInterviewStore((s) => s.reconnecting);
  const error = useInterviewStore((s) => s.error);

  return { streaming, reconnecting, error, send, reset };
}
