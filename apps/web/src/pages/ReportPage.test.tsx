import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ReportPage } from './ReportPage';

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('ReportPage', () => {
  beforeEach(() => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === '/api/interview/interview-1') {
        return Promise.resolve(jsonResponse({
          id: 'interview-1',
          status: 'COMPLETED',
          position: 'AI Agent Engineer',
          level: 'P5',
          targetJobId: 'job-1',
          report: {
            overallScore: 76,
            scores: { technical: 78, communication: 72 },
            strengths: '结构清晰',
            weaknesses: '补充证据',
            suggestions: '完成一次定向训练',
          },
        }));
      }
      if (String(input) === '/api/interview/interview-1/evidence') {
        return Promise.resolve(jsonResponse([{
          id: 'evidence-1',
          reason: '回答覆盖了核心流程。',
          missingEvidence: ['量化结果'],
          recommendation: '补充一次结果对比。',
          question: { question: '如何评估 Agent 质量？', category: 'agent', difficulty: 'medium', parentQuestionId: null },
          answer: { content: '通过数据集、质量和成本指标进行评估。', createdAt: '2026-09-02T00:00:00.000Z' },
        }]));
      }
      return Promise.reject(new Error(`Unexpected fetch: ${String(input)}`));
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('shows a completed formal report outside the interview room', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/reports/interview-1']}><Routes><Route path="/reports/:id" element={<ReportPage />} /></Routes></MemoryRouter></QueryClientProvider>);

    expect(await screen.findByRole('heading', { name: 'AI Agent Engineer · P5' })).toBeInTheDocument();
    expect(screen.getByText('76')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看训练' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '问题、回答与评价依据' })).toBeInTheDocument();
    expect(await screen.findByText('如何评估 Agent 质量？')).toBeInTheDocument();
    expect(screen.queryByText(/Token|Prompt|MCP/)).not.toBeInTheDocument();
  });
});
