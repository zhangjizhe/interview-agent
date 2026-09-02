import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { TrainingPage } from './TrainingPage';

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('TrainingPage', () => {
  beforeEach(() => {
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/interview/target-jobs') {
        return Promise.resolve(jsonResponse([{
          id: 'job-1',
          title: 'AI Agent Engineer',
          level: 'P5',
          isActive: true,
          profileVersion: 2,
        }]));
      }
      if (
        url === '/api/interview/target-jobs/job-1/training-recommendations/refresh'
        && init?.method === 'POST'
      ) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url === '/api/interview/training-recommendations?targetJobId=job-1') {
        return Promise.resolve(jsonResponse([]));
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not fabricate a training recommendation when no formal evidence exists', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TrainingPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('还没有可开始的训练'))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: '更新建议' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '开始完整模拟' })).toHaveAttribute('href', '/practice');
    expect((global.fetch as any).mock.calls.some(([url]: [string]) =>
      url === '/api/interview/target-jobs/job-1/training-recommendations/refresh',
    )).toBe(false);
  });
});
