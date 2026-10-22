import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { TrainingPage } from './TrainingPage';

const recommendation = (status: string) => ({ id: 'rec', targetJobId: 'job', targetJobProfileVersion: 1, skillId: 'skill', objective: 'Synthetic objective', prompts: [], expectedEvidence: [], status, skill: { id: 'skill', name: 'Synthetic skill', slug: 'skill' }, targetJob: { id: 'job', title: 'Synthetic job', level: null, profileVersion: 1 }, sourceEvidence: { reason: null, missingEvidence: [], recommendation: null }, attempts: [] });
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
function Location() { return <output data-testid="location">{useLocation().pathname}</output>; }
function setup(status: string, post: (init?: RequestInit) => Promise<Response>) {
  let posts = 0;
  vi.stubGlobal('fetch', vi.fn(async (input, init) => {
    if (init?.method === 'POST') { posts++; return post(init); }
    return json(String(input).endsWith('target-jobs') ? [{ id: 'job', title: 'Synthetic job', isActive: true, profileVersion: 1 }] : [recommendation(status)]);
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/training']}><TrainingPage /><Location /></MemoryRouter></QueryClientProvider>);
  return { client, posts: () => posts, close: () => { view.unmount(); client.clear(); } };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each(['complete', 'retest'])('locks duplicate %s actions while the response is pending', async kind => {
  let release!: (response: Response) => void;
  const held = new Promise<Response>(resolve => { release = resolve; });
  const test = setup(kind === 'complete' ? 'READY' : 'COMPLETED', () => held.then(response => response.clone()));
  const button = await screen.findByRole('button', { name: kind === 'complete' ? '完成训练' : '开始复测' });
  act(() => { fireEvent.click(button); fireEvent.click(button); });
  const disabled = (button as HTMLButtonElement).disabled;
  const refreshDisabled = (screen.getByRole('button', { name: '更新建议' }) as HTMLButtonElement).disabled;
  const count = test.posts();
  await act(async () => { release(json(kind === 'complete' ? { id: 'attempt', recommendationId: 'rec' } : { interviewId: 'interview', interview: { id: 'interview', targetJobId: 'job', practiceSkillId: 'skill', mode: 'SKILL_PRACTICE' } })); });
  test.close();
  expect(count).toBe(1); expect(disabled).toBe(true); expect(refreshDisabled).toBe(true);
});

it('keeps the training route and reports an unconfirmed empty retest receipt', async () => {
  const test = setup('COMPLETED', async () => json({}));
  fireEvent.click(await screen.findByRole('button', { name: '开始复测' }));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('未确认');
  expect(screen.getByTestId('location').textContent).toBe('/training');
  test.close();
});

it.each(['action first', 'refresh first'])('synchronously locks refresh and training together: %s', async order => {
  let release!: (response: Response) => void;
  const held = new Promise<Response>(resolve => { release = resolve; });
  const test = setup('READY', () => held.then(response => response.clone()));
  const complete = await screen.findByRole('button', { name: '完成训练' });
  const refresh = screen.getByRole('button', { name: '更新建议' });
  act(() => { fireEvent.click(order === 'action first' ? complete : refresh); fireEvent.click(order === 'action first' ? refresh : complete); });
  await act(async () => { await Promise.resolve(); });
  const count = test.posts();
  await act(async () => { release(json({ id: 'attempt', recommendationId: 'rec' })); });
  test.close(); expect(count).toBe(1);
});

it.each(['READY', 'COMPLETED'])('shows a failed %s action and permits an explicit retry', async status => {
  let count = 0;
  const test = setup(status, async () => ++count === 1
    ? new Response(JSON.stringify({ message: 'Synthetic unavailable' }), { status: 503 })
    : json(status === 'READY' ? { id: 'attempt', recommendationId: 'rec' }
      : { interviewId: 'interview', interview: { id: 'interview', targetJobId: 'job', practiceSkillId: 'skill', mode: 'SKILL_PRACTICE' } }));
  const name = status === 'READY' ? '完成训练' : '开始复测';
  fireEvent.click(await screen.findByRole('button', { name }));
  expect((await screen.findByRole('alert')).textContent).toContain('Synthetic unavailable');
  expect(screen.getByTestId('location').textContent).toBe('/training');
  expect(test.posts()).toBe(1);
  fireEvent.click(screen.getByRole('button', { name }));
  await waitFor(() => expect(test.posts()).toBe(2));
  if (status === 'COMPLETED') await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/interview/interview'));
  else await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  test.close();
});

it('rejects a completion receipt belonging to another recommendation', async () => {
  const test = setup('READY', async () => json({ id: 'attempt', recommendationId: 'other' }));
  fireEvent.click(await screen.findByRole('button', { name: '完成训练' }));
  expect((await screen.findByRole('alert')).textContent).toContain('未确认');
  expect(screen.getByTestId('location').textContent).toBe('/training');
  test.close();
});

it('does not navigate from a receipt for a previous job profile version', async () => {
  let release!: (response: Response) => void;
  const held = new Promise<Response>(resolve => { release = resolve; });
  const test = setup('COMPLETED', () => held);
  fireEvent.click(await screen.findByRole('button', { name: '开始复测' }));
  await act(async () => { test.client.setQueryData(['target-jobs', 'training'], [{ id: 'job', title: 'Updated synthetic job', isActive: true, profileVersion: 2 }]); });
  await screen.findByText('Updated synthetic job');
  await act(async () => { release(json({ interviewId: 'old', interview: { id: 'old', targetJobId: 'job', practiceSkillId: 'skill', mode: 'SKILL_PRACTICE' } })); });
  expect(screen.getByTestId('location').textContent).toBe('/training');
  expect(screen.queryByRole('alert')).toBeNull();
  test.close();
});

it.each(['complete', 'retest', 'refresh'].flatMap(kind => ['headers', 'body'].map(phase => ({ kind, phase }))))('bounds $kind waiting through stalled $phase without applying a late receipt', async ({ kind, phase }) => {
  let signal: AbortSignal | null | undefined;
  let release!: (response: Response) => void;
  let body!: ReadableStreamDefaultController<Uint8Array>;
  const held = new Promise<Response>(resolve => { release = resolve; });
  const receipt = kind === 'complete' ? { id: 'attempt', recommendationId: 'rec' }
    : kind === 'refresh' ? [] : { interviewId: 'late', interview: { id: 'late', targetJobId: 'job', practiceSkillId: 'skill', mode: 'SKILL_PRACTICE' } };
  const test = setup(kind === 'retest' ? 'COMPLETED' : 'READY', async init => {
    signal = init?.signal;
    return phase === 'headers' ? held : new Response(new ReadableStream({ start(controller) { body = controller; } }));
  });
  const name = kind === 'complete' ? '完成训练' : kind === 'retest' ? '开始复测' : '更新建议';
  const button = await screen.findByRole('button', { name });
  vi.useFakeTimers();
  let alert = '', unlocked = false, route = '', aborted = false, count = 0;
  try {
    await act(async () => { fireEvent.click(button); await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_001); });
    alert = screen.queryByRole('alert')?.textContent || '';
    unlocked = !(button as HTMLButtonElement).disabled;
    aborted = signal?.aborted === true;
    count = test.posts();
    await act(async () => {
      if (phase === 'headers') release(json(receipt));
      else { body.enqueue(new TextEncoder().encode(JSON.stringify(receipt))); body.close(); }
    });
    route = screen.getByTestId('location').textContent || '';
  } finally { test.close(); vi.useRealTimers(); }
  expect(alert).toContain('超时'); expect(alert).toContain('尚未确认');
  expect(unlocked).toBe(true); expect(aborted).toBe(true); expect(count).toBe(1);
  expect(route).toBe('/training');
});

it.each(['retest', 'refresh'].flatMap(kind => ['unmount', 'profile'].map(scope => ({ kind, scope }))))('aborts stalled $kind requests on $scope invalidation without late feedback', async ({ kind, scope }) => {
  let signal: AbortSignal | null | undefined;
  let release!: (response: Response) => void;
  const held = new Promise<Response>(resolve => { release = resolve; });
  const test = setup('COMPLETED', init => { signal = init?.signal; return held; });
  fireEvent.click(await screen.findByRole('button', { name: kind === 'retest' ? '开始复测' : '更新建议' }));
  await waitFor(() => expect(test.posts()).toBe(1));
  try {
    if (scope === 'unmount') test.close();
    else {
      act(() => { test.client.setQueryData(['target-jobs', 'training'], [{ id: 'job', title: 'New synthetic profile', isActive: true, profileVersion: 2 }]); });
      await screen.findByText('New synthetic profile');
    }
    const aborted = signal?.aborted;
    await act(async () => { release(new Response(JSON.stringify({ message: 'Late old failure' }), { status: 503 })); });
    expect(aborted).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(test.posts()).toBe(1);
  } finally { test.close(); }
});
