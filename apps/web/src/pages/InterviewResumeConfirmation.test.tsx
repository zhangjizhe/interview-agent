import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InterviewPage } from './InterviewPage';
import { useInterviewStore } from '../store/interview-store';
vi.mock('../utils/auth', () => ({ getSession: () => ({ userId: 'synthetic-user' }) }));
vi.mock('../hooks/useInterviewStream', () => ({ useInterviewStream: () => ({ send: vi.fn() }) }));
vi.mock('../hooks/usePullToRefresh', () => ({ usePullToRefresh: () => ({ pullDistance: 0, refreshing: false, pullRef: { current: null } }) }));
const resume = { name: 'Synthetic candidate', position: 'Synthetic role', summary: 'Synthetic profile', skills: 'TypeScript', createdAt: '2026-10-19T00:00:00Z' };
let confirm: () => Promise<Response>;
let transport: ReturnType<typeof vi.fn>;
function mount() {
  render(<MemoryRouter initialEntries={['/interview/synthetic-interview']}><Routes><Route path="/interview/:id" element={<InterviewPage />} /></Routes></MemoryRouter>);
}
function confirmationCalls() { return transport.mock.calls.filter(call => String(call[0]).endsWith('/confirm-resume')); }
beforeEach(() => {
  useInterviewStore.getState().reset();
  useInterviewStore.setState({ resume, resumeConfirmed: false, interviewStatus: 'IN_PROGRESS' });
  confirm = async () => new Response(JSON.stringify({ success: true }), { status: 201 });
  transport = vi.fn(async (path: string) => {
    if (path.endsWith('/confirm-resume')) return confirm();
    if (path === '/api/interview/synthetic-interview' || path === '/api/interview/synthetic-second') return new Response(JSON.stringify({ resume, resumeConfirmed: false, status: 'IN_PROGRESS', messages: [] }));
    if (path.startsWith('/api/hitl/graph-status/')) return new Response(JSON.stringify({ isHitlPending: false }));
    throw new Error(`Unexpected synthetic path: ${path}`);
  });
  vi.stubGlobal('fetch', transport);
});
afterEach(() => { cleanup(); useInterviewStore.getState().reset(); vi.unstubAllGlobals(); });

