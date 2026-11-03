import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuestionCatalogPanel } from '../../../agent-lab/src/QuestionCatalogPanel';

const legacy = { contractVersion: 'question-catalog/v1', mode: 'LEGACY', canonicalStore: 'milvus-legacy', adoptionRequired: true };
const catalog = { contractVersion: 'question-catalog/v1', mode: 'CATALOG', canonicalStore: 'postgresql', count: 3, pendingIndexCount: 2, legacySourceRetained: true };
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><QuestionCatalogPanel /></QueryClientProvider>);
}
afterEach(() => vi.unstubAllGlobals());
describe('canonical question catalog governance', () => {
  it('requires an explicit maintenance acknowledgment before migration and reads back canonical counts', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reply(legacy)).mockResolvedValueOnce(reply({ contractVersion: 'question-catalog/v1', mode: 'CATALOG', adoptedCount: 3, sourceHash: 'a'.repeat(64), legacySourceRetained: true, providerCalls: 0 })).mockResolvedValue(reply(catalog));
    vi.stubGlobal('fetch', fetcher); mount();
    const migrate = await screen.findByRole('button', { name: '迁移当前组织题库' });
    expect(migrate).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(migrate);
    await screen.findByText(/主数据：PostgreSQL · 3 题 · 待索引 2 题/);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    expect(fetcher.mock.calls[1][0]).toBe('/api/interview/question-bank/catalog/adopt-legacy');
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ maintenanceConfirmed: true });
  });
  it('does not turn an invalid status response into an empty usable catalog', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ ...catalog, pendingIndexCount: 4 }))); mount();
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: /处理待索引/ })).not.toBeInTheDocument();
  });
  it('blocks repeated POST after a malformed receipt until a successful explicit status read', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reply(catalog)).mockResolvedValueOnce(reply({})).mockResolvedValue(reply(catalog));
    vi.stubGlobal('fetch', fetcher); mount();
    const rebuild = await screen.findByRole('button', { name: '处理待索引题目（最多20题）' });
    fireEvent.click(rebuild);
    await screen.findByText(/操作未确认/);
    expect(rebuild).toBeDisabled(); fireEvent.click(rebuild);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '重新读取存储状态' }));
    await waitFor(() => expect(rebuild).toBeEnabled());
  });
  it('preserves pending indexing after an acknowledged partial result', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reply(catalog)).mockResolvedValueOnce(reply({ contractVersion: 'question-catalog/v1', requestedCount: 2, canonicalStatus: 'SAVED', indexStatus: 'PENDING' })).mockResolvedValue(reply(catalog));
    vi.stubGlobal('fetch', fetcher); mount();
    fireEvent.click(await screen.findByRole('button', { name: '处理待索引题目（最多20题）' }));
    await screen.findByText(/主数据已保存，本批索引尚未就绪/);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });
});
