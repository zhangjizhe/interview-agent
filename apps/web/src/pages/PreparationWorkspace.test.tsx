import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SettingsPage } from './SettingsPage';
import { JobsPage } from './JobsPage';
import { ResumesPage } from './ResumesPage';

const clients: QueryClient[] = [];
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const job = { id: 'fixture-job', title: 'Synthetic Engineer', level: 'P5', company: 'Synthetic', jobDescription: 'Synthetic job requirements with more than twenty characters', isActive: true };
const record = { name: 'Synthetic candidate', position: job.title, summary: 'A synthetic TypeScript project', skills: 'TypeScript、React', createdAt: '2026-11-18T00:00:00Z' };
function show(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  return render(<QueryClientProvider client={client}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>);
}
function chooseFile(view: ReturnType<typeof show>, name = 'synthetic.txt') {
  fireEvent.change(view.container.querySelector('input[type=file]')!, { target: { files: [new File(['Synthetic experience using TypeScript'], name, { type: 'text/plain' })] } });
}
beforeEach(() => { localStorage.setItem('ia_access_token', 'SYNTHETIC-ONLY'); localStorage.setItem('ia_userId', 'fixture-owner'); });
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('separates account security from preparation and keeps the password action collapsed', () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); const view = show(<SettingsPage/>);
  expect(screen.getByRole('heading', { name: '账号设置' })).toBeInTheDocument();
  expect(screen.queryByText('创建目标岗位')).not.toBeInTheDocument();
  expect(view.container.querySelector('details')).not.toHaveAttribute('open');
  expect(screen.getByText('发送改密验证码')).not.toBeVisible(); expect(fetcher).not.toHaveBeenCalled();
});
it('renders jobs as saved cards and retains unsaved edits until explicitly discarded', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json([job]))); show(<JobsPage/>);
  fireEvent.click(await screen.findByRole('button', { name: `编辑${job.title}` }));
  const dialog = screen.getByRole('dialog'); fireEvent.change(within(dialog).getByLabelText(/岗位名称/), { target: { value: 'New synthetic role' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  expect(dialog).toHaveTextContent('有尚未保存的修改');
  fireEvent.click(within(dialog).getByRole('button', { name: '继续编辑' }));
  expect(within(dialog).getByLabelText(/岗位名称/)).toHaveValue('New synthetic role');
  fireEvent.click(within(dialog).getByRole('button', { name: '关闭岗位编辑' }));
  fireEvent.click(within(dialog).getByRole('button', { name: '放弃修改' })); expect(screen.queryByRole('dialog')).toBeNull();
});
it('submits cleared optional fields explicitly, locks duplicate writes and closes only on a valid receipt', async () => {
  let release!: (value: Response) => void; const writes: RequestInit[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => { if (init?.method === 'PATCH') { writes.push(init); return new Promise<Response>(resolve => { release = resolve; }); } return json([job]); }));
  show(<JobsPage/>); fireEvent.click(await screen.findByRole('button', { name: `编辑${job.title}` }));
  const dialog = screen.getByRole('dialog'); fireEvent.change(within(dialog).getByLabelText('公司（可选）'), { target: { value: '' } });
  fireEvent.change(within(dialog).getByLabelText(/职位描述/), { target: { value: '' } });
  const save = within(dialog).getByRole('button', { name: '保存岗位' }); act(() => { fireEvent.click(save); fireEvent.click(save); });
  expect(writes).toHaveLength(1); expect(JSON.parse(writes[0].body as string)).toMatchObject({ company: '', jobDescription: '' });
  expect(within(dialog).getByRole('button', { name: '取消' })).toBeDisabled();
  await act(async () => release(json({ ...job, company: null, jobDescription: null })));
  expect(await screen.findByRole('status')).toHaveTextContent('岗位已更新'); expect(screen.queryByRole('dialog')).toBeNull();
});
it('does not dismiss an editor on a malformed successful write response', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => json(init?.method === 'PATCH' ? {} : [job]))); show(<JobsPage/>);
  fireEvent.click(await screen.findByRole('button', { name: `编辑${job.title}` })); fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '保存岗位' }));
  expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('保存结果未确认');
});
it('allows explicit resume upload without any target job and refreshes the saved summary', async () => {
  let posts = 0; let body: FormData | undefined;
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    if (init?.method === 'POST') { posts++; body = init.body as FormData; return json({ ragIngested: true }); }
    return String(url).includes('/resumes/') ? json({ resumes: posts ? [record] : [] }) : json([]);
  }));
  const view = show(<ResumesPage/>); await screen.findByText('还没有读取到已保存简历'); chooseFile(view);
  expect(posts).toBe(0); expect(screen.getByText('synthetic.txt')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '上传并解析' }));
  expect(await screen.findByText(/简历已解析并保存到个人简历库/)).toHaveAttribute('role', 'status');
  expect(posts).toBe(1); expect(body?.get('position')).toBe('通用岗位');
  const summary = await screen.findByText(record.name); fireEvent.click(summary);
  expect(screen.getByText(record.summary)).toBeVisible(); expect(sessionStorage.getItem('ia_resume_upload_unresolved:fixture-owner')).toBeNull();
});
it.each([['false', { ragIngested: false }], ['string', { ragIngested: 'true' }], ['missing', {}]])('locks unknown upload outcomes on an invalid receipt: %s', async (_label, receipt) => {
  let posts = 0; vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    if (init?.method === 'POST') { posts++; return json(receipt); }
    return String(url).includes('/resumes/') ? json({ resumes: [] }) : json([]);
  }));
  const view = show(<ResumesPage/>); chooseFile(view); await waitFor(() => expect(screen.getByRole('button', { name: '上传并解析' })).toBeEnabled()); fireEvent.click(screen.getByRole('button', { name: '上传并解析' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('未确认保存结果');
  expect(screen.getByRole('button', { name: '上传并解析' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '重新读取简历' })); await waitFor(() => expect(screen.getByRole('button', { name: '重新读取简历' })).toBeEnabled());
  expect(posts).toBe(1); view.unmount(); show(<ResumesPage/>);
  expect(screen.getByRole('button', { name: '上传并解析' })).toBeDisabled(); expect(screen.getByRole('region', { name: '待核对的上传' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '已核对，允许再次上传' })).toBeDisabled();
  await waitFor(() => expect(screen.getByRole('button', { name: '重新读取简历' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '重新读取简历' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '已核对，允许再次上传' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '已核对，允许再次上传' })); expect(sessionStorage.getItem('ia_resume_upload_unresolved:fixture-owner')).toBeNull(); expect(screen.getByRole('button', { name: '选择简历文件' })).toHaveFocus(); expect(posts).toBe(1);
});
it('locks upload and file selection while one response is pending', async () => {
  let release!: (value: Response) => void; let posts = 0;
  vi.stubGlobal('fetch', vi.fn(async (url, init) => { if (init?.method === 'POST') { posts++; return new Promise<Response>(resolve => { release = resolve; }); } return String(url).includes('/resumes/') ? json({ resumes: [] }) : json([]); }));
  const view = show(<ResumesPage/>); chooseFile(view); const submit = screen.getByRole('button', { name: '上传并解析' }); await waitFor(() => expect(submit).toBeEnabled()); act(() => { fireEvent.click(submit); fireEvent.click(submit); });
  expect(posts).toBe(1); expect(screen.getByRole('button', { name: '重新选择文件' })).toBeDisabled();
  await act(async () => release(json({ message: 'Synthetic unavailable' }, 503))); expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic unavailable');
});
it('keeps failed or malformed reads distinct from an empty resume library', async () => {
  let fail = true;
  vi.stubGlobal('fetch', vi.fn(async url => String(url).includes('/resumes/') ? json(fail ? { resumes: null } : { resumes: [record] }) : json([])));
  show(<ResumesPage/>); expect(await screen.findByRole('alert')).toHaveTextContent('不代表资料已丢失'); expect(screen.queryByText('还没有读取到已保存简历')).toBeNull();
  fail = false; fireEvent.click(screen.getByRole('button', { name: '刷新列表' })); expect(await screen.findByText(record.name)).toBeVisible();
  fireEvent.change(screen.getByRole('searchbox', { name: '搜索已读取简历' }), { target: { value: 'unmatched' } }); expect(screen.getByText(/没有匹配结果/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '清除搜索' })); expect(screen.getByText(record.name)).toBeVisible();
});
it.each(['unsupported.docx', 'empty.txt', 'oversize.pdf'])('rejects invalid files without calling the upload API: %s', async name => {
  let posts = 0; vi.stubGlobal('fetch', vi.fn(async (url, init) => { if (init?.method === 'POST') posts++; return String(url).includes('/resumes/') ? json({ resumes: [] }) : json([]); }));
  const view = show(<ResumesPage/>); const file = new File([name === 'empty.txt' ? '' : 'Synthetic'], name);
  if (name === 'oversize.pdf') Object.defineProperty(file, 'size', { value: 10 * 1024 * 1024 + 1 });
  fireEvent.change(view.container.querySelector('input[type=file]')!, { target: { files: [file] } });
  expect(await screen.findByRole('alert')).toBeVisible(); expect(screen.getByRole('button', { name: '上传并解析' })).toBeDisabled(); expect(posts).toBe(0);
});
