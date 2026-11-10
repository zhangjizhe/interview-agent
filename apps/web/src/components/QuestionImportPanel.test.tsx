import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { QuestionImportPanel } from '../../../agent-lab/src/QuestionImportPanel';

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });
function mount(transport = vi.fn()) {
  vi.stubGlobal('fetch', transport);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
  const imported = vi.fn(), busy = vi.fn();
  render(<QueryClientProvider client={client}><QuestionImportPanel onImported={imported} onBusy={busy}/></QueryClientProvider>);
  return { imported, busy, transport };
}
function choose(name = 'questions.md', content = '# Synthetic question') {
  const file = new File([content], name, { type: 'text/markdown' });
  fireEvent.change(screen.getByLabelText('选择题库文件'), { target: { files: [file] } });
  return file;
}
function metadata() {
  fireEvent.change(screen.getByLabelText(/^目标岗位/), { target: { value: '前端开发工程师' } });
  fireEvent.change(screen.getByLabelText(/^题目主题/), { target: { value: 'React 状态管理' } });
  fireEvent.change(screen.getByLabelText(/^目标职级/), { target: { value: 'P6' } });
  fireEvent.click(screen.getByRole('checkbox'));
}
it('selects or drops a file locally, validates size/type and requires explicit classification and consent before sending', async () => {
  const { transport } = mount();
  choose('unsupported.json'); expect(screen.getByRole('alert')).toHaveTextContent('暂不支持 JSON');
  choose('empty.md', ''); expect(screen.getByRole('alert')).toHaveTextContent('文件不能为空');
  const huge = new File(['x'], 'huge.pdf'); Object.defineProperty(huge, 'size', { value: 10 * 1024 * 1024 + 1 });
  fireEvent.change(screen.getByLabelText('选择题库文件'), { target: { files: [huge] } }); expect(screen.getByRole('alert')).toHaveTextContent('不能超过 10 MB');
  const file = new File(['synthetic'], 'dropped.txt');
  fireEvent.drop(screen.getByText('拖入文件，或手动选择').parentElement!, { dataTransfer: { files: [file] } });
  expect(screen.getByText('dropped.txt')).toBeInTheDocument(); expect(screen.getByText(/已选择，尚未上传/)).toBeInTheDocument();
  expect(transport).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '开始导入' })); expect(screen.getByRole('alert')).toHaveTextContent('请填写目标岗位');
  fireEvent.change(screen.getByLabelText(/^目标岗位/), { target: { value: '前端开发工程师' } });
  fireEvent.click(screen.getByRole('button', { name: '开始导入' })); expect(screen.getByRole('alert')).toHaveTextContent('请填写题目主题');
  fireEvent.change(screen.getByLabelText(/^题目主题/), { target: { value: 'React' } });
  fireEvent.click(screen.getByRole('button', { name: '开始导入' })); expect(screen.getByRole('alert')).toHaveTextContent('请确认允许解析内容');
  expect(transport).not.toHaveBeenCalled();
});
it('sends a single multipart request with separate topic/position, freezes all controls, and distinguishes saved pending indexing', async () => {
  let resolve!: (value: Response) => void;
  const transport = vi.fn((_url: string, _init?: RequestInit) => new Promise<Response>(done => { resolve = done; }));
  const { imported, busy } = mount(transport); choose(); metadata();
  const button = screen.getByRole('button', { name: '开始导入' });
  fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
  expect(transport.mock.calls[0][0]).toBe('/api/interview/question-bank/import-file');
  const request = transport.mock.calls[0][1]!; const body = request.body as FormData;
  expect(request.method).toBe('POST'); expect(new Headers(request.headers).has('Content-Type')).toBe(false);
  expect(body.get('position')).toBe('前端开发工程师'); expect(body.get('category')).toBe('React 状态管理'); expect(body.get('level')).toBe('P6'); expect(body.get('file')).toBeInstanceOf(File);
  expect(screen.getByRole('button', { name: /导入处理中/ })).toBeDisabled(); expect(screen.getByLabelText(/^题目主题/)).toBeDisabled(); expect(screen.getByRole('button', { name: '网页链接' })).toBeDisabled();
  resolve(new Response(JSON.stringify({ success: true, count: 1, questionIds: ['synthetic-id'], mode: 'CATALOG', canonicalStatus: 'SAVED', indexStatus: 'PENDING' })));
  expect(await screen.findByRole('status')).toHaveTextContent('已确认保存 1 道题目');
  expect(screen.getByRole('status')).toHaveTextContent('检索索引待处理，无需重复导入');
  expect(imported).toHaveBeenCalledTimes(1); expect(busy.mock.calls.map(call => call[0])).toEqual([true, false]);
  fireEvent.click(screen.getByRole('button', { name: '继续导入其他资料' }));
  expect(screen.queryByText('questions.md')).not.toBeInTheDocument(); expect(screen.getByLabelText(/^题目主题/)).toHaveValue('React 状态管理'); expect(screen.getByRole('checkbox')).not.toBeChecked();
});
it.each([
  { success: false, count: 1, questionIds: ['synthetic'] },
  { success: true, count: 2, questionIds: ['duplicate', 'duplicate'] },
  { success: true, count: 1, questionIds: [] },
  { success: true, count: 1, questionIds: ['synthetic'], mode: 'CATALOG', indexStatus: 'READY' },
])('does not clear drafts or report success for incomplete receipts %#', async receipt => {
  const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify(receipt))); const { imported } = mount(transport);
  choose(); metadata(); fireEvent.click(screen.getByRole('button', { name: '开始导入' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('导入结果未确认');
  expect(screen.getByLabelText(/^题目主题/)).toHaveValue('React 状态管理'); expect(screen.getByText('questions.md')).toBeInTheDocument(); expect(imported).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '开始导入' })).toBeDisabled(); expect(transport).toHaveBeenCalledTimes(1);
});
it('preserves a server failure without automatic retry, requires explicit review and new consent for resubmission', async () => {
  const transport = vi.fn().mockResolvedValue(new Response('{"message":"Synthetic unavailable"}', { status: 503 })); mount(transport); choose(); metadata();
  fireEvent.click(screen.getByRole('button', { name: '开始导入' })); expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic unavailable');
  expect(screen.getByRole('button', { name: '开始导入' })).toBeDisabled(); expect(transport).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: '已核对，重新确认导入' })); expect(screen.getByRole('checkbox')).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: '开始导入' })); expect(screen.getByRole('alert')).toHaveTextContent('请确认允许解析内容'); expect(transport).toHaveBeenCalledTimes(1);
});
it('validates URL before sending, does not mutate while selecting a method, and handles a genuine zero count honestly', async () => {
  const transport = vi.fn().mockResolvedValue(new Response('{"success":true,"count":0,"questionIds":[]}')); mount(transport);
  fireEvent.click(screen.getByRole('button', { name: '网页链接' })); metadata();
  fireEvent.change(screen.getByLabelText('网页地址'), { target: { value: 'javascript:alert(1)' } });
  fireEvent.click(screen.getByRole('button', { name: '开始导入' })); expect(screen.getByRole('alert')).toHaveTextContent('HTTP 或 HTTPS'); expect(transport).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('网页地址'), { target: { value: 'https://example.org/article' } }); fireEvent.click(screen.getByRole('button', { name: '开始导入' }));
  expect(await screen.findByRole('status')).toHaveTextContent('没有生成可导入的题目'); expect(screen.getByRole('status')).toHaveTextContent('仍可能产生费用');
  expect(transport.mock.calls[0][0]).toBe('/api/interview/question-bank/import-url');
  expect(JSON.parse(transport.mock.calls[0][1].body)).toEqual({ position: '前端开发工程师', category: 'React 状态管理', level: 'P6', url: 'https://example.org/article' });
});
it('focuses the invalid field and exposes its invalid state for keyboard users', () => {
  mount(); fireEvent.click(screen.getByRole('button', { name: '开始导入' }));
  expect(screen.getByLabelText('目标岗位', { exact: true })).toHaveFocus(); expect(screen.getByLabelText('目标岗位', { exact: true })).toHaveAttribute('aria-invalid', 'true');
});
