import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useInterviewStore } from '../store/interview-store';
import { InterviewPage } from './InterviewPage';

const stream = vi.hoisted(() => ({ send: vi.fn() }));
const routing = vi.hoisted(() => ({ id: 'a', navigate: vi.fn(), refresh: undefined as undefined | (() => Promise<void>) }));
vi.mock('react-router-dom', () => ({ useParams: () => ({ id: routing.id }), useNavigate: () => routing.navigate, Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock('../hooks/useInterviewStream', () => ({ useInterviewStream: () => ({ send: stream.send }) }));
vi.mock('../hooks/usePullToRefresh', () => ({ usePullToRefresh: ({ onRefresh }: { onRefresh: () => Promise<void> }) => { routing.refresh = onRefresh; return { pullDistance: 0, refreshing: false, pullRef: { current: null } }; } }));

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

beforeEach(() => { routing.id = 'a'; routing.navigate.mockReset(); stream.send.mockReset(); stream.send.mockResolvedValue(undefined); useInterviewStore.getState().reset(); vi.stubGlobal('fetch', vi.fn()); });

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

it.each(['newer refresh', 'new answer'])('rejects a history snapshot superseded by %s in the same session', async cause => {
  let release!: (response: Response) => void;
  const held = new Promise<Response>(resolve => { release = resolve; });
  const response = (content: string) => ({ ok: true, text: async () => JSON.stringify({ messages: [{ role: 'assistant', content }], resumeConfirmed: false }) }) as Response;
  vi.mocked(fetch).mockImplementationOnce(() => held);
  const view = render(<InterviewPage />);
  if (cause === 'newer refresh') {
    vi.mocked(fetch).mockResolvedValueOnce(response('new history'));
    await act(async () => { await routing.refresh!(); });
  } else {
    act(() => {
      const store = useInterviewStore.getState();
      store.addMessage({ role: 'assistant', content: 'new history', streaming: true });
      store.setStreaming(true);
      store.finalizeLastMessage();
      store.setStreaming(false);
    });
  }
  await act(async () => { release(response('stale history')); });
  expect(useInterviewStore.getState().messages[0].content).toBe('new history');
  view.unmount();
});


it('does not fetch history while an answer is streaming', async () => {
  vi.mocked(fetch).mockResolvedValue({ ok: true, text: async () => '{}' } as Response);
  const view = render(<InterviewPage />);
  await act(async () => { await Promise.resolve(); });
  const count = vi.mocked(fetch).mock.calls.length;
  act(() => { useInterviewStore.getState().setStreaming(true); });
  await act(async () => { await routing.refresh!(); });
  expect(fetch).toHaveBeenCalledTimes(count);
  act(() => { useInterviewStore.getState().setStreaming(false); });
  view.unmount();
});


it('preserves an acknowledged resume confirmation against an older history GET', async () => {
  let release!: (response: Response) => void;
  const held = new Promise<Response>(resolve => { release = resolve; });
  useInterviewStore.getState().setResumeConfirmed(false);
  useInterviewStore.getState().setResume({ name: 'Synthetic resume', position: 'Engineer', summary: '', skills: '', createdAt: '' });
  vi.mocked(fetch).mockImplementationOnce(() => held);
  vi.mocked(fetch).mockResolvedValue({ ok: true, text: async () => JSON.stringify({ success: true, questionProtocol: 'presentation/v1', currentQuestion: validQuestion }) } as Response);
  const view = render(<InterviewPage />);
  await act(async () => { fireEvent.click(view.getByRole('button', { name: '确认无误，开始面试' })); });
  expect(useInterviewStore.getState().resumeConfirmed).toBe(true);
  await act(async () => { release({ ok: true, text: async () => JSON.stringify({ messages: [], resumeConfirmed: false }) } as Response); });
  expect(useInterviewStore.getState().resumeConfirmed).toBe(true);
  view.unmount();
});

it('skips refresh while confirming and allows a fresh read after confirmation failure', async () => {
  let reject!: (error: Error) => void;
  const pending = new Promise<Response>((_resolve, rejectPromise) => { reject = rejectPromise; });
  useInterviewStore.getState().setResumeConfirmed(false);
  useInterviewStore.getState().setResume({ name: 'Synthetic resume', position: 'Engineer', summary: '', skills: '', createdAt: '' });
  vi.mocked(fetch).mockResolvedValueOnce({ ok: true, text: async () => '{}' } as Response);
  const view = render(<InterviewPage />);
  await act(async () => { await Promise.resolve(); });
  vi.mocked(fetch).mockImplementationOnce(() => pending);
  act(() => { fireEvent.click(view.getByRole('button', { name: '确认无误，开始面试' })); });
  const count = vi.mocked(fetch).mock.calls.length;
  await act(async () => { await routing.refresh!(); });
  expect(fetch).toHaveBeenCalledTimes(count);
  await act(async () => { reject(new Error('synthetic confirmation failure')); });
  expect(useInterviewStore.getState().resumeConfirmed).toBe(false);
  vi.mocked(fetch).mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ resumeConfirmed: true }) } as Response);
  await act(async () => { await routing.refresh!(); });
  expect(useInterviewStore.getState().resumeConfirmed).toBe(true);
  view.unmount();
});

