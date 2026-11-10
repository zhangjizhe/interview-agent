import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataGovernanceWorkspace } from '../../agent-lab/src/DataGovernanceWorkspace';
import { DataBindingPicker } from '../../agent-lab/src/DataBindingPicker';
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const page = (items: unknown[]) => ({ items, page: 1, hasMore: false });
const collection = { id: 'article-one', name: 'Private articles', kind: 'ARTICLE', access: 'READ', _count: { records: 1 } };
const item = { id: 'record-one', collectionId: collection.id, title: 'Private title', content: 'PRIVATE_ARTICLE_BODY', revision: 1, tags: [] };
function mount(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>); return client;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
it('READ shows records/history without write or sharing controls, and hides cached content after revocation', async () => {
  let revoked = false;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path.includes('/history')) return response(page([{ id: 'record-one:1', revision: 1, createdAt: '2030-01-01T00:00:00Z', snapshot: { title: item.title, content: item.content } }]));
    if (path.includes('/records')) return revoked ? response({ message: '授权已失效' }, 404) : response({ ...page([item]), access: 'READ' });
    return response(page([collection]));
  });vi.stubGlobal('fetch', fetchMock);
  const client = mount(<DataGovernanceWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: /Private articles/ }));
  expect(await screen.findByText(item.title)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '保存资料' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '共享权限' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '归档集合' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '版本历史' }));
  expect(await screen.findByRole('region', { name: '版本历史' })).toBeInTheDocument();
  revoked = true;await client.invalidateQueries({ queryKey: ['lab-data-records', collection.id] });
  expect(await screen.findByRole('alert')).toHaveTextContent('授权已失效');
  expect(screen.queryByText(item.title)).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: '版本历史' })).not.toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([path]) => String(path).includes('/grants'))).toBe(false);
});
it('malformed success is a retryable read failure rather than an empty collection list', async () => {
  const fetchMock = vi.fn(async () => response({}));vi.stubGlobal('fetch', fetchMock);mount(<DataGovernanceWorkspace />);
  expect(await screen.findByRole('alert')).toHaveTextContent('响应不完整');
  expect(screen.queryByText(/没有可访问的资料集合/)).not.toBeInTheDocument();
  fetchMock.mockImplementation(async () => response(page([])));fireEvent.click(screen.getByRole('button', { name: '重试读取集合' }));
  expect(await screen.findByText(/没有可访问的资料集合/)).toBeInTheDocument();
});
it('owner grant failure never claims success or invents a shared principal', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/grants')) return init?.method === 'PUT' ? response({ message: '授权对象不在当前组织' }, 404) : response(page([]));
    return response(page([{ ...collection, access: 'OWNER' }]));
  }));mount(<DataGovernanceWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: /Private articles/ }));fireEvent.click(screen.getByRole('button', { name: '共享权限' }));
  fireEvent.change(screen.getByLabelText('账号 ID（登录用户名）'), { target: { value: 'foreign-user' } });
  fireEvent.click(screen.getByRole('button', { name: '保存授权' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('不在当前组织');
  expect(screen.queryByText('授权已保存。')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '撤销授权' })).not.toBeInTheDocument();
});
it('Agent binding selection has an explicit five-collection cap and explicit clearing', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => response(page(Array.from({ length: 6 }, (_, n) => ({ ...collection, id: `c${n}`, name: `Article ${n}` }))))));
  function Bound() { const [ids, setIds] = useState<string[]>([]);return <DataBindingPicker value={ids} onChange={setIds} />; }
  mount(<Bound />);await screen.findByRole('checkbox', { name: /Article 0/ });
  for (let n = 0; n < 5; n++) fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(`Article ${n}`) }));
  expect(screen.getByRole('checkbox', { name: /Article 5/ })).toBeDisabled();
  expect(screen.getByText(/已选择 5 \/ 5/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '清除资料绑定' }));
  await waitFor(() => expect(screen.getByRole('checkbox', { name: /Article 5/ })).toBeEnabled());
  expect(screen.getByText(/已选择 0 \/ 5/)).toBeInTheDocument();
});
it('a refreshed READ downgrade removes editor controls without trusting the original collection snapshot', async () => {
  let access = 'WRITE';
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('/records')
    ? response({ ...page([item]), access }) : response(page([{ ...collection, access: 'WRITE' }]))));
  const client = mount(<DataGovernanceWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: /Private articles/ }));
  expect(await screen.findByRole('button', { name: '保存资料' })).toBeInTheDocument();
  access = 'READ'; await client.invalidateQueries({ queryKey: ['lab-data-records', collection.id] });
  await waitFor(() => expect(screen.queryByRole('button', { name: '保存资料' })).not.toBeInTheDocument());
  expect(screen.getByText('当前资料权限：只读')).toBeInTheDocument();
  expect(screen.getByText(item.title)).toBeInTheDocument();
});
it.each([
  { ...item, collectionId: 'other-collection' },
  { ...item, sourceUrl: 'javascript:alert(1)' },
  { ...item, revision: 0 },
])('rejects wrong-collection or invalid record receipts before displaying private content', async wrong => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('/records')
    ? response({ ...page([wrong]), access: 'READ' }) : response(page([collection]))));
  mount(<DataGovernanceWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: /Private articles/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('响应不完整');
  expect(screen.queryByText(item.title)).not.toBeInTheDocument();
});
