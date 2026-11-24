import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AgentBuilderWorkspace } from '../../../agent-lab/src/AgentBuilderWorkspace';
const { transport } = vi.hoisted(() => ({ transport: vi.fn() }));
vi.mock('../../../agent-lab/src/api', () => ({ api: transport }));
const published = { id: 'published', agentId: 'one', version: '1.0.0', status: 'PUBLISHED', systemPrompt: 'Fixture', modelConfig: { provider: 'qwen' }, runtimeConfig: { adapter: 'single-agent-v1', maxEstimatedCostCny: .05 } };
let state: string; let confirmWrite: boolean; const clients: QueryClient[] = [];
beforeEach(() => {
  state = 'ACTIVE'; confirmWrite = true;
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  transport.mockReset().mockImplementation(async (path: string, init?: RequestInit) => {
    const agent = { id: 'one', name: 'Historical Agent', key: 'historical-one', type: 'CUSTOM', status: state, currentVersion: published, versions: [published], _count: { versions: 1 } };
    if (path.endsWith('/archive')) { if (confirmWrite) state = 'ARCHIVED'; return {}; }
    if (path.endsWith('/activate')) { if (confirmWrite) state = 'ACTIVE'; return published; }
    if (init?.method) throw new Error('No paid test is allowed');
    if (path === '/agent-lab/agents') return [agent];
    if (path === '/agent-lab/agents/one') return agent;
    if (path === '/agent-lab/agents/one/versions') return [published];
    if (path === '/agent-lab/runtime/models') return [{ provider: 'qwen', model: 'synthetic', enabled: true }];
    if (path.startsWith('/agent-lab/runs?')) return [];
    if (path.startsWith('/agent-lab/data-collections?')) return { items: [], hasMore: false };
    throw new Error(`Unexpected fixture path ${path}`);
  });
});
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.restoreAllMocks(); });
async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  render(<QueryClientProvider client={client}><AgentBuilderWorkspace/></QueryClientProvider>);
  await screen.findByRole('button', { name: /Historical Agent/ });
  fireEvent.click(screen.getByRole('button', { name: /Historical Agent/ }));
  await screen.findByRole('button', { name: '归档停用' });
}
it('shows historical lifecycle state and does not display a stale editor before a version is loaded', async () => {
  await mount();
  expect(screen.getByText('先读取一个历史版本，再修改配置或发起受控测试。')).toBeInTheDocument();
  expect(screen.queryByLabelText('系统提示')).not.toBeInTheDocument();
  expect(transport.mock.calls.every(call => !call[1]?.method)).toBe(true);
});
it('requires confirmation, archives and restores the published version only after exact readback', async () => {
  await mount();
  fireEvent.click(screen.getByRole('button', { name: '归档停用' }));
  expect(transport.mock.calls.some(call => call[0].endsWith('/archive'))).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: '确认状态变更' }));
  await screen.findByRole('button', { name: '恢复启用' });
  expect(screen.getAllByText('已归档停用').length).toBeGreaterThan(0);
  fireEvent.change(screen.getByLabelText('读取版本'), { target: { value: published.id } });
  await screen.findByLabelText('测试输入');
  fireEvent.change(screen.getByLabelText('测试输入'), { target: { value: 'must not call a model' } });
  fireEvent.click(screen.getByLabelText('确认按已保存版本启动模型调用及预算'));
  expect(screen.getByRole('button', { name: '启动草稿测试' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '恢复启用' }));
  fireEvent.click(screen.getByRole('button', { name: '确认状态变更' }));
  await screen.findByText('已恢复启用正式版本。');
  const writes = transport.mock.calls.filter(call => call[1]?.method);
  expect(writes.map(call => call[0])).toEqual(['/agent-lab/agents/one/archive', '/agent-lab/agents/one/versions/published/activate']);
});
it('does not claim a successful status change when the persisted state did not change', async () => {
  await mount(); confirmWrite = false;
  fireEvent.click(screen.getByRole('button', { name: '归档停用' }));
  fireEvent.click(screen.getByRole('button', { name: '确认状态变更' }));
  await screen.findByText('状态更新未确认，请刷新核对后再操作。');
  await waitFor(() => expect(screen.getByRole('button', { name: '确认状态变更' })).toBeEnabled());
  expect(transport.mock.calls.filter(call => call[0].endsWith('/archive'))).toHaveLength(1);
});