it.each(['http failure', 'empty receipt', 'wrong interview', 'blank id', 'conflicting deletion'])('does not complete an interview on an invalid end receipt: %s', async kind => {
  vi.stubGlobal('alert', vi.fn());
  vi.mocked(fetch).mockImplementation(async input => {
    const ending = String(input).endsWith('/end');
    return { ok: !ending || kind !== 'http failure', status: ending && kind === 'http failure' ? 503 : 200,
      text: async () => JSON.stringify(ending ? kind === 'wrong interview' ? { report: { id: 'report', interviewId: 'other' } } : kind === 'blank id' ? { report: { id: '   ', interviewId: 'a' } } : kind === 'conflicting deletion' ? { deleted: true, reason: 'unknown', report: { id: 'report', interviewId: 'a' } } : {} : {}) } as Response;
  });
  const view = render(<InterviewPage />);
  await act(async () => { await Promise.resolve(); });
  act(() => { useInterviewStore.getState().setMessages([{ role: 'user', content: 'Synthetic answer' }]); });
  await act(async () => { fireEvent.click(view.getByRole('button', { name: '结束并生成报告' })); });
  expect(useInterviewStore.getState().interviewStatus).not.toBe('COMPLETED');
  expect(routing.navigate).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalled();
  expect(useInterviewStore.getState().ending).toBe(false);
  view.unmount();
});


it.each(['report', 'deleted'])('accepts the valid end receipt: %s', async kind => {
  vi.stubGlobal('alert', vi.fn());
  vi.mocked(fetch).mockImplementation(async input => ({ ok: true, text: async () => JSON.stringify(String(input).endsWith('/end') ? kind === 'report' ? { report: { id: 'report', interviewId: 'a' } } : { deleted: true, reason: 'no_messages' } : {}) } as Response));
  const view = render(<InterviewPage />);
  await act(async () => { await Promise.resolve(); });
  act(() => { useInterviewStore.getState().setMessages([{ role: 'user', content: 'Synthetic answer' }]); });
  await act(async () => { fireEvent.click(view.getByRole('button', { name: '结束并生成报告' })); });
  if (kind === 'report') {
    expect(useInterviewStore.getState().interviewStatus).toBe('COMPLETED');
    expect(routing.navigate).toHaveBeenCalledWith('/reports/a', { replace: true });
  } else expect(routing.navigate).toHaveBeenCalledWith('/');
  expect(useInterviewStore.getState().ending).toBe(false);
  view.unmount();
});

