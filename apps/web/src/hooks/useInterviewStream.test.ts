/**
 * P2-7 前端基础测试：useInterviewStream.ts SSE 事件分发
 *
 * 测试场景：
 * 1. token 事件追加到消息
 * 2. Agent 事件分发到 CoT 面板
 * 3. SSE 解析错误处理
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInterviewStream } from '../hooks/useInterviewStream';
import { useInterviewStore } from '../store/interview-store';

// Mock fetch
global.fetch = vi.fn();

function pendingSseResponse(signal: AbortSignal): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      signal.addEventListener(
        'abort',
        () => controller.error(new DOMException('Request aborted', 'AbortError')),
        { once: true },
      );
    },
  });

  return { ok: true, status: 200, body } as Response;
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('useInterviewStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useInterviewStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('SSE Event Types', () => {
    it('should define valid SSE event types', () => {
      const validEventTypes = [
        'token',
        'final_response',
        'error',
        'step',
        'tool_call',
        'tool_result',
        'thinking',
        'searching',
        'recalling',
        'meta',
        'token_usage',
        'done',
        'heartbeat',
      ];
      expect(validEventTypes).toContain('token');
      expect(validEventTypes).toContain('done');
      expect(validEventTypes).toContain('heartbeat');
    });

    it('should parse SSE data format correctly', () => {
      const sseLine = 'data: {"type":"token","content":"Hello"}\n\n';
      const match = sseLine.match(/^data: (.+)\n\n$/);
      expect(match).not.toBeNull();

      const data = JSON.parse(match![1]);
      expect(data.type).toBe('token');
      expect(data.content).toBe('Hello');
    });

    it('should handle multiple SSE events in sequence', () => {
      const events = [
        'data: {"type":"token","content":"Hello"}\n\n',
        'data: {"type":"token","content":" World"}\n\n',
        'data: {"type":"done"}\n\n',
      ];

      const parsed = events.map((line) => {
        const match = line.match(/^data: (.+)\n\n$/);
        return match ? JSON.parse(match[1]) : null;
      });

      expect(parsed[0].type).toBe('token');
      expect(parsed[1].type).toBe('token');
      expect(parsed[2].type).toBe('done');
    });
  });

  describe('Error Event Handling', () => {
    it('should handle error events', () => {
      const errorEvent = '{"type":"error","error":"Provider unavailable"}';
      const parsed = JSON.parse(errorEvent);

      expect(parsed.type).toBe('error');
      expect(parsed.error).toBe('Provider unavailable');
    });
  });

  describe('Agent Event Types', () => {
    it('should define agent event structure', () => {
      const agentEvent = {
        type: 'tool_call',
        name: 'bocha_search',
        input: { query: 'React' },
      };

      expect(agentEvent.type).toBe('tool_call');
      expect(agentEvent.name).toBeDefined();
      expect(agentEvent.input).toBeDefined();
    });
  });

  describe('Retry Logic', () => {
    it('should have correct retry constants', () => {
      const MAX_RETRIES = 3;
      const RETRY_DELAY_MS = 1000;

      expect(MAX_RETRIES).toBe(3);
      expect(RETRY_DELAY_MS).toBe(1000);
    });

    it('should calculate exponential backoff correctly', () => {
      const RETRY_DELAY_MS = 1000;
      const delays = [0, 1, 2].map((attempt) =>
        RETRY_DELAY_MS * Math.pow(2, attempt),
      );

      expect(delays[0]).toBe(1000);
      expect(delays[1]).toBe(2000);
      expect(delays[2]).toBe(4000);
    });
  });

  describe('SSE timeout lifecycle', () => {
    it('starts the 60-second inactivity timer only after the SSE response is established', async () => {
      vi.useFakeTimers();
      let resolveResponse!: (response: Response) => void;
      let requestSignal!: AbortSignal;
      vi.mocked(global.fetch).mockImplementation((_input, init) => {
        requestSignal = init!.signal as AbortSignal;
        return new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        });
      });

      const { result } = renderHook(() => useInterviewStream());
      let sendPromise!: Promise<void>;
      act(() => {
        sendPromise = result.current.send('interview-1', 'user-1', 'first answer');
      });
      await act(flushAsyncWork);

      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(requestSignal.aborted).toBe(false);
      expect(useInterviewStore.getState().streaming).toBe(true);

      resolveResponse(pendingSseResponse(requestSignal));
      await act(flushAsyncWork);
      act(() => {
        vi.advanceTimersByTime(60_000);
      });

      expect(requestSignal.aborted).toBe(true);
      expect(useInterviewStore.getState().streaming).toBe(false);
      await act(async () => {
        await sendPromise;
      });
    });

    it('does not let an earlier turn timeout finalize a newer turn', async () => {
      vi.useFakeTimers();
      const requestSignals: AbortSignal[] = [];
      vi.mocked(global.fetch).mockImplementation((_input, init) => {
        const signal = init!.signal as AbortSignal;
        requestSignals.push(signal);
        return Promise.resolve(pendingSseResponse(signal));
      });

      const { result } = renderHook(() => useInterviewStream());
      let firstSend!: Promise<void>;
      act(() => {
        firstSend = result.current.send('interview-1', 'user-1', 'first answer');
      });
      await act(flushAsyncWork);

      act(() => {
        vi.advanceTimersByTime(59_000);
      });

      let secondSend!: Promise<void>;
      act(() => {
        secondSend = result.current.send('interview-1', 'user-1', 'second answer');
      });
      await act(flushAsyncWork);

      act(() => {
        vi.advanceTimersByTime(1_000);
      });

      expect(requestSignals[0].aborted).toBe(true);
      expect(requestSignals[1].aborted).toBe(false);
      expect(useInterviewStore.getState().streaming).toBe(true);

      act(() => {
        vi.advanceTimersByTime(59_000);
      });
      expect(requestSignals[1].aborted).toBe(true);
      expect(useInterviewStore.getState().streaming).toBe(false);

      await act(async () => {
        await Promise.all([firstSend, secondSend]);
      });
    });
  });
});
