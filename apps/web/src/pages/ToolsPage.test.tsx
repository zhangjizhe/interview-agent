import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToolsPage } from './ToolsPage';

vi.mock('../utils/auth', () => ({ getSession: () => ({ userId: 'candidate-a', role: 'USER' }) }));

describe('ToolsPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      tools: [{ name: 'knowledge', displayName: '知识库', description: '个人检索', emoji: 'K', category: 'knowledge', enabled: true, userEnabled: true }],
      count: 1,
      enabledCount: 1,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
  });

  it('does not request or display MCP control plane operations', async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><ToolsPage /></MemoryRouter></QueryClientProvider>);
    await screen.findByText('知识库');
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText('系统级')).not.toBeInTheDocument();
    expect(screen.queryByText('MCP 服务运行时状态')).not.toBeInTheDocument();
    expect((fetch as any).mock.calls.every(([url]: [string]) => !url.includes('/api/admin/mcp-servers'))).toBe(true);
  });
});