it.each(['switch', 'return', 'unmount', 'late failure', 'body'])('ignores the old end request after lifecycle change: %s', async mode => {
  vi.stubGlobal('alert', vi.fn());
  let release!: (response: Response) => void;
  const pending = new Promise<Response>(resolve => { release = resolve; });
  vi.mocked(fetch).mockImplementation(async input => String(input).endsWith('/end') ? mode === 'body' ? { ok: true, text: async () => (await pending).text() } as Response : pending : { ok: true, text: async () => '{}' } as Response);
  const view = render(<InterviewPage />);
  await act(async () => { await Promise.resolve(); });
  act(() => { useInterviewStore.getState().setMessages([{ role: 'user', content: 'Synthetic answer' }]); });
  act(() => { fireEvent.click(view.getByRole('button', { name: '结束并生成报告' })); });
  expect(useInterviewStore.getState().ending).toBe(true);
  if (mode === 'unmount') view.unmount();
  else {
    routing.id = 'b'; view.rerender(<InterviewPage />);
    if (mode === 'return') { routing.id = 'a'; view.rerender(<InterviewPage />); }
  }
  await act(async () => { await Promise.resolve(); });
  const endingAtBoundary = useInterviewStore.getState().ending;
  act(() => { useInterviewStore.getState().setEnding(true); });
  await act(async () => { release({ ok: mode !== 'late failure', status: mode === 'late failure' ? 503 : 200, text: async () => JSON.stringify({ report: { id: 'report-a', interviewId: 'a' } }) } as Response); });
  expect(endingAtBoundary).toBe(false);
  expect(useInterviewStore.getState().ending).toBe(true);
  expect(useInterviewStore.getState().interviewStatus).not.toBe('COMPLETED');
  expect(routing.navigate).not.toHaveBeenCalled();
  expect(alert).not.toHaveBeenCalled();
  if (mode !== 'unmount') view.unmount();
});

