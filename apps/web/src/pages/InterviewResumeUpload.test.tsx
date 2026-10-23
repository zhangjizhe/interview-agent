import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { InterviewPage } from './InterviewPage';
import { useInterviewStore } from '../store/interview-store';
vi.mock('../utils/auth', () => ({ getSession: () => ({ userId: 'synthetic-owner' }) }));
vi.mock('../hooks/useInterviewStream', () => ({ useInterviewStream: () => ({ send: vi.fn() }) }));
vi.mock('../hooks/usePullToRefresh', () => ({ usePullToRefresh: () => ({ pullDistance: 0, refreshing: false, pullRef: { current: null } }) }));
afterEach(() => { useInterviewStore.getState().reset(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('rejects a refused upload even when its body carries a forged success flag', async () => {
  const resume = { name: 'Original synthetic', position: 'Backend', summary: 'Synthetic', skills: 'TypeScript' };
  useInterviewStore.getState().reset();
  useInterviewStore.setState({ resume, resumeConfirmed: false, interviewStatus: 'IN_PROGRESS' });
  const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
  let reads = 0;
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    if (init?.method === 'POST') return new Response('{"ragIngested":true,"message":"Synthetic denied"}', { status: 503 });
    if (String(url).includes('/graph-status/')) return new Response('{"isHitlPending":false}');
    reads++;
    return new Response(JSON.stringify({ resume, resumeConfirmed: false, status: 'IN_PROGRESS', messages: [] }));
  }));
  const view = render(<MemoryRouter initialEntries={['/interview/synthetic']}><Routes><Route path="/interview/:id" element={<InterviewPage />} /></Routes></MemoryRouter>);
  try {
    await screen.findByRole('button', { name: '确认无误，开始面试' });
    await waitFor(() => expect(reads).toBe(1));
    const input = view.container.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(['Synthetic'], 'synthetic.txt', { type: 'text/plain' })] } });
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert.mock.calls[0][0]).toContain('Synthetic denied');
    expect(reads).toBe(1);
    expect(useInterviewStore.getState().resume?.name).toBe('Original synthetic');
  } finally { view.unmount(); }
});
