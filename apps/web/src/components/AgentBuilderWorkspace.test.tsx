import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentBuilderWorkspace } from '../../../agent-lab/src/AgentBuilderWorkspace';
const { transport } = vi.hoisted(() => ({ transport: vi.fn() }));
vi.mock('../../../agent-lab/src/api', () => ({ api: transport }));
const version = { id: 'saved-one', agentId: 'agent-one', version: '1.0.0', status: 'DRAFT', systemPrompt: 'Saved instruction',
  modelConfig: { provider: 'qwen', maxTokens: 32, temperature: 0 }, runtimeConfig: { adapter: 'single-agent-v1', maxEstimatedCostCny: 0.05, maxDurationMs: 10000 } };
const agent = { id: 'agent-one', name: 'Synthetic Agent', key: 'synthetic-agent', type: 'CUSTOM', versions: [version] };
let post: ReturnType<typeof vi.fn>;
let runState: any;
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><AgentBuilderWorkspace/></QueryClientProvider>);
}
async function selectSaved() {
  await screen.findByRole('option', { name: 'Synthetic Agent · synthetic-agent' });
  fireEvent.change(screen.getByLabelText('选择 Agent'), { target: { value: agent.id } });
  await screen.findByRole('option', { name: /1.0.0 · DRAFT · single-agent/ });
  fireEvent.change(screen.getByLabelText('读取版本'), { target: { value: version.id } });
  await screen.findByText(/受控测试 · 1.0.0/);
}
function confirmInput() {
  fireEvent.change(screen.getByLabelText('测试输入'), { target: { value: 'Synthetic test input' } });
  fireEvent.click(screen.getByLabelText('确认按已保存版本启动模型调用及预算'));
}
beforeEach(() => {
  post = vi.fn(); runState = { id: 'run-one', agentId: 'agent-one', agentVersionId: 'saved-one', status: 'COMPLETED', application: 'lab-draft-test', estimatedCost: null };
  transport.mockReset().mockImplementation(async (path: string, options?: any) => {
    if (options?.method === 'POST') return post(path, JSON.parse(options.body ?? '{}'));
    if (path === '/agent-lab/agents') return [agent];
    if (path === '/agent-lab/runtime/models') return [{ provider: 'qwen', model: 'Synthetic', enabled: true }];
    if (path === `/agent-lab/agents/${agent.id}`) return agent;
    if (path === `/agent-lab/agents/${agent.id}/versions`) return [version];
    if (path.startsWith('/agent-lab/runs?')) return [];
    if (path.endsWith('/trace')) return [];
    if (path === '/agent-lab/runs/run-one') {
      const submitted = post.mock.calls.slice().reverse().find(call => call[0].endsWith('/test-runs'))?.[1];
      return { requestKey: submitted?.requestKey, input: submitted?.input, ...runState };
    }
    throw new Error(`Unexpected synthetic path: ${path}`);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); agent.versions.splice(1); });

describe('Agent builder independent product contracts', () => {
  it.each([
    ['missing key', { requestKey: undefined }], ['wrong key', { requestKey: 'other-request' }],
    ['missing input', { input: undefined }], ['wrong input', { input: { message: 'Other request input' } }],
    ['wrong application', { application: 'lab-configured-run' }],
  ])('does not acknowledge a start readback with %s', async (_name, patch) => {
    runState = { ...runState, ...patch };
    post.mockResolvedValue({ id: 'run-one', status: 'COMPLETED', reused: true });
    mount(); await selectSaved(); confirmInput();
    fireEvent.click(screen.getByRole('button', { name: '启动草稿测试' }));
    await screen.findByText(/运行启动未确认/);
    expect(screen.queryByText('已读取原运行，不重复调用模型。')).not.toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
    const key = post.mock.calls[0][1].requestKey;
    delete runState.requestKey; delete runState.input; runState.application = 'lab-draft-test';
    fireEvent.click(screen.getByRole('button', { name: '启动草稿测试' }));
    await screen.findByText('已读取原运行，不重复调用模型。');
    expect(post.mock.calls[1][1].requestKey).toBe(key);
  });

  it.each(['403', '404', '503'])('retains the request key after start readback %s failure', async status => {
    const original = transport.getMockImplementation()!;
    let rejectRead = true;
    transport.mockImplementation(async (path: string, options?: any) => {
      if (path === '/agent-lab/runs/run-one' && rejectRead) throw new Error(`Synthetic read ${status}`);
      return original(path, options);
    });
    post.mockResolvedValue({ id: 'run-one', status: 'COMPLETED', reused: true });
    mount(); await selectSaved(); confirmInput();
    fireEvent.click(screen.getByRole('button', { name: '启动草稿测试' }));
    await screen.findByText(/运行启动未确认/);
    expect(post).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('heading', { name: '运行 run-one' })).not.toBeInTheDocument();
    rejectRead = false;
    fireEvent.click(screen.getByRole('button', { name: '启动草稿测试' }));
    await screen.findByText('已读取原运行，不重复调用模型。');
    expect(post.mock.calls[0][1].requestKey).toBe(post.mock.calls[1][1].requestKey);
  });

  it.each([
    ['missing agent', { agentId: undefined }], ['wrong agent', { agentId: 'other-agent' }],
    ['missing version', { agentVersionId: undefined }], ['wrong version', { agentVersionId: 'other-version' }],
    ['wrong run', { id: 'other-run' }],
  ])('rejects start readback with %s binding', async (_name, patch) => {
    runState = { ...runState, ...patch };
    post.mockResolvedValue({ id: 'run-one', status: 'COMPLETED', reused: true });
    mount(); await selectSaved(); confirmInput();
    fireEvent.click(screen.getByRole('button', { name: '启动草稿测试' }));
    await screen.findByText(/运行启动未确认/);
    expect(screen.queryByText('已读取原运行，不重复调用模型。')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '运行 run-one' })).not.toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('确认按已保存版本启动模型调用及预算')).toBeChecked();
  });

  it.each(['version', 'agent', 'new'].flatMap(context => ['start', 'cancel'].map(operation => ({ context, operation }))))('clears completed $operation failure after $context context change', async ({ context, operation }) => {
    if (operation === 'cancel') {
      runState = { ...runState, status: 'RUNNING' };
      post.mockResolvedValueOnce({ id: 'run-one', status: 'PENDING', reused: false }).mockRejectedValueOnce(new Error('Synthetic old operation failed'));
    } else post.mockRejectedValueOnce(new Error('Synthetic old operation failed'));
    mount(); await selectSaved(); confirmInput();
    fireEvent.click(screen.getByRole('button', { name: '启动草稿测试' }));
    if (operation === 'cancel') {
      await waitFor(() => expect(screen.getByRole('button', { name: '取消运行' })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: '取消运行' }));
    }
    await screen.findByText('Synthetic old operation failed');
    await waitFor(() => expect(screen.getByRole('button', { name: '新增 Agent / 工作流' })).toBeEnabled());
    if (context === 'new') fireEvent.click(screen.getByRole('button', { name: '新增 Agent / 工作流' }));
    else if (context === 'agent') fireEvent.change(screen.getByLabelText('选择 Agent'), { target: { value: '' } });
    else fireEvent.change(screen.getByLabelText('读取版本'), { target: { value: version.id } });
    await waitFor(() => expect(screen.queryByText('Synthetic old operation failed')).not.toBeInTheDocument());
    expect(post).toHaveBeenCalledTimes(operation === 'cancel' ? 2 : 1);
  });
  it.each(['version', 'agent', 'new'])('clears a completed save failure after changing %s context', async context => {
    post.mockRejectedValue(new Error('Synthetic previous draft failed'));
    mount(); await selectSaved();
    fireEvent.click(screen.getByRole('button', { name: '保存新版本草稿' }));
    await screen.findByText('Synthetic previous draft failed');
    await waitFor(() => expect(screen.getByRole('button', { name: '新增 Agent / 工作流' })).toBeEnabled());
    if (context === 'new') fireEvent.click(screen.getByRole('button', { name: '新增 Agent / 工作流' }));
    else if (context === 'agent') fireEvent.change(screen.getByLabelText('选择 Agent'), { target: { value: '' } });
    else fireEvent.change(screen.getByLabelText('读取版本'), { target: { value: version.id } });
    await waitFor(() => expect(screen.queryByText('Synthetic previous draft failed')).not.toBeInTheDocument());
    expect(post).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['null', null], ['empty', {}],
    ['wrong-id', { id: 'other-run', status: 'RUNNING', cancelRequestedAt: '2026-10-16T00:00:00.000Z' }],
    ['unknown-status', { id: 'run-one', status: 'UNKNOWN', cancelRequestedAt: '2026-10-16T00:00:00.000Z' }],
    ['missing-flag', { id: 'run-one', status: 'RUNNING' }],
    ['null-running-flag', { id: 'run-one', status: 'RUNNING', cancelRequestedAt: null }],
    ['null-pending-flag', { id: 'run-one', status: 'PENDING', cancelRequestedAt: null }],
    ['invalid-date', { id: 'run-one', status: 'RUNNING', cancelRequestedAt: 'not-a-date' }],
    ['normalized-date', { id: 'run-one', status: 'RUNNING', cancelRequestedAt: '123' }],
    ['missing-terminal-flag', { id: 'run-one', status: 'COMPLETED' }],
  ])('does not claim cancellation for an incomplete receipt (%s)', async (_name, receipt) => {
    runState = { ...runState, status: 'RUNNING' };
    post.mockResolvedValueOnce({ id: 'run-one', status: 'PENDING', reused: false }).mockResolvedValueOnce(receipt);
    mount(); await selectSaved(); confirmInput();
    fireEvent.click(screen.getByRole('button', { name: '启动草稿测试' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '取消运行' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '取消运行' }));
    await screen.findByText(/取消结果未确认/);
    await waitFor(() => expect(screen.getByRole('button', { name: '取消运行' })).toBeEnabled());
    expect(screen.getByText('运行 run-one')).toBeInTheDocument();
    expect(screen.queryByText(/取消已请求/)).not.toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(2);
  });
  it.each(['COMPLETED', 'FAILED', 'CANCELLED'])('reports an already terminal %s run without claiming a new cancellation', async status => {
    runState = { ...runState, status: 'RUNNING' };
    post.mockResolvedValueOnce({ id: 'run-one', status: 'PENDING', reused: false }).mockImplementationOnce(async () => {
      runState = { ...runState, status }; return { id: 'run-one', status, cancelRequestedAt: null };
    });
    mount(); await selectSaved(); confirmInput();
    fireEvent.click(screen.getByRole('button', { name: '启动草稿测试' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '取消运行' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '取消运行' }));
    await screen.findByText(`运行已结束（${status}），请核验最终状态；本次未确认取消请求。`);
    await screen.findByText(`状态：${status} · lab-draft-test`);
    expect(screen.queryByText(/取消已请求/)).not.toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(2);
  });
  it.each(['FAILED', 'CANCELLED'])('accepts a reused terminal %s receipt without preparing a new request', async status => {
    runState = { ...runState, status };
    post.mockResolvedValue({ id: 'run-one', status, reused: true });
    mount(); await selectSaved(); confirmInput();
    fireEvent.click(screen.getByRole('button', { name: '启动草稿测试' }));
    await screen.findByText('已读取原运行，不重复调用模型。');
    await screen.findByText(`状态：${status} · lab-draft-test`);
    expect(post).toHaveBeenCalledTimes(1);
  });
  it('retains an existing run when a later start receipt is incomplete and removes stale success', async () => {
    post.mockResolvedValueOnce({ id: 'run-one', status: 'COMPLETED', reused: true }).mockResolvedValueOnce({});
    mount(); await selectSaved(); confirmInput();
    fireEvent.click(screen.getByRole('button', { name: '启动草稿测试' }));
    await screen.findByText('运行 run-one');
    await waitFor(() => expect(screen.getByRole('button', { name: '启动草稿测试' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '启动草稿测试' }));
    await screen.findByText(/运行启动未确认/);
    expect(screen.getByText('运行 run-one')).toBeInTheDocument();
    expect(screen.queryByText('已读取原运行，不重复调用模型。')).not.toBeInTheDocument();
    expect(transport.mock.calls.some(call => call[0] === '/agent-lab/runs/undefined')).toBe(false);
    expect(post.mock.calls[0][1].requestKey).toBe(post.mock.calls[1][1].requestKey);
  });
  it.each([
    ['null', null], ['empty', {}],
    ['blank-id', { id: ' ', status: 'PENDING', reused: false }],
    ['numeric-id', { id: 1, status: 'PENDING', reused: false }],
    ['missing-reused', { id: 'run-one', status: 'PENDING' }],
    ['string-reused', { id: 'run-one', status: 'PENDING', reused: 'false' }],
    ['missing-status', { id: 'run-one', reused: false }],
    ['unknown-status', { id: 'run-one', status: 'UNKNOWN', reused: false }],
  ])('keeps confirmation and request key for an incomplete start receipt (%s)', async (_name, receipt) => {
    post.mockResolvedValueOnce(receipt).mockResolvedValue({ id: 'run-one', status: 'COMPLETED', reused: true });
    mount(); await selectSaved(); confirmInput();
    fireEvent.click(screen.getByRole('button', { name: '启动草稿测试' }));
    await screen.findByText(/运行启动未确认/);
    await waitFor(() => expect(screen.getByRole('button', { name: '启动草稿测试' })).toBeEnabled());
    expect(screen.queryByText(/草稿测试已排队/)).not.toBeInTheDocument();
    expect(screen.queryByText('运行 run-one')).not.toBeInTheDocument();
    expect(screen.getByLabelText('测试输入')).toHaveValue('Synthetic test input');
    expect(screen.getByLabelText('确认按已保存版本启动模型调用及预算')).toBeChecked();
    expect(post).toHaveBeenCalledTimes(1);
    const requestKey = post.mock.calls[0][1].requestKey; expect(requestKey).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '启动草稿测试' }));
    await screen.findByText('已读取原运行，不重复调用模型。');
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][1].requestKey).toBe(requestKey);
  });
  it('restores a running history item with its actual pinned version while editing another version', async () => {
    const other = { ...version, id: 'another-version', version: '1.0.1' }; agent.versions.push(other);
    runState = { ...runState, status: 'RUNNING', agentId: agent.id, agentVersionId: version.id, agent: { name: agent.name }, agentVersion: { id: version.id, version: version.version } };
    const original = transport.getMockImplementation()!;
    transport.mockImplementation((path: string, options?: any) => path.startsWith('/agent-lab/runs?') ? Promise.resolve([runState]) : original(path, options));
    post.mockResolvedValueOnce({ id: 'run-one', status: 'PENDING', reused: false }).mockResolvedValue({ id: 'run-one', status: 'RUNNING', cancelRequestedAt: '2026-10-16T00:00:00.000Z' }); mount(); await selectSaved(); confirmInput();
    fireEvent.click(screen.getByRole('button', { name: '启动草稿测试' }));
    await screen.findByText('运行 run-one');
    fireEvent.change(screen.getByLabelText('读取版本'), { target: { value: other.id } });
    expect(screen.queryByText('运行 run-one')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'run-one · RUNNING' }));
    await screen.findByText(/固定版本：1.0.0/);
    expect(screen.getByLabelText('读取版本')).toHaveValue(other.id);
    expect(screen.getByText(/受控测试 · 1.0.1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消运行' })).toBeEnabled();
    expect(post).toHaveBeenCalledTimes(1);
  });
  it('does not substitute the editor version for missing run provenance', async () => {
    runState = { ...runState, agentVersion: null, agent: null };
    post.mockResolvedValueOnce({ id: 'run-one', status: 'PENDING', reused: false }).mockResolvedValue({ id: 'run-one', status: 'RUNNING', cancelRequestedAt: '2026-10-16T00:00:00.000Z' }); mount(); await selectSaved(); confirmInput();
    fireEvent.click(screen.getByRole('button', { name: '启动草稿测试' }));
    await screen.findByText('运行 run-one');
    await screen.findByText(/固定版本：未记录/);
  });
  it('freezes run target and input while start receipt is pending, restores after refusal', async () => {
    let reject!: (error: Error) => void;
    post.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
    mount(); await selectSaved(); confirmInput();
    fireEvent.click(screen.getByRole('button', { name: '启动草稿测试' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: '新增 Agent / 工作流' })).toBeDisabled();
    expect(screen.getByLabelText('选择 Agent')).toBeDisabled();
    expect(screen.getByLabelText('读取版本')).toBeDisabled();
    expect(screen.getByLabelText('测试输入')).toBeDisabled();
    expect(screen.getByLabelText('确认按已保存版本启动模型调用及预算')).toBeDisabled();
    expect(screen.getByRole('button', { name: '保存新版本草稿' })).toBeDisabled();
    fireEvent.submit(document.querySelector('.builder-workspace form')!);
    expect(post).toHaveBeenCalledTimes(1);
    reject(new Error('Synthetic start receipt refused'));
    await screen.findByText('Synthetic start receipt refused');
    await waitFor(() => expect(screen.getByLabelText('选择 Agent')).toBeEnabled());
    expect(screen.getByLabelText('读取版本')).toHaveValue(version.id);
    expect(screen.getByLabelText('测试输入')).toHaveValue('Synthetic test input');
    expect(post).toHaveBeenCalledTimes(1);
  });
  it('freezes context during cancellation and restores its run after refusal', async () => {
    runState = { ...runState, status: 'RUNNING' };
    const original = transport.getMockImplementation()!;
    transport.mockImplementation((path: string, options?: any) => path.startsWith('/agent-lab/runs?') ? Promise.resolve([{ id: 'run-one', status: 'RUNNING' }]) : original(path, options));
    post.mockResolvedValueOnce({ id: 'run-one', status: 'PENDING', reused: false });
    let reject!: (error: Error) => void;
    post.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    mount(); await selectSaved(); confirmInput();
    fireEvent.click(screen.getByRole('button', { name: '启动草稿测试' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '取消运行' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '取消运行' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('选择 Agent')).toBeDisabled();
    expect(screen.getByLabelText('读取版本')).toBeDisabled();
    expect(screen.getByRole('button', { name: '新增 Agent / 工作流' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'run-one · RUNNING' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '保存新版本草稿' })).toBeDisabled();
    reject(new Error('Synthetic cancel receipt refused'));
    await screen.findByText('Synthetic cancel receipt refused');
    await waitFor(() => expect(screen.getByLabelText('选择 Agent')).toBeEnabled());
    expect(screen.getByText('运行 run-one')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('读取版本'), { target: { value: version.id } });
    expect(screen.queryByText('运行 run-one')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'run-one · RUNNING' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '取消运行' })).toBeEnabled());
  });
  it('removes the previous selected run when loading another saved version', async () => {
    const other = { ...version, id: 'other-version', version: '1.0.1' }; agent.versions.push(other);
    post.mockResolvedValueOnce({ id: 'run-one', status: 'PENDING', reused: false }).mockResolvedValue({ id: 'run-one', status: 'RUNNING', cancelRequestedAt: '2026-10-16T00:00:00.000Z' }); mount(); await selectSaved(); confirmInput();
    fireEvent.click(screen.getByRole('button', { name: '启动草稿测试' }));
    await screen.findByText('运行 run-one');
    fireEvent.change(screen.getByLabelText('读取版本'), { target: { value: other.id } });
    expect(screen.queryByText('运行 run-one')).not.toBeInTheDocument();
  });
  it.each(['new', 'agent', 'version', 'failed-next-save'])('does not reuse saved feedback for a changed context (%s)', async action => {
    const saved = { ...version, id: 'feedback-version', version: '1.0.1' };
    post.mockImplementationOnce(async () => { agent.versions.push(saved); return saved; });
    mount(); await selectSaved();
    fireEvent.change(screen.getByLabelText('保存为版本'), { target: { value: '1.0.1' } });
    fireEvent.click(screen.getByRole('button', { name: '保存新版本草稿' }));
    await screen.findByText(/草稿已保存/);
    await waitFor(() => expect(screen.getByLabelText('读取版本')).toBeEnabled());
    if (action === 'new') fireEvent.click(screen.getByRole('button', { name: '新增 Agent / 工作流' }));
    else if (action === 'agent') fireEvent.change(screen.getByLabelText('选择 Agent'), { target: { value: '' } });
    else if (action === 'version') fireEvent.change(screen.getByLabelText('读取版本'), { target: { value: version.id } });
    else {
      post.mockRejectedValueOnce(new Error('Synthetic next save refused'));
      fireEvent.change(screen.getByLabelText('保存为版本'), { target: { value: '1.0.2' } });
      fireEvent.click(screen.getByRole('button', { name: '保存新版本草稿' }));
      await screen.findByText('Synthetic next save refused');
    }
    expect(screen.queryByText(/草稿已保存/)).not.toBeInTheDocument();
  });
  it.each([
    ['create', {}],
    ['create', { id: '   ', versions: [{ ...version }] }],
    ['create', { id: agent.id, versions: [] }],
    ['create', { id: agent.id, versions: { 0: { ...version } } }],
    ['create', { id: agent.id, versions: [{ ...version, id: '' }] }],
    ['create', { id: agent.id, versions: [{ ...version, agentId: 'other-agent' }] }],
    ['create', { id: agent.id, versions: [{ ...version, version: '9.9.9' }] }],
    ['create', { id: agent.id, versions: [{ ...version, status: 'PUBLISHED' }] }],
    ['version', {}],
    ['version', { ...version, id: ' ' }],
    ['version', { ...version, agentId: 'other-agent', version: '1.0.1' }],
    ['version', { ...version, id: 'new-version', version: '9.9.9' }],
    ['version', { ...version, version: '1.0.1', status: 'PUBLISHED' }],
  ])('retains %s editor for incomplete save receipt %j', async (mode, receipt) => {
    post.mockResolvedValue(receipt); mount();
    if (mode === 'create') {
      fireEvent.click(screen.getByRole('button', { name: '新增 Agent / 工作流' }));
      fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'Receipt synthetic' } });
      fireEvent.change(screen.getByLabelText('唯一 key'), { target: { value: 'receipt-synthetic' } });
    } else {
      await selectSaved();
      fireEvent.change(screen.getByLabelText('保存为版本'), { target: { value: '1.0.1' } });
    }
    fireEvent.change(screen.getByLabelText('系统提示'), { target: { value: 'Preserve receipt draft' } });
    fireEvent.click(screen.getByRole('button', { name: mode === 'create' ? '创建并保存初始草稿' : '保存新版本草稿' }));
    await screen.findByText(/草稿保存未确认/);
    await waitFor(() => expect(screen.getByLabelText('系统提示')).toBeEnabled());
    expect(screen.getByLabelText('系统提示')).toHaveValue('Preserve receipt draft');
    expect(screen.queryByText(/草稿已保存/)).not.toBeInTheDocument();
    if (mode === 'create') expect(screen.getByLabelText('名称')).toHaveValue('Receipt synthetic');
    else expect(screen.getByLabelText('读取版本')).toHaveValue(version.id);
    expect(post).toHaveBeenCalledTimes(1);
  });
  it('freezes save target and draft until a failed request restores editing', async () => {
    let reject!: (error: Error) => void;
    post.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
    mount(); await screen.findByRole('option', { name: 'Synthetic Agent · synthetic-agent' });
    fireEvent.click(screen.getByRole('button', { name: '新增 Agent / 工作流' }));
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'Pending synthetic' } });
    fireEvent.change(screen.getByLabelText('唯一 key'), { target: { value: 'pending-synthetic' } });
    fireEvent.change(screen.getByLabelText('系统提示'), { target: { value: 'Preserve pending instruction' } });
    fireEvent.click(screen.getByRole('button', { name: '创建并保存初始草稿' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await screen.findByRole('button', { name: '保存中' });
    expect(screen.getByRole('button', { name: '新增 Agent / 工作流' })).toBeDisabled();
    expect(screen.getByLabelText('选择 Agent')).toBeDisabled();
    const form = document.querySelector('.builder-workspace form')!;
    form.querySelectorAll('input,textarea,select,button').forEach(control => expect(control).toBeDisabled());
    reject(new Error('Synthetic pending save failed'));
    await screen.findByText('Synthetic pending save failed');
    expect(screen.getByLabelText('名称')).toHaveValue('Pending synthetic');
    expect(screen.getByLabelText('系统提示')).toHaveValue('Preserve pending instruction');
    expect(screen.getByLabelText('选择 Agent')).toBeEnabled();
    expect(screen.getByRole('button', { name: '新增 Agent / 工作流' })).toBeEnabled();
    form.querySelectorAll('input,textarea,select').forEach(control => expect(control).toBeEnabled());
    expect(post).toHaveBeenCalledTimes(1);
  });
  it.each([{ rows: [] }, { rows: [{ id: 'delayed-run', status: 'COMPLETED' }] }])('shows loading instead of a false empty history until the response arrives (%j)', async ({ rows }) => {
    let complete!: (rows: any[]) => void;
    const deferred = new Promise<any[]>(resolve => { complete = resolve; });
    const defaultTransport = transport.getMockImplementation()!;
    transport.mockImplementation((path: string, options?: any) => path.startsWith('/agent-lab/runs?') ? deferred : defaultTransport(path, options));
    mount(); await selectSaved();
    expect(screen.getByText('正在读取运行记录…')).toBeInTheDocument();
    expect(screen.queryByText('暂无运行')).not.toBeInTheDocument();
    complete(rows);
    if (rows.length) {
      await screen.findByRole('button', { name: 'delayed-run · COMPLETED' });
      expect(screen.queryByText('暂无运行')).not.toBeInTheDocument();
    } else await screen.findByText('暂无运行');
    expect(screen.queryByText('正在读取运行记录…')).not.toBeInTheDocument();
  });
  it('reports creation failure without a saved-success claim', async () => {
    post.mockRejectedValue(new Error('Synthetic persistence failed')); mount();
    fireEvent.click(screen.getByRole('button', { name: '新增 Agent / 工作流' }));
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'New synthetic agent' } });
    fireEvent.change(screen.getByLabelText('唯一 key'), { target: { value: 'new-synthetic' } });
    fireEvent.change(screen.getByLabelText('系统提示'), { target: { value: 'Synthetic instruction' } });
    fireEvent.click(screen.getByRole('button', { name: '创建并保存初始草稿' }));
    await screen.findByRole('alert');
    expect(screen.queryByText(/草稿已保存/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('系统提示')).toHaveValue('Synthetic instruction');
  });
  it('uses the selected saved version despite unsaved edits and displays unknown cost honestly', async () => {
    post.mockResolvedValue({ id: 'run-one', status: 'PENDING', reused: false }); mount(); await selectSaved();
    fireEvent.change(screen.getByLabelText('系统提示'), { target: { value: 'Unsaved instruction' } });
    fireEvent.change(screen.getByLabelText('总预算上限（估算 CNY）'), { target: { value: '0.99' } });
    expect(screen.getByText(/估算总上限 0.05 CNY/)).toBeInTheDocument();
    confirmInput(); fireEvent.click(screen.getByRole('button', { name: '启动草稿测试' }));
    await screen.findByText(/估算费用：未知/);
    expect(post).toHaveBeenCalledWith('/agent-lab/agents/agent-one/test-runs', expect.objectContaining({ agentVersionId: 'saved-one', input: { message: 'Synthetic test input' } }));
    expect(post.mock.calls[0][1]).not.toHaveProperty('systemPrompt');
    expect(post.mock.calls[0][1]).not.toHaveProperty('runtimeConfig');
  });
  it('requires explicit confirmation and reuses the request key after an ambiguous start failure', async () => {
    post.mockRejectedValueOnce(new Error('Synthetic response lost')).mockResolvedValue({ id: 'run-one', status: 'COMPLETED', reused: true });
    mount(); await selectSaved();
    expect(screen.getByRole('button', { name: '启动草稿测试' })).toBeDisabled();
    confirmInput(); fireEvent.click(screen.getByRole('button', { name: '启动草稿测试' }));
    await screen.findByText('Synthetic response lost');
    fireEvent.click(screen.getByRole('button', { name: '启动草稿测试' }));
    await screen.findByText('已读取原运行，不重复调用模型。');
    expect(post.mock.calls[0][1].requestKey).toBe(post.mock.calls[1][1].requestKey);
    expect(post.mock.calls[0][1].requestKey).toBeTruthy();
  });
  it('saves new version edits as a draft and selects the saved response', async () => {
    const saved = { ...version, id: 'saved-two', version: '1.0.1', systemPrompt: 'Edited prompt' };
    post.mockImplementation(async () => { agent.versions.push(saved); return saved; });
    mount(); await selectSaved();
    fireEvent.change(screen.getByLabelText('保存为版本'), { target: { value: '1.0.1' } });
    fireEvent.change(screen.getByLabelText('系统提示'), { target: { value: 'Edited prompt' } });
    fireEvent.click(screen.getByRole('button', { name: '保存新版本草稿' }));
    await screen.findByText(/草稿已保存/);
    expect(post).toHaveBeenCalledWith('/agent-lab/agents/agent-one/versions', expect.objectContaining({ version: '1.0.1', systemPrompt: 'Edited prompt' }));
    expect(screen.getByLabelText('读取版本')).toHaveValue('saved-two');
    agent.versions.splice(1);
  });
  it('requires fresh paid-call confirmation after saving a different version', async () => {
    const saved = { ...version, id: 'saved-two', version: '1.0.1', runtimeConfig: { ...version.runtimeConfig, maxEstimatedCostCny: 1 } };
    post.mockImplementation(async () => { agent.versions.push(saved); return saved; });
    mount(); await selectSaved(); confirmInput();
    expect(screen.getByRole('button', { name: '启动草稿测试' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('保存为版本'), { target: { value: '1.0.1' } });
    fireEvent.change(screen.getByLabelText('总预算上限（估算 CNY）'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '保存新版本草稿' }));
    await screen.findByText(/受控测试 · 1.0.1/);
    expect(screen.getByRole('button', { name: '启动草稿测试' })).toBeDisabled();
    expect(screen.getByLabelText('确认按已保存版本启动模型调用及预算')).not.toBeChecked();
  });
  it('captures fixed-version workflow mappings and conditional routing in the saved payload', async () => {
    post.mockRejectedValue(new Error('Synthetic save stop')); mount();
    await screen.findByRole('option', { name: 'Synthetic Agent · synthetic-agent' });
    fireEvent.click(screen.getByRole('button', { name: '新增 Agent / 工作流' }));
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'Synthetic workflow' } });
    fireEvent.change(screen.getByLabelText('唯一 key'), { target: { value: 'synthetic-workflow' } });
    fireEvent.change(screen.getByLabelText('执行方式'), { target: { value: 'finite-workflow-v1' } });
    fireEvent.click(screen.getByRole('button', { name: '新增节点' }));
    await screen.findByRole('option', { name: /Synthetic Agent @ 1.0.0/ });
    fireEvent.change(screen.getByLabelText('固定 Agent 版本'), { target: { value: 'saved-one' } });
    fireEvent.change(screen.getByLabelText('路由'), { target: { value: 'branch' } });
    fireEvent.change(screen.getByLabelText('回答包含'), { target: { value: 'MATCH' } });
    fireEvent.change(screen.getByLabelText('命中节点'), { target: { value: 'node-2' } });
    fireEvent.change(screen.getByLabelText('未命中节点'), { target: { value: 'node-3' } });
    fireEvent.click(screen.getByRole('button', { name: '创建并保存初始草稿' }));
    await screen.findByRole('alert');
    expect(post.mock.calls[0][1].initialVersion.runtimeConfig.nodes).toEqual([{ id: 'node-1', agentVersionId: 'saved-one', inputFrom: 'input', branch: { contains: 'MATCH', then: 'node-2', else: 'node-3' } }]);
    expect(post.mock.calls[0][1].initialVersion.modelConfig).toEqual({});
  });
  it('requests cancellation of a running job and describes in-flight billing', async () => {
    runState = { ...runState, status: 'RUNNING' };
    post.mockResolvedValueOnce({ id: 'run-one', status: 'PENDING', reused: false }).mockResolvedValue({ id: 'run-one', status: 'RUNNING', cancelRequestedAt: '2026-10-16T00:00:00.000Z' }); mount(); await selectSaved(); confirmInput();
    fireEvent.click(screen.getByRole('button', { name: '启动草稿测试' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '取消运行' })).toBeEnabled());
    expect(screen.getByRole('button', { name: '启动草稿测试' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '取消运行' }));
    await screen.findByText('取消已请求；在途调用仍需结算，后续节点停止。');
    expect(post).toHaveBeenCalledWith('/agent-lab/runs/run-one/cancel', {});
  });
});
