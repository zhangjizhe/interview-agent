import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { KnowledgeLibraryPanel } from '../../agent-lab/src/KnowledgeLibraryPanel';

const items = [
  { id: 'checkpoint', topic: 'LangGraph', title: 'Checkpoint 机制', body: '<script>neverExecute()</script> 已保存的正文', tags: ['状态管理'] },
  { id: 'browser', topic: 'Web', title: '浏览器缓存', body: '另一个正文', tags: ['HTTP'] },
];
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });
function view() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  return render(<QueryClientProvider client={client}><KnowledgeLibraryPanel /></QueryClientProvider>);
}
function setup(body: unknown, status = 200) {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch); return fetch;
}
it('reads the existing list API, labels loaded counts honestly, filters locally and reveals stored content as text', async () => {
  const fetch = setup({ items, total: 9999 });
  view();
  expect(await screen.findByText(/已加载 2 条/)).toHaveTextContent('不是全库存储总量');
  expect(fetch.mock.calls[0][0]).toBe('/api/knowledge-base/list?limit=200');
  expect(screen.queryByText(/已保存的正文/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('筛选知识资料'), { target: { value: '状态管理' } });
  expect(screen.queryByRole('heading', { name: '浏览器缓存' })).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: '查看资料：Checkpoint 机制' }));
  expect(screen.getByText(/已保存的正文/)).toBeInTheDocument();
  expect(document.querySelector('script')).toBeNull();
  fireEvent.change(screen.getByLabelText('筛选知识资料'), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('资料主题'), { target: { value: 'Web' } });
  expect(screen.getByRole('heading', { name: '浏览器缓存' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Checkpoint 机制' })).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each([403, 503])('preserves read failure%s, exposes retry and sends no mutation', async status => {
  const fetch = setup({ message: '资料读取未确认' }, status); view();
  expect(await screen.findByRole('alert')).toHaveTextContent('资料读取未确认');
  expect(screen.queryByText(/当前组织未返回知识资料/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '重新读取知识资料' }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(fetch.mock.calls.every(call => (call[1] as RequestInit)?.method == null)).toBe(true);
});
it.each([{}, { items: [items[0], items[0]] }, { items: [{ ...items[0], tags: 'invalid' }] }])('rejects malformed or ambiguous list receipts %#', async body => {
  setup(body); view();
  expect(await screen.findByRole('alert')).toHaveTextContent('返回格式异常');
  expect(screen.queryByText(/^已加载 \d+ 条知识资料/)).not.toBeInTheDocument();
});
it('distinguishes an actual empty result from read failure without asserting historical data was deleted', async () => {
  setup({ items: [], total: 0 }); view();
  expect(await screen.findByText(/当前组织未返回知识资料/)).toHaveTextContent('不证明其他组织或历史存储没有数据');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
