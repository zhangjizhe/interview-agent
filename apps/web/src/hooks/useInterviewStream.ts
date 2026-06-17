import { useState, useRef, useCallback } from 'react';
import type { AgentEvent } from '@interview-agent/shared-types';

interface UseInterviewStreamReturn {
  streaming: boolean;
  send: (interviewId: string, userId: string, content: string) => Promise<void>;
  currentToken: string;
  events: AgentEvent[];
  reset: () => void;
  reconnecting: boolean;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * SSE 流式对话 hook
 * - 暴露完整事件流，前端能感知工具调用
 * - 自动重连：网络断开时指数退避重试（最多 3 次）
 */
export function useInterviewStream(): UseInterviewStreamReturn {
  const [streaming, setStreaming] = useState(false);
  const [currentToken, setCurrentToken] = useState('');
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [reconnecting, setReconnecting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setCurrentToken('');
    setEvents([]);
    setStreaming(false);
    setReconnecting(false);
  }, []);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const send = useCallback(
    async (interviewId: string, userId: string, content: string) => {
      if (streaming) return;
      setStreaming(true);
      setCurrentToken('');
      setEvents([]);

      const controller = new AbortController();
      abortRef.current = controller;

      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        // 非首次尝试 → 重连逻辑
        if (attempt > 0) {
          setReconnecting(true);
          const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          console.warn(`[SSE] 重连第 ${attempt} 次，等待 ${delay}ms...`);
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
                setStreaming(false);
                setReconnecting(false);
                return;
              }
              try {
                const event: AgentEvent = JSON.parse(data);
                if (event.type === 'token' && event.content) {
                  setCurrentToken((prev) => prev + event.content);
                } else if (
                  event.type === 'tool_call' ||
                  event.type === 'tool_result' ||
                  event.type === 'token_usage'
                ) {
                  setEvents((prev) => [...prev, event]);
                } else if (event.type === 'error') {
                  throw new Error(event.error);
                }
              } catch (e) {
                if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
                  console.error('[SSE] parse error:', e);
                }
              }
            }
          }

          // 流正常结束（非 [DONE] 关闭，可能是网络断开）
          // 如果是正常完成则退出循环
          if (!lastError) {
            setStreaming(false);
            setReconnecting(false);
            return;
          }
        } catch (err) {
          if ((err as Error).name === 'AbortError') {
            setStreaming(false);
            setReconnecting(false);
            return;
          }
          lastError = err as Error;
          console.error(`[SSE] 第 ${attempt + 1} 次失败:`, err);
        }
      }

      // 所有重试耗尽
      setReconnecting(false);
      setStreaming(false);
      if (lastError) throw lastError;
    },
    [streaming],
  );

  return { streaming, send, currentToken, events, reset, reconnecting };
}
