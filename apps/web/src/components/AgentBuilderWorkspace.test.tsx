import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentBuilderWorkspace } from '../../../agent-lab/src/AgentBuilderWorkspace';
const { transport } = vi.hoisted(() => ({ transport: vi.fn() }));
vi.mock('../../../agent-lab/src/api', () => ({ api: transport }));
const version = { id: 'saved-one', version: '1.0.0', status: 'DRAFT', systemPrompt: 'Saved instruction',
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
  post = vi.fn(); runState = { id: 'run-one', status: 'COMPLETED', application: 'lab-draft-test', estimatedCost: null };
  transport.mockReset().mockImplementation(async (path: string, options?: any) => {
    if (options?.method === 'POST') return post(path, JSON.parse(options.body ?? '{}'));
    if (path === '/agent-lab/agents') return [agent];
    if (path === '/agent-lab/runtime/models') return [{ provider: 'qwen', model: 'Synthetic', enabled: true }];
    if (path === `/agent-lab/agents/${agent.id}`) return agent;
    if (path === `/agent-lab/agents/${agent.id}/versions`) return [version];
    if (path.startsWith('/agent-lab/runs?')) return [];
    if (path.endsWith('/trace')) return [];
    if (path === '/agent-lab/runs/run-one') return runState;
    throw new Error(`Unexpected synthetic path: ${path}`);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); agent.versions.splice(1); });

describe('Agent builder independent product contracts', () => {
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
    post.mockResolvedValue({ id: 'run-one', reused: false }); mount(); await selectSaved();
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
    post.mockRejectedValueOnce(new Error('Synthetic response lost')).mockResolvedValue({ id: 'run-one', reused: true });
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
    post.mockResolvedValue({ id: 'run-one', reused: false }); mount(); await selectSaved(); confirmInput();
    fireEvent.click(screen.getByRole('button', { name: '启动草稿测试' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '取消运行' })).toBeEnabled());
    expect(screen.getByRole('button', { name: '启动草稿测试' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '取消运行' }));
    await screen.findByText('取消已请求；在途调用仍需结算，后续节点停止。');
    expect(post).toHaveBeenCalledWith('/agent-lab/runs/run-one/cancel', {});
  });
});
