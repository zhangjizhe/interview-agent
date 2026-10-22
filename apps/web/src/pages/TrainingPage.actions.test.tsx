import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { TrainingPage } from './TrainingPage';

const recommendation = (status: string) => ({ id: 'rec', targetJobId: 'job', targetJobProfileVersion: 1, skillId: 'skill', objective: 'Synthetic objective', prompts: [], expectedEvidence: [], status, skill: { id: 'skill', name: 'Synthetic skill', slug: 'skill' }, targetJob: { id: 'job', title: 'Synthetic job', level: null, profileVersion: 1 }, sourceEvidence: { reason: null, missingEvidence: [], recommendation: null }, attempts: [] });
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
function Location() { return <output data-testid="location">{useLocation().pathname}</output>; }
function setup(status: string, post: () => Promise<Response>) {
  let posts = 0;
  vi.stubGlobal('fetch', vi.fn(async (input, init) => {
    if (init?.method === 'POST') { posts++; return post(); }
    return json(String(input).endsWith('target-jobs') ? [{ id: 'job', title: 'Synthetic job', isActive: true, profileVersion: 1 }] : [recommendation(status)]);
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/training']}><TrainingPage /><Location /></MemoryRouter></QueryClientProvider>);
  return { client, posts: () => posts, close: () => { view.unmount(); client.clear(); } };
}
afterEach(() => { vi.unstubAllGlobals(); });

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
  await act(async () => { test.client.setQueryData(['target-jobs'], [{ id: 'job', title: 'Updated synthetic job', isActive: true, profileVersion: 2 }]); });
  await screen.findByText('Updated synthetic job');
  await act(async () => { release(json({ interviewId: 'old', interview: { id: 'old', targetJobId: 'job', practiceSkillId: 'skill', mode: 'SKILL_PRACTICE' } })); });
  expect(screen.getByTestId('location').textContent).toBe('/training');
  expect(screen.queryByRole('alert')).toBeNull();
  test.close();
});
