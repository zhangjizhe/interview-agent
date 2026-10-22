import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { TrainingPage } from './TrainingPage';

const json = (value: unknown) => new Response(JSON.stringify(value));
const jobs = [{ id: 'job', title: 'Synthetic job', isActive: true, profileVersion: 1 }];
function Location() { return <output data-testid="read-location">{useLocation().pathname}</output>; }
function setup(fetcher: typeof fetch, existingClient?: QueryClient) {
  vi.stubGlobal('fetch', vi.fn(fetcher));
  const client = existingClient ?? new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/training']}><TrainingPage /><Location /></MemoryRouter></QueryClientProvider>);
  return Object.assign(() => { view.unmount(); client.clear(); }, { client });
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('distinguishes failed jobs from an empty job list and explicitly retries only GET', async () => {
  let calls = 0;
  const close = setup(async (_url, init) => {
    expect(init?.method).not.toBe('POST');
    return ++calls === 1 ? new Response('{}', { status: 503 }) : json([]);
  });
  try {
    expect(await screen.findByRole('alert')).toHaveTextContent('训练建议暂时无法加载');
    expect(screen.queryByText('请先设置当前目标岗位。')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(await screen.findByText('请先设置当前目标岗位。')).toBeInTheDocument();
    expect(calls).toBe(2);
  } finally { close(); }
});

it.each(['jobs', 'recommendations'])('rejects a malformed successful %s payload instead of inventing empty data', async target => {
  const close = setup(async url => json(String(url).endsWith('target-jobs') && target !== 'jobs' ? jobs : {}));
  try { expect(await screen.findByRole('alert')).toHaveTextContent('训练建议暂时无法加载'); }
  finally { close(); }
});

it.each(['jobs', 'recommendations'])('bounds %s response headers and ignores the released obsolete response', async target => {
  let release!: (response: Response) => void;
  const held = new Promise<Response>(resolve => { release = resolve; });
  let signal: AbortSignal | null | undefined;
  let first = true;
  vi.useFakeTimers();
  const close = setup(async (url, init) => {
    const isJobs = String(url).endsWith('target-jobs');
    if (first && (isJobs === (target === 'jobs'))) { first = false; signal = init?.signal; return held; }
    return json(isJobs ? jobs : []);
  });
  try {
    for (let tick = 0; tick < 5; tick++) await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(signal).toBeDefined();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_001); });
    expect(screen.getByRole('alert')).toHaveTextContent('训练建议暂时无法加载');
    expect(signal?.aborted).toBe(true);
    vi.useRealTimers();
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(await screen.findByText('还没有可开始的训练')).toBeInTheDocument();
    await act(async () => { release(json({ obsolete: true })); });
    expect(screen.queryByRole('alert')).toBeNull();
  } finally { close(); }
});

it.each(['jobs', 'recommendations'])('bounds stalled %s response body consumption', async target => {
  let signal: AbortSignal | null | undefined;
  vi.useFakeTimers();
  const close = setup(async (url, init) => {
    const isJobs = String(url).endsWith('target-jobs');
    if (isJobs === (target === 'jobs')) {
      signal = init?.signal;
      return { ok: true, text: () => new Promise<string>(() => {}) } as Response;
    }
    return json(jobs);
  });
  try {
    for (let tick = 0; tick < 5; tick++) await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(signal).toBeDefined();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_001); });
    expect(screen.getByRole('alert')).toHaveTextContent('训练建议暂时无法加载');
    expect(signal?.aborted).toBe(true);
  } finally { close(); }
});

it.each(['complete', 'refresh', 'retest'])('releases a successful %s action after a stalled GET without replaying POST', async kind => {
  let posts = 0;
  let reads = 0;
  let signal: AbortSignal | null | undefined;
  const rec = { id: 'rec', targetJobId: 'job', targetJobProfileVersion: 1, skillId: 'skill', objective: 'Synthetic objective', prompts: [], status: kind === 'retest' ? 'COMPLETED' : 'READY', skill: { name: 'Synthetic skill' }, sourceEvidence: { reason: null } };
  const close = setup(async (url, init) => {
    if (init?.method === 'POST') {
      posts++;
      return json(kind === 'complete' ? { id: 'attempt', recommendationId: 'rec' } : kind === 'refresh' ? []
        : { interviewId: 'interview', interview: { id: 'interview', targetJobId: 'job', practiceSkillId: 'skill', mode: 'SKILL_PRACTICE' } });
    }
    if (String(url).endsWith('target-jobs')) return json(jobs);
    if (++reads === 2) { signal = init?.signal; return new Promise<Response>(() => {}); }
    return json(reads === 1 ? [rec] : []);
  });
  try {
    const button = await screen.findByRole('button', { name: kind === 'complete' ? '完成训练' : kind === 'retest' ? '开始复测' : '更新建议' });
    vi.useFakeTimers();
    await act(async () => { fireEvent.click(button); });
    expect(posts).toBe(1);
    expect(signal).toBeDefined();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_001); });
    expect(screen.getByRole('alert')).toHaveTextContent('训练建议暂时无法加载');
    expect(signal?.aborted).toBe(true);
    expect(screen.getByTestId('read-location')).toHaveTextContent(kind === 'retest' ? '/interview/interview' : '/training');
    vi.useRealTimers();
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(await screen.findByRole('button', { name: '更新建议' })).toBeEnabled();
    expect(posts).toBe(1);
    expect(reads).toBe(3);
  } finally { close(); }
});

it.each(['unmount', 'profile'])('cancels an obsolete recommendation read on %s', async change => {
  let release!: (response: Response) => void;
  const held = new Promise<Response>(resolve => { release = resolve; });
  let signal: AbortSignal | null | undefined;
  let reads = 0;
  const close = setup(async (url, init) => {
    if (String(url).endsWith('target-jobs')) return json(jobs);
    if (++reads === 1) { signal = init?.signal; return held; }
    return json([]);
  });
  try {
    // An observable loading screen alone cannot prove the second GET started.
    await waitFor(() => expect(signal).toBeDefined());
    expect(signal).toBeDefined();
    if (change === 'unmount') close();
    else {
      await act(async () => { close.client.setQueryData(['target-jobs', 'training'], [{ ...jobs[0], profileVersion: 2, title: 'New profile' }]); });
      expect(await screen.findByText('New profile')).toBeInTheDocument();
    }
    expect(signal?.aborted).toBe(true);
    await act(async () => { release(json({ obsolete: true })); });
    expect(screen.queryByRole('alert')).toBeNull();
    if (change === 'profile') expect(screen.getByText('还没有可开始的训练')).toBeInTheDocument();
  } finally { close(); }
});

it('does not inherit an unbounded jobs read started by another page', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let release!: (value: unknown[]) => void;
  const old = client.fetchQuery({ queryKey: ['target-jobs'], queryFn: () => new Promise<unknown[]>(resolve => { release = resolve; }) });
  let reads = 0;
  vi.useFakeTimers();
  const close = setup(async () => { reads++; return new Promise<Response>(() => {}); }, client);
  try {
    await act(async () => { await vi.advanceTimersByTimeAsync(60_001); });
    expect(screen.getByRole('alert')).toHaveTextContent('训练建议暂时无法加载');
    expect(reads).toBe(1);
  } finally { await act(async () => { release([]); await old; }); close(); }
});
