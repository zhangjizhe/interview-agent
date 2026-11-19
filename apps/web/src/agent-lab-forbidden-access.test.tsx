import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { transport } = vi.hoisted(() => ({ transport: vi.fn() }));
vi.mock('react-dom/client', async importOriginal => {
  const actual = await importOriginal<typeof import('react-dom/client')>();
  return { ...actual, createRoot: vi.fn(() => ({ render: vi.fn() })) };
});
vi.mock('../../agent-lab/src/api', () => ({ api: transport, role: () => 'ADMIN', token: () => 'synthetic', logoutSession: vi.fn() }));
vi.mock('../../agent-lab/src/AgentBuilderWorkspace', () => ({ AgentBuilderWorkspace: () => null }));
vi.mock('../../agent-lab/src/QuestionBankWorkspace', () => ({ QuestionBankWorkspace: () => null }));
vi.mock('../../agent-lab/src/ControlledEvolutionWorkspace', () => ({ ControlledEvolutionWorkspace: () => null }));
import { ControlCenter } from '../../agent-lab/src/main';

beforeEach(() => { window.history.replaceState(null, '', '/'); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

it('hides the Lab shell when a control-plane query is forbidden', async () => {
  const forbidden = Object.assign(new Error('Forbidden'), { status: 403 });
  transport.mockImplementation(async (path: string) => {
    if (path === '/agent-lab/dashboard' || path === '/admin/mcp-servers') throw forbidden;
    throw new Error(`Unexpected synthetic path: ${path}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ControlCenter /></QueryClientProvider>);
  await screen.findByRole('heading', { name: '无法读取控制面', exact: true });
  expect(screen.queryByRole('navigation', { name: 'Agent Lab 导航', exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '重新加载 MCP', exact: true })).not.toBeInTheDocument();
});
