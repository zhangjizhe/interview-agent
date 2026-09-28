import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentLabPage } from './AgentLabPage';

function renderPage(view?: 'runs') {
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

afterEach(() => {
  vi.unstubAllGlobals();
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
});
