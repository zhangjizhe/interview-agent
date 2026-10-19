import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { transport } = vi.hoisted(() => ({ transport: vi.fn() }));
vi.mock('react-dom/client', async importOriginal => {
  const actual = await importOriginal<typeof import('react-dom/client')>();
  return { ...actual, createRoot: vi.fn(() => ({ render: vi.fn() })) };
});
vi.mock('../../../agent-lab/src/api', () => ({ api: transport, role: () => 'ADMIN', token: () => 'synthetic', logoutSession: vi.fn() }));
vi.mock('../../../agent-lab/src/AgentBuilderWorkspace', () => ({ AgentBuilderWorkspace: () => null }));
vi.mock('../../../agent-lab/src/QuestionBankWorkspace', () => ({ QuestionBankWorkspace: () => null }));
vi.mock('../../../agent-lab/src/ControlledEvolutionWorkspace', () => ({ ControlledEvolutionWorkspace: () => null }));
import { ControlCenter } from '../../../agent-lab/src/main';

let enabled: boolean;
let brokenReceipt: boolean;
let failRead: boolean;
const scope = '开关仅作用于当前 API 进程，会影响该进程服务的所有组织；不会同步其他实例。重新加载配置保留当前开关，API 重启后恢复配置文件默认值。关闭会阻止后续工具调用，不会取消已经开始的调用。';
const readSuccess = '已重新读取当前 API 进程状态；请核对各工具开关。';
const reloadSuccess = '当前 API 进程的 MCP 配置已重新加载；运行时开关保持不变。';
const dashboard = {
  dataset: { version: 'fixture-v1', caseCount: 1, responseCount: 1, validationStatus: 'VALID' },
  summary: { runCount: 0, failedRunCount: 0, latestDecision: null, experimentCount: 0 },
  thresholds: { qualityScore: 0.8, structuredOutputValidRate: 1, latencyMs: 100, estimatedCostCny: 0 },
  runs: [], decisions: [], experiments: [],
};
async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ControlCenter /></QueryClientProvider>);
  await screen.findByRole('button', { name: '治理 MCP', exact: true });
  fireEvent.click(screen.getByRole('button', { name: '治理 MCP', exact: true }));
  await screen.findByRole('button', { name: '本进程关闭', exact: true });
  return client;
}
beforeEach(() => {
  enabled = true; brokenReceipt = false; failRead = false;
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  transport.mockReset().mockImplementation(async (path: string, options?: RequestInit) => {
    if (path === '/admin/mcp-servers/toggle') {
      enabled = JSON.parse(String(options?.body)).enabled;
      return brokenReceipt ? {} : { ok: true, toolName: 'fixture-tool', enabled };
    }
    if (path === '/admin/mcp-servers/reload') return { ok: true, loaded: 1, errors: [] };
    if (path === '/admin/mcp-servers') {
      if (failRead) throw new Error('Synthetic status read unavailable');
      return { servers: [{ name: 'fixture-tool', displayName: 'Fixture tool', status: 'builtin', enabled }], count: 1, runningCount: Number(enabled) };
    }
    if (path === '/agent-lab/dashboard') return dashboard;
    if (path === '/agent-lab/recorded-imports') return { imports: [] };
    if (path.startsWith('/agent-lab/audit?') || path.startsWith('/agent-lab/operation-logs?')) return { items: [], total: 0, page: 1, limit: 20, hasMore: false };
    if (path.startsWith('/interview/question-bank/list?')) return { results: [] };
    throw new Error(`Unexpected synthetic path: ${path}`);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('MCP workspace process scope and state recovery', () => {
  it('describes the actual process boundary and confirms only the exact applied toggle', async () => {
    await mount();
    expect(screen.getByText(scope)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '本进程关闭', exact: true }));
    await screen.findByText('fixture-tool 已在当前 API 进程关闭。');
    await screen.findByRole('button', { name: '本进程启用', exact: true });
    fireEvent.click(screen.getByRole('button', { name: '本进程启用', exact: true }));
    await screen.findByText('fixture-tool 已在当前 API 进程启用。');
  }, 15_000);

  it('rereads actual disabled state after an unconfirmed mutation and permits an explicit GET recovery', async () => {
    await mount(); brokenReceipt = true;
    const before = transport.mock.calls.filter(call => call[0] === '/admin/mcp-servers').length;
    fireEvent.click(screen.getByRole('button', { name: '本进程关闭', exact: true }));
    await screen.findByText('MCP 开关结果未确认，请重新读取服务状态后核验。');
    await screen.findByRole('button', { name: '本进程启用', exact: true });
    expect(screen.queryByText('fixture-tool 已在当前 API 进程关闭。')).toBeNull();
    expect(transport.mock.calls.filter(call => call[0] === '/admin/mcp-servers').length).toBeGreaterThan(before);
    const start = transport.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: '刷新本进程状态', exact: true }));
    await screen.findByText(readSuccess);
    expect(transport.mock.calls.slice(start)).toEqual([['/admin/mcp-servers']]);
    expect(transport.mock.calls.filter(call => call[0] === '/admin/mcp-servers/toggle')).toHaveLength(1);
  }, 15_000);

  it('does not claim a failed explicit GET refreshed state or change the cached enabled state', async () => {
    await mount(); failRead = true;
    const start = transport.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: '刷新本进程状态', exact: true }));
    await screen.findByText('Synthetic status read unavailable');
    expect(screen.queryByText(readSuccess)).toBeNull();
    expect(screen.getByRole('button', { name: '本进程关闭', exact: true })).toBeTruthy();
    expect(transport.mock.calls.slice(start)).toEqual([['/admin/mcp-servers']]);
  }, 15_000);

  it('requires reload confirmation and reports retained runtime switches after the POST', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: '本进程关闭', exact: true }));
    await screen.findByRole('button', { name: '本进程启用', exact: true });
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: '重新加载 MCP', exact: true }));
    expect(transport.mock.calls.filter(call => call[0] === '/admin/mcp-servers/reload')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '重新加载 MCP', exact: true }));
    await screen.findByText(reloadSuccess);
    await waitFor(() => expect(screen.getByRole('button', { name: '本进程启用', exact: true })).toBeTruthy());
    expect(transport.mock.calls.filter(call => call[0] === '/admin/mcp-servers/reload')).toEqual([['/admin/mcp-servers/reload', { method: 'POST' }]]);
  }, 15_000);
});
