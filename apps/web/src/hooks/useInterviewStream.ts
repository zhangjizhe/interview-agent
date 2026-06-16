import { useState, useRef, useCallback } from 'react';
import type { AgentEvent } from '@interview-agent/shared-types';

interface UseInterviewStreamReturn {
  streaming: boolean;
  send: (interviewId: string, userId: string, content: string) => Promise<void>;
  currentToken: string;
  events: AgentEvent[]; // 工具调用轨迹
  reset: () => void;
}

/**
 * SSE 流式对话 hook
 * 暴露完整事件流，前端能感知工具调用
 */
export function useInterviewStream(): UseInterviewStreamReturn {
  const [streaming, setStreaming] = useState(false);
  const [currentToken, setCurrentToken] = useState('');
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setCurrentToken('');
    setEvents([]);
    setStreaming(false);
  }, []);

  const send = useCallback(async (interviewId: string, userId: string, content: string) => {
    if (streaming) return;
    setStreaming(true);
    setCurrentToken('');
    setEvents([]);

    const controller = new AbortController();
    abortRef.current = controller;

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
            return;
          }
          try {
            const event: AgentEvent = JSON.parse(data);
            // 记录所有事件
            if (event.type === 'token' && event.content) {
              setCurrentToken((prev) => prev + event.content);
            } else if (event.type === 'tool_call' || event.type === 'tool_result' || event.type === 'token_usage') {
              setEvents((prev) => [...prev, event]);
            } else if (event.type === 'error') {
              throw new Error(event.error);
            }
          } catch (e) {
            if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
              console.error('SSE parse error:', e);
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Stream error:', err);
        throw err;
      }
    } finally {
      setStreaming(false);
    }
  }, [streaming]);

  return { streaming, send, currentToken, events, reset };
}