describe('Interview resume confirmation receipt', () => {
  it.each([
    ['forbidden', 403, JSON.stringify({ message: 'Synthetic access denied', success: true }), 'Synthetic access denied'],
    ['server error', 500, JSON.stringify({ message: 'Synthetic server unavailable' }), 'Synthetic server unavailable'],
    ['HTML gateway failure', 502, '<html>unavailable</html>', '服务不可用 (HTTP 502)'],
    ['missing success', 201, '{}', '简历确认结果未确认，请刷新面试状态后核验。'],
    ['false success', 201, '{"success":false}', '简历确认结果未确认，请刷新面试状态后核验。'],
    ['nonboolean success', 201, '{"success":"true"}', '简历确认结果未确认，请刷新面试状态后核验。'],
    ['malformed JSON', 201, '<html>unexpected</html>', '简历确认结果未确认，请刷新面试状态后核验。'],
  ])('keeps the interview locked on %s and displays a recoverable error', async (_label, status, body, message) => {
    confirm = async () => new Response(body, { status });
    mount();
    const button = await screen.findByRole('button', { name: '确认无误，开始面试' });
    await waitFor(() => expect(transport).toHaveBeenCalledWith('/api/interview/synthetic-interview'));
    fireEvent.click(button);
    expect((await screen.findByRole('alert')).textContent).toBe(message);
    expect(useInterviewStore.getState().resumeConfirmed).toBe(false);
    expect(useInterviewStore.getState().confirming).toBe(false);
    expect(confirmationCalls()).toHaveLength(1);
    expect(screen.getByRole('button', { name: '确认无误，开始面试' }).hasAttribute('disabled')).toBe(false);
  });

  it('retains the lock after a network failure and permits one explicit retry with a valid receipt', async () => {
    confirm = async () => { throw new Error('Synthetic network interruption'); };
    mount();
    fireEvent.click(await screen.findByRole('button', { name: '确认无误，开始面试' }));
    await screen.findByText('Synthetic network interruption');
    expect(useInterviewStore.getState().resumeConfirmed).toBe(false);
    confirm = async () => new Response('{"success":true}', { status: 201 });
    fireEvent.click(screen.getByRole('button', { name: '确认无误，开始面试' }));
    await waitFor(() => expect(useInterviewStore.getState().resumeConfirmed).toBe(true));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(confirmationCalls()).toHaveLength(2);
  });

  it('does not unlock another interview after leaving while confirmation is pending', async () => {
    let release!: (response: Response) => void;
    confirm = () => new Promise(resolve => { release = resolve; });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: '确认无误，开始面试' }));
    await screen.findByRole('button', { name: '正在确认简历' });
    cleanup();
    useInterviewStore.setState({ resumeConfirmed: false, confirming: true });
    await act(async () => { release(new Response('{"success":true}', { status: 201 })); });
    expect(useInterviewStore.getState().resumeConfirmed).toBe(false);
    expect(useInterviewStore.getState().confirming).toBe(true);
  });

  it('starts confirmation for a new route and ignores the previous route response and finalizer', async () => {
    let releaseA!: (response: Response) => void;
    let releaseB!: (response: Response) => void;
    let attempts = 0;
    confirm = () => new Promise(resolve => {
      attempts += 1;
      if (attempts === 1) releaseA = resolve; else releaseB = resolve;
    });
    render(<MemoryRouter initialEntries={['/interview/synthetic-interview']}>
      <Link to="/interview/synthetic-second">Switch interview</Link>
      <Routes><Route path="/interview/:id" element={<InterviewPage />} /></Routes>
    </MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: '确认无误，开始面试' }));
    await screen.findByRole('button', { name: '正在确认简历' });
    fireEvent.click(screen.getByRole('link', { name: 'Switch interview' }));
    const buttonB = await screen.findByRole('button', { name: '确认无误，开始面试' });
    expect(buttonB.hasAttribute('disabled')).toBe(false);
    fireEvent.click(buttonB);
    await screen.findByRole('button', { name: '正在确认简历' });
    expect(confirmationCalls().map(call => call[0])).toEqual([
      '/api/interview/synthetic-interview/confirm-resume', '/api/interview/synthetic-second/confirm-resume',
    ]);
    await act(async () => { releaseA(new Response('{"success":true}', { status: 201 })); });
    expect(useInterviewStore.getState().resumeConfirmed).toBe(false);
    expect(useInterviewStore.getState().confirming).toBe(true);
    expect(screen.getByRole('button', { name: '正在确认简历' }).hasAttribute('disabled')).toBe(true);
    await act(async () => { releaseB(new Response('{"success":true}', { status: 201 })); });
    await waitFor(() => expect(useInterviewStore.getState().resumeConfirmed).toBe(true));
    expect(useInterviewStore.getState().confirming).toBe(false);
  });

  it('waits for the exact successful receipt, exposes pending state and prevents duplicate submissions', async () => {
    let release!: (response: Response) => void;
    confirm = () => new Promise(resolve => { release = resolve; });
    mount();
    const button = await screen.findByRole('button', { name: '确认无误，开始面试' });
    fireEvent.click(button); fireEvent.click(button);
    const pending = await screen.findByRole('button', { name: '正在确认简历' });
    expect(pending.getAttribute('aria-busy')).toBe('true');
    expect(pending.hasAttribute('disabled')).toBe(true);
    expect(useInterviewStore.getState().resumeConfirmed).toBe(false);
    expect(confirmationCalls()).toHaveLength(1);
    release(new Response('{"success":true}', { status: 201 }));
    await waitFor(() => expect(useInterviewStore.getState().resumeConfirmed).toBe(true));
    expect(screen.queryByRole('button', { name: '确认无误，开始面试' })).toBeNull();
  });
});
