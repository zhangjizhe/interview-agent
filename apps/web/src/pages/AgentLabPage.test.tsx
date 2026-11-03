import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentLabPage } from './AgentLabPage';

function renderPage(view?: 'runs' | 'evaluations') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[view ? `/lab/${view}` : '/lab']}>
        <AgentLabPage view={view} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  sessionStorage.clear(); localStorage.clear(); localStorage.setItem('ia_userId', 'synthetic-admin');
});

afterEach(() => {
  vi.unstubAllGlobals(); sessionStorage.clear(); localStorage.clear();
});

describe('AgentLabPage', () => {
  it('渲染工作区概览与 Application 引导操作', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '[]',
    }));

    renderPage();

    expect(await screen.findByRole('heading', { name: '工作区概览' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '接入 Interview' })).toBeInTheDocument();
    expect(await screen.findByText('尚无运行记录')).toBeInTheDocument();
  });

  it('渲染运行记录的空状态', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '[]',
    }));

    renderPage('runs');

    expect(await screen.findByRole('heading', { name: '运行记录' })).toBeInTheDocument();
    expect(await screen.findByText('暂无可查看的运行')).toBeInTheDocument();
  });
  it('supports business contracts and displays JSON errors without creating an evaluator', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '[]' });
    vi.stubGlobal('fetch', fetchMock);
    renderPage('evaluations');
    const form = (await screen.findByRole('heading', { name: '新建评测器' })).closest('form')!;
    expect(within(form).getByLabelText('规则')).toHaveValue('BUSINESS_ASSERTIONS');
    fireEvent.change(within(form).getByLabelText('标识'), { target: { value: 'business-evaluator' } });
    fireEvent.change(within(form).getByLabelText('名称'), { target: { value: 'Business evaluator' } });
    fireEvent.change(within(form).getByLabelText('配置 JSON'), { target: { value: '{broken' } });
    fireEvent.submit(form);
    await screen.findByText('评测器配置 JSON格式无效，请检查引号、逗号和括号。');
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
    fireEvent.change(within(form).getByLabelText('规则'), { target: { value: 'KEYWORD' } });
    expect(within(form).getByLabelText('配置 JSON')).toHaveValue('{"minScore":100}');
  });

  it('submits an idempotent task receipt and renders the persisted score on its actual 0–100 scale', async () => {
    const posted: any[] = [];
    vi.stubGlobal('crypto', { randomUUID: () => 'synthetic-evaluation-request-key' });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      let body: any = [];
      if (init?.method === 'POST') {
        posted.push(JSON.parse(String(init.body)));
        if (posted.length === 1) throw new Error('request interrupted');
        if (posted.length === 2) return { ok: true, text: async () => '' };
        body = { id: 'job', status: 'PENDING', reused: false, totalCases: 1, completedSamples: 0, completedCases: 0, statusUrl: '/api/agent-lab/evaluations/job' };
      } else if (url.endsWith('/agents')) body = [{ id: 'agent', name: 'Fixture agent', currentVersion: { version: '1.0.0' } }];
      else if (url.endsWith('/datasets')) body = [{ id: 'dataset', name: 'Fixture dataset', _count: { cases: 1 } }];
      else if (url.endsWith('/evaluators')) body = [{ id: 'evaluator', name: 'Fixture evaluator', type: 'BUSINESS_ASSERTIONS' }];
      else if (url.endsWith('/evaluations')) body = [{ id: 'evaluation', status: 'COMPLETED', score: 50, totalCases: 1, passedCases: 0, dataset: { name: 'Fixture dataset', version: '1' }, evaluator: { type: 'BUSINESS_ASSERTIONS' } }];
      else if (url.endsWith('/dataset')) body = { cases: [] };
      return { ok: true, text: async () => JSON.stringify(body) };
    });
    vi.stubGlobal('fetch', fetchMock);
    const firstMount = renderPage('evaluations');
    let execute = await screen.findByRole('button', { name: '执行' });
    fireEvent.change((await screen.findByRole('option', { name: 'Fixture agent · 1.0.0' })).parentElement!, { target: { value: 'agent' } });
    fireEvent.change((await screen.findByRole('option', { name: 'Fixture dataset · 1 cases' })).parentElement!, { target: { value: 'dataset' } });
    fireEvent.change((await screen.findByRole('option', { name: 'Fixture evaluator · BUSINESS_ASSERTIONS' })).parentElement!, { target: { value: 'evaluator' } });
    await waitFor(() => expect(execute).toBeEnabled());
    await screen.findByText('0 / 1 · 50.0 / 100');
    fireEvent.click(execute); await screen.findByText('request interrupted');
    await waitFor(() => expect(execute).toBeEnabled()); fireEvent.click(execute);
    await screen.findByText(/提交结果未确认/);
    firstMount.unmount();
    renderPage('evaluations');
    execute = await screen.findByRole('button', { name: '执行' });
    fireEvent.change((await screen.findByRole('option', { name: 'Fixture agent · 1.0.0' })).parentElement!, { target: { value: 'agent' } });
    fireEvent.change((await screen.findByRole('option', { name: 'Fixture dataset · 1 cases' })).parentElement!, { target: { value: 'dataset' } });
    fireEvent.change((await screen.findByRole('option', { name: 'Fixture evaluator · BUSINESS_ASSERTIONS' })).parentElement!, { target: { value: 'evaluator' } });
    await waitFor(() => expect(execute).toBeEnabled()); fireEvent.click(execute);
    await waitFor(() => expect(posted).toHaveLength(3));
    expect(posted[2].requestKey).toBe(posted[0].requestKey);
    expect(posted[0].requestKey).toBe('synthetic-evaluation-request-key');
    expect(posted[1].requestKey).toBe(posted[0].requestKey);
    expect(screen.queryByText(/5000%/)).not.toBeInTheDocument();
  });

});
