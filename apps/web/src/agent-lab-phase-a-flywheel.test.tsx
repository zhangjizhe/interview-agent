import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunInspector } from '../../agent-lab/src/RunInspector';
import { PublishedVersionRollback } from '../../agent-lab/src/main';

const clients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.unstubAllGlobals();
});

function renderWithQuery(element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

function stubApi(
  handler: (url: string, init?: RequestInit) => unknown | Promise<unknown>,
) {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? init.body : undefined,
      });
      const result = await handler(String(url), init);
      return result instanceof Response
        ? result
        : new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' },
          });
    }),
  );
  return calls;
}

describe('Phase A Lab Flywheel UI', () => {
  it('promotes a run into an unfrozen dataset from RunInspector and filters out frozen datasets', async () => {
    const calls = stubApi((url, init) => {
      if (url.endsWith('/agent-lab/runs/run-bad-1')) {
        return {
          id: 'run-bad-1',
          agentId: 'agent-1',
          agentVersionId: 'ver-1',
          status: 'FAILED',
          error: 'timeout',
          latencyMs: 3200,
          estimatedCost: null,
          agentVersion: { version: '1.2.0' },
        };
      }
      if (url.endsWith('/agent-lab/runs/run-bad-1/trace')) {
        return [];
      }
      if (url.endsWith('/agent-lab/datasets')) {
        return [
          { id: 'ds-frozen', name: 'Frozen Regression', version: 'v1', frozenAt: '2026-11-01T00:00:00Z' },
          { id: 'ds-open', name: 'Live Bad Cases', version: 'v2', frozenAt: null },
        ];
      }
      if (url.endsWith('/agent-lab/runs/run-bad-1/promote-to-dataset') && init?.method === 'POST') {
        return { id: 'case-99', key: 'badcase-timeout' };
      }
      return [];
    });

    renderWithQuery(<RunInspector runId="run-bad-1" agentId="agent-1" versionId="ver-1" />);

    const toggleButton = await screen.findByRole('button', { name: '转入回归集' });
    fireEvent.click(toggleButton);

    const select = await screen.findByLabelText('目标数据集');
    expect(screen.getByRole('option', { name: 'Live Bad Cases · v2' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Frozen Regression/ })).not.toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'ds-open' } });
    fireEvent.change(screen.getByLabelText('用例 Key（可选）'), {
      target: { value: 'badcase-timeout' },
    });
    fireEvent.change(screen.getByLabelText('期望关键词（可选，逗号分隔）'), {
      target: { value: '熔断, 降级' },
    });
    fireEvent.change(screen.getByLabelText('Bad Case 备注（可选）'), {
      target: { value: '超时降级未给出清晰提示' },
    });

    fireEvent.click(screen.getByRole('button', { name: '确认转入回归集' }));

    expect(
      await screen.findByText(/已脱敏沉淀为回归用例：badcase-timeout（不触发模型调用）/),
    ).toBeInTheDocument();

    const postCall = calls.find((c) => c.method === 'POST');
    expect(postCall?.url).toContain('/agent-lab/runs/run-bad-1/promote-to-dataset');
    expect(JSON.parse(postCall?.body ?? '{}')).toEqual({
      datasetId: 'ds-open',
      key: 'badcase-timeout',
      expectedKeywords: ['熔断', '降级'],
      note: '超时降级未给出清晰提示',
    });
  });

  it('requires two-step confirmation before rolling back to a historical PUBLISHED version', async () => {
    const calls = stubApi((url, init) => {
      if (url.endsWith('/agent-lab/agents')) {
        return [
          {
            id: 'agent-interview',
            key: 'interview-coach',
            name: 'AI 面试官',
            status: 'ACTIVE',
            currentVersionId: 'ver-2',
            currentVersion: { id: 'ver-2', version: '2.0.0', status: 'PUBLISHED' },
          },
        ];
      }
      if (url.endsWith('/agent-lab/agents/agent-interview/versions')) {
        return [
          { id: 'ver-2', version: '2.0.0', status: 'PUBLISHED', publishedAt: '2026-11-24T10:00:00Z', createdAt: '2026-11-24T09:00:00Z' },
          { id: 'ver-1', version: '1.0.0', status: 'PUBLISHED', publishedAt: '2026-11-20T10:00:00Z', createdAt: '2026-11-20T09:00:00Z' },
          { id: 'ver-draft', version: '2.1.0-rc1', status: 'DRAFT', publishedAt: null, createdAt: '2026-11-24T11:00:00Z' },
        ];
      }
      if (url.endsWith('/agent-lab/agents/agent-interview/versions/ver-1/activate') && init?.method === 'POST') {
        return { id: 'ver-1', version: '1.0.0', status: 'PUBLISHED' };
      }
      return [];
    });

    renderWithQuery(<PublishedVersionRollback />);

    const agentSelect = await screen.findByLabelText('选择 Agent');
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /AI 面试官 · interview-coach/ })).toBeInTheDocument();
    });
    fireEvent.change(agentSelect, { target: { value: 'agent-interview' } });

    expect(await screen.findByText('1.0.0')).toBeInTheDocument();
    // Current active version and DRAFT version must not appear as rollback targets
    expect(screen.queryByText('2.1.0-rc1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '回滚到此版本' }));
    // Not activated yet until confirmed
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: '确认回滚' }));

    expect(
      await screen.findByText(/已安全回滚当前生效版本至 1\.0\.0（已写入审计记录，不调用模型）/),
    ).toBeInTheDocument();

    const activateCall = calls.find((c) => c.method === 'POST');
    expect(activateCall?.url).toContain('/agent-lab/agents/agent-interview/versions/ver-1/activate');
  });
});
