import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from './HomePage';

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('HomePage', () => {
  beforeEach(() => {
    localStorage.setItem('ia_access_token', 'test-token');
    localStorage.setItem('ia_userId', 'test-user');
    localStorage.setItem('ia_user_role', 'USER');
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/interview/target-jobs') {
        return Promise.resolve(jsonResponse([{
          id: 'job-1',
          title: '前端开发工程师',
          level: 'P5',
          company: null,
          jobDescription: null,
          isActive: true,
          createdAt: '2026-08-14T00:00:00.000Z',
          updatedAt: '2026-08-14T00:00:00.000Z',
        }]));
      }
      if (url === '/api/interview/target-jobs/job-1/readiness') {
        return Promise.resolve(jsonResponse({
          available: false,
          overallScore: null,
          confidence: 0,
          missingReasons: ['尚未完成可用于准备度的正式面试评价'],
          disclaimer: '准备度是系统估计。',
          components: {
            resumeEvidence: { status: 'AVAILABLE', evidenceCount: 1 },
            interviewPerformance: { status: 'MISSING', evidenceCount: 0 },
            skillCoverage: {
              status: 'MISSING',
              evidenceCount: 0,
              requiredSkillCount: 3,
              assessedSkillCount: 0,
            },
          },
        }));
      }
      if (url === '/api/interview/resumes/test-user') {
        return Promise.resolve(jsonResponse({ resumes: [{ id: 'resume-1' }] }));
      }
      if (url === '/api/interview/list') {
        return Promise.resolve(jsonResponse([{
          id: 'interview-1',
          position: '前端开发工程师',
          level: 'P5',
          status: 'COMPLETED',
          startedAt: '2026-08-14T00:00:00.000Z',
          endedAt: '2026-08-14T01:00:00.000Z',
          targetJobId: 'job-1',
          report: null,
        }]));
      }
      if (url === '/api/interview/empty-rooms?idleMinutes=30') {
        return Promise.resolve(jsonResponse({ emptyRooms: [] }));
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('shows insufficient evidence and a recovery action instead of a fabricated score', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('还不能估计准备度')).toBeInTheDocument();
    expect(screen.getByText('证据不足')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试评价' })).toBeInTheDocument();
    expect(screen.queryByText(/Token/i)).not.toBeInTheDocument();
  });
});
