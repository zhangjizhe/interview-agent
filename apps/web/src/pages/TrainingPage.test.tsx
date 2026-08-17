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

    expect(await screen.findByText('当前没有可追溯的训练建议。完成带技能证据的正式面试后，系统会基于能力缺口生成下一步。'))
      .toBeInTheDocument();
  });
});
