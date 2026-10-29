import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acquireEvaluationRequest, confirmEvaluationRequest } from '../../../agent-lab/src/evaluation-receipt';
import { ControlledEvolutionWorkspace } from '../../../agent-lab/src/ControlledEvolutionWorkspace';

// Reuse the existing browser-test toolchain for the independent Lab component.
describe('Lab evaluation evidence presentation', () => {
  let records: any[], fetchMock: any, posted: any[], initialRelease: boolean, gateAllowed: boolean, editableDataset: boolean, evaluationDetail: any, missingReceipt: unknown;
  beforeEach(() => {
    sessionStorage.clear(); localStorage.clear(); localStorage.setItem('ia_userId', 'synthetic-admin');
    records = []; posted = []; initialRelease = false; gateAllowed = false; editableDataset = false; evaluationDetail = null; missingReceipt = undefined;
    vi.stubGlobal('crypto', { randomUUID: () => 'synthetic-browser-request-key' });
    fetchMock = vi.fn(async (path: string, init: any) => {
      let body: any = [];
      if (init?.method === 'POST' && path.endsWith('/evaluations') && missingReceipt !== undefined) { posted.push(JSON.parse(init.body)); const receipt = missingReceipt; missingReceipt = undefined; return { ok: true, status: 202, json: async () => receipt }; }
      if (init?.method === 'POST') { posted.push(init.body ? JSON.parse(init.body) : {}); body = { id: 'job-1', status: 'PENDING', reused: false, totalCases: 12, completedSamples: 0, completedCases: 0, statusUrl: '/api/agent-lab/evaluations/job-1' }; }
      else if (path === '/api/agent-lab/agents') body = [{ id: 'agent', name: 'Interview', currentVersion: initialRelease ? null : { id: 'baseline', version: '1.0.0' } }];
      else if (path.endsWith('/versions')) body = [{ id: 'candidate', version: '1.0.1', status: 'DRAFT' }, { id: 'candidate-2', version: '1.0.2', status: 'DRAFT' }];
      else if (path.endsWith('/release-gate')) body = { expectedCurrentVersionId: null, outcome: { allowed: gateAllowed, reason: gateAllowed ? 'gate allowed' : 'missing evidence' } };
      else if (path.endsWith('/evaluations')) body = records;
      else if (path === '/api/agent-lab/datasets') body = ['dataset-1', 'dataset-2'].map(id => ({ id, name: id, version: '1', frozenAt: editableDataset ? null : '2026-10-08', contentHash: 'hash', _count: { cases: 12 }, metadata: { review: { status: 'APPROVED' } } }));
      else if (path === '/api/agent-lab/evaluators') body = [{ id: 'evaluator', name: 'Keywords', type: 'KEYWORD' }];
      else if (path.startsWith('/api/agent-lab/evaluations/')) body = evaluationDetail;
      else if (path.includes('/comparison?')) body = { datasetId: 'dataset-1', evaluatorId: 'evaluator', releaseRecommendation: 'REJECT', reasons: ['RG-021:answer-cache-isolation-required'], baseline: { score: 100 }, candidate: { score: 100 }, scoreDelta: 0, releaseGate: { ruleSetVersion: 'release-gate/v4' } };
      else if (path.includes('/datasets/')) body = { cases: [] };
      return { ok: true, json: async () => body };
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); localStorage.clear(); });
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

  it('creates the business evaluator with the exact server contract and keeps smoke available', async () => {
    mount(); await ready();
    fireEvent.click(screen.getByText('配置评测资产'));
    expect(screen.getByLabelText('评测规则')).toHaveValue('BUSINESS_ASSERTIONS');
    fireEvent.click(screen.getByRole('button', { name: '创建 Evaluator' }));
    await screen.findByText('Evaluator 已创建。');
    expect(posted[0]).toMatchObject({ type: 'BUSINESS_ASSERTIONS', config: { contractVersion: 'business-assertions/v1' } });
    await waitFor(() => expect(screen.getByRole('button', { name: '创建 Evaluator' })).toBeEnabled());
    fireEvent.change(screen.getByLabelText('评测规则'), { target: { value: 'KEYWORD' } });
    fireEvent.click(screen.getByRole('button', { name: '创建 Evaluator' }));
    await waitFor(() => expect(posted).toHaveLength(2));
    expect(posted[1]).toMatchObject({ type: 'KEYWORD', config: { minScore: 100 } });
  });

  it('rejects malformed case JSON before any request and submits a restored contract with explicit provenance', async () => {
    editableDataset = true;
    mount(); await screen.findByLabelText('业务断言 JSON');
    fireEvent.click(screen.getByText('配置评测资产'));
    fireEvent.change(screen.getByLabelText('Case 责任人'), { target: { value: 'synthetic-maintainer' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /我确认该 Case/ }));
    fireEvent.change(screen.getByLabelText('业务断言 JSON'), { target: { value: '{broken' } });
    const add = screen.getByRole('button', { name: '添加 Case 到当前 Dataset' });
    await waitFor(() => expect(add).toBeEnabled()); fireEvent.click(add);
    await screen.findByText('业务断言 JSON 格式无效，请检查引号、逗号和括号。');
    expect(posted).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '恢复业务断言范例' }));
    fireEvent.click(add);
    await screen.findByText('评测 Case 已加入 Dataset。');
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ expectedOutput: { contractVersion: 'business-assertions/v1', assertions: [
      { id: 'score-range', source: 'response-json', op: 'number-range', minimum: 0, maximum: 1 },
      { id: 'decision', op: 'equals', expected: 'FOLLOW_UP' },
    ] }, metadata: { provenance: { owner: 'synthetic-maintainer', containsPersonalData: false, allowedUse: 'agent-release-evaluation' } } });
  });

  it('shows the persisted assertion failure, trace reference and unassessed semantics', async () => {
    records = [{ id: 'assertion-run', status: 'COMPLETED', score: 50, totalCases: 1, failedCases: 1,
      createdAt: '2026-10-29T01:00:00Z', agentVersion: { version: '1.0.1' }, dataset: { name: 'Contract fixture' }, evaluator: { name: 'Business contract' },
      metrics: { cachePolicy: 'semantic-cache-bypass/v1', qualityEvidence: { kind: 'deterministic-business-contract', scope: 'output-contract', contractHash: 'fixture-contract-hash', assertionCount: 2, passed: 1, failed: 1, unavailable: 0, semanticQuality: 'not-assessed' } } }];
    evaluationDetail = { ...records[0], results: [{ id: 'case-result', passed: false, datasetCase: { key: 'wrong-decision' }, failureMessage: 'decision: expected FOLLOW_UP', evidence: { samples: [{ assertions: [{ id: 'decision', passed: false, reason: 'expected FOLLOW_UP', evidence: { runId: 'persisted-runtime', seq: 3 } }] }] } }] };
    mount();
    fireEvent.click(await screen.findByRole('button', { name: '查看 assertion-run 的逐项证据' }));
    await screen.findByText('decision: expected FOLLOW_UP');
    expect(screen.getByText('wrong-decision · 未通过')).toBeInTheDocument();
    expect(screen.getByText('Trace 引用：persisted-runtime #3')).toBeInTheDocument();
    expect(screen.getAllByText(/语义质量未评估/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '管理员发布' })).toBeDisabled();
  });

  it('surfaces server contract rejection instead of claiming a case was saved', async () => {
    editableDataset = true;
    const original = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (path: string, init: any) => {
      if (path.endsWith('/cases') && init?.method === 'POST') {
        posted.push(JSON.parse(init.body));
        return { ok: false, status: 400, json: async () => ({ message: '不支持断言操作：execute' }) };
      }
      return original(path, init);
    });
    mount(); await screen.findByLabelText('业务断言 JSON');
    fireEvent.click(screen.getByText('配置评测资产'));
    fireEvent.change(screen.getByLabelText('Case 责任人'), { target: { value: 'synthetic-maintainer' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /我确认该 Case/ }));
    fireEvent.change(screen.getByLabelText('业务断言 JSON'), { target: { value: JSON.stringify({ contractVersion: 'business-assertions/v1', assertions: [{ id: 'unsafe', source: 'response-json', op: 'execute', path: ['score'] }] }) } });
    const add = screen.getByRole('button', { name: '添加 Case 到当前 Dataset' });
    await waitFor(() => expect(add).toBeEnabled()); fireEvent.click(add);
    await screen.findByText('不支持断言操作：execute');
    expect(screen.queryByText('评测 Case 已加入 Dataset。')).not.toBeInTheDocument();
    expect(posted).toHaveLength(1);
  });

  it.each([{}, { id: 'job-1', status: 'PENDING', reused: false, totalCases: 12, completedSamples: 0, completedCases: 0, statusUrl: '/api/agent-lab/evaluations/different-job' }])('retains the request key after an unconfirmed 202 receipt: %j', async malformed => {
    let key = 0;
    vi.stubGlobal('crypto', { randomUUID: () => `synthetic-request-key-${++key}` });
    missingReceipt = malformed;
    mount(); await ready();
    const run = screen.getByRole('button', { name: '评测当前基线' });
    fireEvent.click(run);
    await screen.findByText(/提交结果未确认/);
    expect(screen.queryByText(/任务 job-1 已提交/)).not.toBeInTheDocument();
    await waitFor(() => expect(run).toBeEnabled()); fireEvent.click(run);
    await screen.findByText(/任务 job-1 已提交/);
    expect(posted).toHaveLength(2);
    expect(posted[1].requestKey).toBe(posted[0].requestKey);
    expect(key).toBe(1);
  });

  it('recovers the same unknown request after asset changes and a component remount', async () => {
    let key = 0;
    vi.stubGlobal('crypto', { randomUUID: () => `synthetic-request-key-${++key}` });
    missingReceipt = {};
    const originalMount = mount(); await ready();
    fireEvent.click(screen.getByRole('button', { name: '评测当前基线' }));
    await screen.findByText(/提交结果未确认/);
    fireEvent.change(screen.getByLabelText('Dataset'), { target: { value: 'dataset-2' } });
    fireEvent.change(screen.getByLabelText('Dataset'), { target: { value: 'dataset-1' } });
    originalMount.unmount();
    mount(); await ready();
    fireEvent.click(screen.getByRole('button', { name: '评测当前基线' }));
    await screen.findByText(/任务 job-1 已提交/);
    expect(posted).toHaveLength(2);
    expect(posted[1].requestKey).toBe(posted[0].requestKey);
    expect(key).toBe(1);
  });

  it('does not submit a model task when session persistence is unavailable', async () => {
    mount(); await ready();
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage denied'); });
    fireEvent.click(screen.getByRole('button', { name: '评测当前基线' }));
    await screen.findByText(/无法安全保存评测请求/);
    expect(posted).toHaveLength(0);
    blocked.mockRestore();
  });

  it('requires an authenticated client identity namespace before submission', async () => {
    localStorage.removeItem('ia_userId');
    mount(); await ready();
    fireEvent.click(screen.getByRole('button', { name: '评测当前基线' }));
    await screen.findByText(/评测需要当前登录身份/);
    expect(posted).toHaveLength(0);
  });

  it('isolates pending requests per user and removes only an exactly confirmed request', () => {
    let key = 0;
    vi.stubGlobal('crypto', { randomUUID: () => `synthetic-request-key-${++key}` });
    const input = { agentId: 'agent', agentVersionId: 'version', datasetId: 'dataset', evaluatorId: 'evaluator', repeatCount: 3, maxEstimatedCostCny: 3 };
    const first = acquireEvaluationRequest(input);
    localStorage.setItem('ia_userId', 'synthetic-other-admin');
    const other = acquireEvaluationRequest(input);
    expect(other.requestKey).not.toBe(first.requestKey);
    localStorage.setItem('ia_userId', 'synthetic-admin');
    expect(acquireEvaluationRequest(input).requestKey).toBe(first.requestKey);
    confirmEvaluationRequest(first);
    const next = acquireEvaluationRequest(input);
    expect(next.requestKey).not.toBe(first.requestKey);
    confirmEvaluationRequest(first); // Late duplicate cannot erase the next deliberate evaluation.
    expect(acquireEvaluationRequest(input).requestKey).toBe(next.requestKey);
    localStorage.setItem('ia_userId', 'synthetic-other-admin');
    expect(acquireEvaluationRequest(input).requestKey).toBe(other.requestKey);
  });

  it('keeps a confirmed receipt accepted when storage cleanup fails and safely reuses its old key', () => {
    const input = { agentId: 'agent', datasetId: 'dataset', evaluatorId: 'evaluator' };
    const request = acquireEvaluationRequest(input);
    const denied = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage denied'); });
    expect(confirmEvaluationRequest(request)).toBe(false);
    denied.mockRestore();
    expect(acquireEvaluationRequest(input).requestKey).toBe(request.requestKey);
  });

  it('bounds outstanding requests without evicting unknown submissions or storing input', () => {
    let key = 0;
    vi.stubGlobal('crypto', { randomUUID: () => `synthetic-request-key-${++key}` });
    const input = { agentId: 'agent', datasetId: 'dataset', evaluatorId: 'evaluator' };
    const first = acquireEvaluationRequest({ ...input, candidateInput: 'private-answer-marker', token: 'private-token-marker' } as any);
    for (let index = 1; index < 64; index++) acquireEvaluationRequest({ ...input, datasetId: `dataset-${index}` });
    expect(() => acquireEvaluationRequest({ ...input, datasetId: 'dataset-65' })).toThrow(/未确认的评测请求已达上限/);
    expect(acquireEvaluationRequest(input).requestKey).toBe(first.requestKey);
    const persisted = sessionStorage.getItem(first.storageKey)!;
    expect(persisted).not.toContain('private-answer-marker');
    expect(persisted).not.toContain('private-token-marker');
    sessionStorage.setItem(first.storageKey, '{broken');
    expect(() => acquireEvaluationRequest(input)).toThrow(/无法安全保存评测请求/);
  });

});
