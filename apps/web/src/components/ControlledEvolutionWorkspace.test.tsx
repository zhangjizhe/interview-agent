import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ControlledEvolutionWorkspace } from '../../../agent-lab/src/ControlledEvolutionWorkspace';

// Reuse the existing browser-test toolchain for the independent Lab component.
describe('Lab evaluation evidence presentation', () => {
  let records: any[], fetchMock: any, posted: any[], initialRelease: boolean, gateAllowed: boolean;
  beforeEach(() => {
    records = []; posted = []; initialRelease = false; gateAllowed = false;
    vi.stubGlobal('crypto', { randomUUID: () => 'synthetic-browser-request-key' });
    fetchMock = vi.fn(async (path: string, init: any) => {
      let body: any = [];
      if (init?.method === 'POST') { posted.push(init.body ? JSON.parse(init.body) : {}); body = { id: 'job-1', status: 'PENDING', reused: false }; }
      else if (path === '/api/agent-lab/agents') body = [{ id: 'agent', name: 'Interview', currentVersion: initialRelease ? null : { id: 'baseline', version: '1.0.0' } }];
      else if (path.endsWith('/versions')) body = [{ id: 'candidate', version: '1.0.1', status: 'DRAFT' }, { id: 'candidate-2', version: '1.0.2', status: 'DRAFT' }];
      else if (path.endsWith('/release-gate')) body = { expectedCurrentVersionId: null, outcome: { allowed: gateAllowed, reason: gateAllowed ? 'gate allowed' : 'missing evidence' } };
      else if (path.endsWith('/evaluations')) body = records;
      else if (path === '/api/agent-lab/datasets') body = ['dataset-1', 'dataset-2'].map(id => ({ id, name: id, version: '1', frozenAt: '2026-10-08', contentHash: 'hash', _count: { cases: 12 }, metadata: { review: { status: 'APPROVED' } } }));
      else if (path === '/api/agent-lab/evaluators') body = [{ id: 'evaluator', name: 'Keywords', type: 'KEYWORD' }];
      else if (path.includes('/comparison?')) body = { datasetId: 'dataset-1', evaluatorId: 'evaluator', releaseRecommendation: 'REJECT', reasons: ['RG-021:answer-cache-isolation-required'], baseline: { score: 100 }, candidate: { score: 100 }, scoreDelta: 0, releaseGate: { ruleSetVersion: 'release-gate/v4' } };
      else if (path.includes('/datasets/')) body = { cases: [] };
      return { ok: true, json: async () => body };
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());
  function mount() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(<QueryClientProvider client={client}><ControlledEvolutionWorkspace /></QueryClientProvider>);
  }
  // Registry/dataset/evaluator queries and default selections require several React commits.
  async function ready() { await waitFor(() => expect(screen.getByRole('button', { name: '同集对比' })).toBeEnabled(), { timeout: 5000 }); }
  it('shows a real denial reason and invalidates the comparison on dataset changes', async () => {
    mount(); await ready(); fireEvent.click(screen.getByRole('button', { name: '同集对比' }));
    await screen.findByText('RG-021:answer-cache-isolation-required');
    expect(fetchMock.mock.calls.some(([url]: any[]) => url.includes('datasetId=dataset-1&evaluatorId=evaluator'))).toBe(true);
    expect(screen.getByRole('button', { name: '管理员发布' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Dataset'), { target: { value: 'dataset-2' } });
    await waitFor(() => expect(screen.queryByText('同集评测结果')).not.toBeInTheDocument());
  });
  it('keeps a network retry idempotent and does not present acceptance as completion', async () => {
    let failed = false;
    fetchMock.mockImplementationOnce(async () => ({ ok: true, json: async () => [{ id: 'agent', name: 'Interview', currentVersion: { id: 'baseline', version: '1.0.0' } }] }));
    const original = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (path: string, init: any) => {
      if (init?.method === 'POST' && !failed) { failed = true; posted.push(JSON.parse(init.body)); throw new Error('network interrupted'); }
      return original(path, init);
    });
    mount(); await ready(); fireEvent.click(screen.getByRole('button', { name: '评测当前基线' }));
    await screen.findByText('network interrupted');
    await waitFor(() => expect(screen.getByRole('button', { name: '评测当前基线' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '评测当前基线' }));
    await screen.findByText(/任务 job-1 已提交/);
    expect(posted).toHaveLength(2); expect(posted[0].requestKey).toBe(posted[1].requestKey);
    expect(screen.queryByText(/评测完成：/)).not.toBeInTheDocument();
  });
  it('shows unknown historical totals and partial costs without fabricated percentages or score', async () => {
    records = [{ id: 'failed', status: 'FAILED', score: null, totalCases: 12, failedCases: 0,
      createdAt: '2026-10-08T01:00:00Z', agentVersion: { version: '1.0.0' }, dataset: { name: 'Fixed fixture' }, evaluator: { name: 'Keywords' },
      metrics: { budget: { completedSamples: 13, spentCny: 0.069285, costEvidenceStatus: 'unavailable' } } }];
    mount(); await screen.findByText('样本 13/总数未记录');
    expect(screen.getByText('得分 —')).toBeInTheDocument(); expect(screen.getByText('费用小计 ¥0.069285')).toBeInTheDocument();
    expect(screen.getByText(/中断费用未知/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('value');
  });
  it('requires a successful first release gate and clears it when assets change', async () => {
    initialRelease = true; gateAllowed = true;
    mount();
    const check = await screen.findByRole('button', { name: '核验首次发布门禁' });
    await waitFor(() => expect(check).toBeEnabled());
    expect(screen.getByRole('button', { name: '管理员发布' })).toBeDisabled();
    fireEvent.click(check);
    await waitFor(() => expect(screen.getByRole('button', { name: '管理员发布' })).toBeEnabled());
    expect(fetchMock.mock.calls.some(([url, init]: any[]) => url.endsWith('/candidate/release-gate') && !init?.method)).toBe(true);
    fireEvent.change(screen.getByLabelText('Dataset'), { target: { value: 'dataset-2' } });
    await waitFor(() => expect(screen.getByRole('button', { name: '管理员发布' })).toBeDisabled());
    fireEvent.click(check);
    await waitFor(() => expect(screen.getByRole('button', { name: '管理员发布' })).toBeEnabled());
    fireEvent.change(screen.getByLabelText('候选版本'), { target: { value: 'candidate-2' } });
    await waitFor(() => expect(screen.getByRole('button', { name: '管理员发布' })).toBeDisabled());
    fireEvent.click(check);
    await waitFor(() => expect(screen.getByRole('button', { name: '管理员发布' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '管理员发布' }));
    await screen.findByText('管理员发布完成，该版本已成为当前正式版本。');
    expect(screen.queryByText(/Interview 将从下一回合/)).not.toBeInTheDocument();
  });
  it('keeps first publication disabled when the server gate denies', async () => {
    initialRelease = true;
    mount();
    const check = await screen.findByRole('button', { name: '核验首次发布门禁' });
    await waitFor(() => expect(check).toBeEnabled()); fireEvent.click(check);
    await screen.findByText(/首次发布门禁：missing evidence/);
    expect(screen.getByRole('button', { name: '管理员发布' })).toBeDisabled();
    expect(posted).toHaveLength(0);
  });

});