it.each(['deadline', 'unmount'])('cleans up an end request stalled after response headers: %s', async mode => {
  vi.useFakeTimers(); vi.stubGlobal('alert', vi.fn());
  let signal!: AbortSignal;
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (!String(input).endsWith('/end')) return { ok: true, text: async () => '{}' } as Response;
    signal = init!.signal as AbortSignal;
    return new Response(new ReadableStream({ start(controller) { signal.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')), { once: true }); } }), { status: 200 });
  });
  const view = render(<InterviewPage />);
  await act(async () => { await Promise.resolve(); });
  act(() => { useInterviewStore.getState().setMessages([{ role: 'user', content: 'Synthetic answer' }]); });
  await act(async () => { fireEvent.click(view.getByRole('button', { name: '结束并生成报告' })); });
  if (mode === 'unmount') view.unmount();
  else {
    await act(async () => { await vi.advanceTimersByTimeAsync(59_999); });
    expect(signal.aborted).toBe(false); expect(useInterviewStore.getState().ending).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  }
  await act(async () => { await Promise.resolve(); });
  const aborted = signal.aborted;
  const ending = useInterviewStore.getState().ending;
  if (mode !== 'unmount') view.unmount();
  const timers = vi.getTimerCount(); vi.useRealTimers();
  expect(aborted).toBe(true); expect(ending).toBe(false); expect(timers).toBe(0);
  expect(routing.navigate).not.toHaveBeenCalled();
  if (mode === 'deadline') expect(alert).toHaveBeenCalledWith(expect.stringContaining('超时'));
  else expect(alert).not.toHaveBeenCalled();
});

const validQuestion = { presentationId: 'receipt-a', taskId: 'task-a', messageId: 'message-a', question: 'Explain this exact presented constraint', state: 'OPEN' };
const historyResponse = (data: any) => ({ ok: true, text: async () => JSON.stringify(data) }) as Response;
const readyHistory = (question: any = validQuestion) => historyResponse({ messages: [], status: 'IN_PROGRESS', resumeConfirmed: true, questionProtocol: 'presentation/v1', currentQuestion: question });

it.each(['valid', 'missing protocol', 'missing receipt', 'blank receipt', 'processing'])('gates first answer on confirmed question protocol: %s', async kind => {
  useInterviewStore.getState().setResume({ name: 'Synthetic resume', position: 'Engineer', summary: '', skills: '', createdAt: '' });
  vi.mocked(fetch).mockResolvedValueOnce(historyResponse({ messages: [], resumeConfirmed: false }));
  const view = render(<InterviewPage />);
  await act(async () => { await Promise.resolve(); });
  const question = kind === 'blank receipt' ? { ...validQuestion, presentationId: ' ' } : kind === 'processing' ? { ...validQuestion, state: 'PROCESSING' } : validQuestion;
  const receipt = kind === 'missing protocol' ? { success: true, currentQuestion: question } : { success: true, questionProtocol: 'presentation/v1', ...(kind === 'missing receipt' ? {} : { currentQuestion: question }) };
  vi.mocked(fetch).mockResolvedValueOnce(historyResponse(receipt));
  await act(async () => { fireEvent.click(view.getByRole('button', { name: '确认无误，开始面试' })); });
  expect((view.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(kind !== 'valid');
  expect(useInterviewStore.getState().resumeConfirmed).toBe(kind === 'valid' || kind === 'processing');
  if (kind === 'valid') expect(view.getByRole('region', { name: '当前题目' }).textContent).toContain(validQuestion.question);
  view.unmount();
});

it('submits the exact durable presentation ID and reads the next current question', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(readyHistory());
  const view = render(<InterviewPage />);
  await act(async () => { await Promise.resolve(); });
  vi.mocked(fetch).mockResolvedValueOnce(readyHistory({ ...validQuestion, presentationId: 'receipt-next', question: 'Next authoritative question' }));
  await act(async () => {
    fireEvent.change(view.getByRole('textbox'), { target: { value: 'Synthetic specific answer' } });
    fireEvent.keyDown(view.getByRole('textbox'), { key: 'Enter', ctrlKey: true });
  });
  expect(stream.send).toHaveBeenCalledTimes(1);
  expect(stream.send.mock.calls[0]).toEqual(['a', expect.any(String), 'Synthetic specific answer', 'receipt-a']);
  expect(view.getByRole('region', { name: '当前题目' }).textContent).toContain('Next authoritative question');
  view.unmount();
});

it.each(['headers', 'body'])('bounds after-stream GET %s at ten seconds and rejects late recovery', async mode => {
  vi.useFakeTimers();
  vi.mocked(fetch).mockResolvedValueOnce(readyHistory());
  const view = render(<InterviewPage />);
  await act(async () => { await Promise.resolve(); });
  let release!: (value: any) => void;
  const held = new Promise<any>(resolve => { release = resolve; });
  let signal!: AbortSignal;
  vi.mocked(fetch).mockImplementationOnce((_url, init) => {
    signal = init!.signal as AbortSignal;
    return mode === 'headers' ? held : Promise.resolve({ ok: true, text: () => held } as Response);
  });
  await act(async () => {
    fireEvent.change(view.getByRole('textbox'), { target: { value: 'Synthetic bounded answer' } });
    fireEvent.keyDown(view.getByRole('textbox'), { key: 'Enter', ctrlKey: true });
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(9999); });
  expect(signal.aborted).toBe(false);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(signal.aborted).toBe(true);
  expect(view.getByRole('alert').textContent).toContain('尚未确认');
  expect((view.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true);
  const late = { messages: [], resumeConfirmed: true, questionProtocol: 'presentation/v1', currentQuestion: { ...validQuestion, question: 'Late unsafe replacement' } };
  await act(async () => { release(mode === 'headers' ? historyResponse(late) : JSON.stringify(late)); });
  expect(view.queryByText('Late unsafe replacement')).toBeNull();
  expect(stream.send).toHaveBeenCalledTimes(1);
  view.unmount();
});

it('rejects after-stream GET after switching to a different interview', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(readyHistory());
  const view = render(<InterviewPage />);
  await act(async () => { await Promise.resolve(); });
  let release!: (value: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  await act(async () => {
    fireEvent.change(view.getByRole('textbox'), { target: { value: 'Answer for A only' } });
    fireEvent.keyDown(view.getByRole('textbox'), { key: 'Enter', ctrlKey: true });
  });
  vi.mocked(fetch).mockResolvedValueOnce(readyHistory({ ...validQuestion, presentationId: 'receipt-b', question: 'Authoritative B question' }));
  routing.id = 'b'; view.rerender(<InterviewPage />);
  await act(async () => { await Promise.resolve(); });
  await act(async () => { release(readyHistory({ ...validQuestion, question: 'Stale A question' })); });
  expect(view.getByRole('region', { name: '当前题目' }).textContent).toContain('Authoritative B question');
  expect(view.queryByText('Stale A question')).toBeNull();
  expect(routing.navigate).not.toHaveBeenCalled();
  view.unmount();
});
