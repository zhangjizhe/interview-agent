import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useInterviewStore } from '../store/interview-store';
import { InterviewPage } from './InterviewPage';

const routing = vi.hoisted(() => ({ id: 'a', navigate: vi.fn(), refresh: undefined as undefined | (() => Promise<void>) }));
vi.mock('react-router-dom', () => ({ useParams: () => ({ id: routing.id }), useNavigate: () => routing.navigate, Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock('../hooks/useInterviewStream', () => ({ useInterviewStream: () => ({ send: vi.fn() }) }));
vi.mock('../hooks/usePullToRefresh', () => ({ usePullToRefresh: ({ onRefresh }: { onRefresh: () => Promise<void> }) => { routing.refresh = onRefresh; return { pullDistance: 0, refreshing: false, pullRef: { current: null } }; } }));

afterEach(() => { vi.unstubAllGlobals(); });

beforeEach(() => { routing.id = 'a'; routing.navigate.mockReset(); useInterviewStore.getState().reset(); vi.stubGlobal('fetch', vi.fn()); });

it.each(['load', 'refresh', 'body', 'return', 'unmount'])('rejects late history after lifecycle change: %s', async mode => {
  let release!: (value: any) => void;
  const pending = new Promise<any>(resolve => { release = resolve; });
  const stale = { messages: [{ role: 'assistant', content: 'stale history' }], status: 'COMPLETED', resumeConfirmed: false, resume: { name: 'stale resume' } };
  const response = (data: any) => ({ ok: true, text: async () => JSON.stringify(data) }) as Response;
  vi.mocked(fetch).mockImplementationOnce(() => mode === 'refresh' ? Promise.resolve(response({})) : mode === 'body' ? Promise.resolve({ ok: true, text: () => pending } as Response) : pending);
  vi.mocked(fetch).mockResolvedValue(response({ messages: [], status: 'IN_PROGRESS', resumeConfirmed: true }));
  const view = render(<InterviewPage />);
  await act(async () => { await Promise.resolve(); });
  let refresh: Promise<void> | undefined;
  if (mode === 'refresh') {
    vi.mocked(fetch).mockImplementationOnce(() => pending);
    act(() => { refresh = routing.refresh!(); });
  }
  if (mode === 'unmount') view.unmount();
  else {
    routing.id = 'b'; view.rerender(<InterviewPage />);
    if (mode === 'return') { routing.id = 'a'; view.rerender(<InterviewPage />); }
  }
  await act(async () => { await Promise.resolve(); });
  const before = useInterviewStore.getState();
  await act(async () => { release(mode === 'body' ? JSON.stringify(stale) : response(stale)); await refresh; });
  expect(useInterviewStore.getState().messages).toEqual(before.messages);
  expect(useInterviewStore.getState().resume).toEqual(before.resume);
  expect(useInterviewStore.getState().resumeConfirmed).toBe(before.resumeConfirmed);
  expect(useInterviewStore.getState().interviewStatus).toBe(before.interviewStatus);
  expect(routing.navigate).not.toHaveBeenCalled();
  if (mode !== 'unmount') view.unmount();
});

it('applies current load and refresh, and redirects a current completed session', async () => {
  const response = (data: any) => ({ ok: true, text: async () => JSON.stringify(data) }) as Response;
  vi.mocked(fetch).mockResolvedValueOnce(response({ messages: [{ role: 'assistant', content: 'current history' }], status: 'IN_PROGRESS', resumeConfirmed: true }));
  const view = render(<InterviewPage />);
  await act(async () => { await Promise.resolve(); });
  expect(useInterviewStore.getState().messages[0].content).toBe('current history');
  expect(useInterviewStore.getState().resumeConfirmed).toBe(true);
  vi.mocked(fetch).mockResolvedValueOnce(response({ messages: [{ role: 'assistant', content: 'refreshed history' }], resumeConfirmed: false }));
  await act(async () => { await routing.refresh!(); });
  expect(useInterviewStore.getState().messages[0].content).toBe('refreshed history');
  expect(useInterviewStore.getState().resumeConfirmed).toBe(false);
  vi.mocked(fetch).mockResolvedValueOnce(response({ messages: [], status: 'COMPLETED' }));
  routing.id = 'completed'; view.rerender(<InterviewPage />);
  await act(async () => { await Promise.resolve(); });
  expect(routing.navigate).toHaveBeenCalledWith('/reports/completed', { replace: true });
  view.unmount();
});
