import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ControlCenter, LabSessionGate } from '../../agent-lab/src/main';

const clients: QueryClient[] = [];
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  localStorage.setItem('ia_user_role', 'ADMIN');
  localStorage.setItem('ia_access_token', 'ISOLATED-UI-TEST-NOT-A-REAL-SESSION');
});
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; localStorage.clear(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });
function show(element = <ControlCenter />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
function requests(handler: (path: string) => Response) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (path: string) => { calls.push(String(path)); return handler(String(path)); }));
  return calls;
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
it('opens Trace directly without requesting unrelated dashboard, MCP, imports or audit', async () => {
  window.history.replaceState(null, '', '/?view=trace');
  const calls = requests(path => path === '/api/agent-lab/runs' ? json([]) : json({ message: 'unrelated services unavailable' }, 503));
  show();
  expect(await screen.findByText('暂无运行记录')).toBeInTheDocument();
  expect(calls).toEqual(['/api/agent-lab/runs']);
  expect(screen.queryByRole('button', { name: '重新加载 MCP' })).not.toBeInTheDocument();
});
it('keeps the shell and lets users leave a failed overview without clearing their valid session', async () => {
  const calls = requests(path => path === '/api/agent-lab/runs' ? json([]) : path === '/api/admin/mcp-servers' ? json({ servers: [], runningCount: 0, count: 0 }) : json({ message: 'dashboard fixture unavailable' }, 503));
  show();
  await screen.findByRole('heading', { name: '此页面的数据暂时不可用' });
  expect(screen.getByRole('button', { name: '重试读取' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Trace', exact: true }));
  await screen.findByText('暂无运行记录');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(localStorage.getItem('ia_access_token')).toBe('ISOLATED-UI-TEST-NOT-A-REAL-SESSION');
  expect(calls).not.toContain('/api/agent-lab/recorded-imports');
});
it('keeps authentication failure as session expiry instead of a retryable workspace error', async () => {
  window.history.replaceState(null, '', '/?view=trace');
  requests(() => json({ message: 'expired' }, 401));
  show(<LabSessionGate />);
  await screen.findByRole('heading', { name: '进入控制台' });
  await waitFor(() => expect(localStorage.getItem('ia_access_token')).toBeNull());
  expect(screen.queryByRole('navigation', { name: 'Agent Lab 导航' })).not.toBeInTheDocument();
});
