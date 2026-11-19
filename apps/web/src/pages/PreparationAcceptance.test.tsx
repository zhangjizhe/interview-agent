import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { JobsPage } from './JobsPage';
import { ResumesPage } from './ResumesPage';
import { WorkflowDialog } from '../components/WorkflowDialog';

const clients: QueryClient[] = [];
const job = { id: 'synthetic-job', title: '合成岗位', isActive: false, level: null, company: null, jobDescription: null };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function show(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  return render(<QueryClientProvider client={client}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>);
}
beforeEach(() => { localStorage.setItem('ia_access_token', 'SYNTHETIC'); localStorage.setItem('ia_userId', 'synthetic-owner'); });
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each([{}, { ...job, id: 'wrong-job', isActive: true }, job])('does not announce activation on an invalid receipt: %j', async receipt => {
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => json(init?.method === 'POST' ? receipt : [job])));
  show(<JobsPage/>); fireEvent.click(await screen.findByRole('button', { name: '设为当前' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('未确认');
  expect(screen.queryByRole('status')).toBeNull();
});
it('refuses a successful edit receipt identifying another job', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => json(init?.method === 'PATCH' ? { ...job, id: 'wrong-job' } : [job])));
  show(<JobsPage/>); fireEvent.click(await screen.findByRole('button', { name: `编辑${job.title}` }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '保存岗位' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('未确认');
  expect(screen.queryByRole('status')).toBeNull(); expect(screen.getByRole('dialog')).toBeVisible();
});
it('keeps an unknown job write locked across remount and never repeats it during read recovery', async () => {
  let writes = 0;
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => { if (init?.method === 'PATCH') { writes++; throw new TypeError('Synthetic connection loss'); } return json([job]); }));
  const view = show(<JobsPage/>); fireEvent.click(await screen.findByRole('button', { name: `编辑${job.title}` }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '保存岗位' }));
  await screen.findByRole('alert'); expect(within(screen.getByRole('dialog')).getByRole('button', { name: '保存岗位' })).toBeDisabled();
  view.unmount(); show(<JobsPage/>);
  const warning = await screen.findByRole('region', { name: '待核对的岗位操作' });
  const unlock = within(warning).getByRole('button', { name: '已核对，允许继续操作' }); expect(unlock).toBeDisabled();
  await waitFor(() => expect(within(warning).getByRole('button', { name: '重新读取岗位核对' })).toBeEnabled());
  fireEvent.click(within(warning).getByRole('button', { name: '重新读取岗位核对' }));
  await waitFor(() => expect(unlock).toBeEnabled()); expect(writes).toBe(1);
  expect(within(warning).getByRole('region', { name: '重新读取的岗位内容' })).toHaveTextContent(job.title);
  fireEvent.click(unlock); expect(screen.getByRole('button', { name: '新建岗位' })).toBeEnabled(); expect(screen.getByRole('button', { name: '新建岗位' })).toHaveFocus(); expect(writes).toBe(1);
});
it('associates a short JD error with the field and focuses it without a write', async () => {
  let writes = 0; vi.stubGlobal('fetch', vi.fn(async (_url, init) => { if (init?.method) writes++; return json([job]); }));
  show(<JobsPage/>); fireEvent.click(await screen.findByRole('button', { name: `编辑${job.title}` }));
  const field = screen.getByLabelText(/职位描述（可选）/); fireEvent.change(field, { target: { value: '太短' } });
  fireEvent.submit(field.closest('form')!);
  expect(await screen.findByRole('alert')).toHaveTextContent('至少'); expect(field).toHaveAttribute('aria-invalid', 'true'); expect(field).toHaveFocus(); expect(writes).toBe(0);
});
it('keeps a text area at the end of the modal in the keyboard focus loop', () => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{ width: 100, height: 44 }] as unknown as DOMRectList);
  show(<WorkflowDialog labelledBy="synthetic-title" busy={false} onClose={() => {}}><h2 id="synthetic-title">合成对话框</h2><button>第一个按钮</button><textarea aria-label="最后的文字输入"/></WorkflowDialog>);
  const field = screen.getByRole('textbox', { name: '最后的文字输入' }); field.focus();
  fireEvent.keyDown(document, { key: 'Tab' }); expect(screen.getByRole('button', { name: '第一个按钮' })).toHaveFocus();
});
it('keeps upload feedback beside the explicit upload action and rejects malformed summary rows', async () => {
  vi.stubGlobal('fetch', vi.fn(async url => String(url).includes('/resumes/') ? json({ resumes: [{ name: '合成简历', skills: ['malformed'] }] }) : json([])));
  const view = show(<ResumesPage/>); await screen.findByRole('alert');
  expect(screen.queryByText('还没有读取到已保存简历')).toBeNull();
  fireEvent.change(view.container.querySelector('input[type=file]')!, { target: { files: [new File(['bad'], 'unsupported.docx')] } });
  const upload = screen.getByRole('region', { name: '上传简历' });
  expect(within(upload).getByRole('alert')).toHaveTextContent('暂不支持');
  expect(within(upload).getByRole('button', { name: '上传并解析' })).toBeDisabled();
  expect(within(upload).getByRole('group', { name: '上传反馈' })).toHaveFocus();
});
it('does not silently select a general role while target jobs are still being read', async () => {
  let release!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(async url => String(url).includes('/resumes/') ? json({ resumes: [] }) : new Promise<Response>(resolve => { release = resolve; })));
  const view = show(<ResumesPage/>);
  fireEvent.change(view.container.querySelector('input[type=file]')!, { target: { files: [new File(['Synthetic'], 'synthetic.txt')] } });
  expect(screen.getByRole('button', { name: '上传并解析' })).toBeDisabled();
  expect(screen.getByLabelText(/解析参考岗位/)).toBeDisabled();
  await act(async () => release(json([{ ...job, isActive: true }])));
  await waitFor(() => expect(screen.getByRole('button', { name: '上传并解析' })).toBeEnabled());
  expect(screen.getByRole('option', { name: `当前岗位 · ${job.title}` })).toBeInTheDocument();
});

it('announces activation only for the requested active job and refreshes the cards', async () => {
 let active=false;let writes=0;
 vi.stubGlobal('fetch',vi.fn(async (_url,init)=>{if(init?.method==='POST'){active=true;writes++;return json({...job,isActive:true});}return json([{...job,isActive:active}]);}));
 show(<JobsPage/>);fireEvent.click(await screen.findByRole('button',{name:'设为当前'}));
 expect(await screen.findByRole('status')).toHaveTextContent('当前岗位已切换');
 expect(await screen.findByText('当前岗位',{exact:true})).toBeVisible();expect(screen.getByRole('heading',{name:job.title})).toHaveFocus();expect(writes).toBe(1);
});
it('retains a rejected edit for correction without locking it as an unknown transaction', async () => {
 vi.stubGlobal('fetch',vi.fn(async (_url,init)=>init?.method==='PATCH'?json({message:'岗位名称格式不合法'},400):json([job])));
 show(<JobsPage/>);fireEvent.click(await screen.findByRole('button',{name:`编辑${job.title}`}));
 fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'保存岗位'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('格式不合法');
 expect(screen.getByRole('button',{name:'保存岗位'})).toBeEnabled();expect(sessionStorage.getItem('ia_job_write_unresolved:synthetic-owner')).toBeNull();
 expect(screen.getByLabelText(/岗位名称/)).toHaveValue(job.title);
});
it('does not unlock an unknown job operation after a failed read', async () => {
 let fail=false;
 vi.stubGlobal('fetch',vi.fn(async (_url,init)=>{if(init?.method==='POST'){fail=true;return json({});}return fail?json({message:'Synthetic read failure'},503):json([job]);}));
 show(<JobsPage/>);fireEvent.click(await screen.findByRole('button',{name:'设为当前'}));
 const warning=await screen.findByRole('region',{name:'待核对的岗位操作'});
 fireEvent.click(within(warning).getByRole('button',{name:'重新读取岗位核对'}));
 await screen.findByText('岗位设置暂时无法加载。');
 expect(within(warning).getByRole('button',{name:'已核对，允许继续操作'})).toBeDisabled();
});
it('closes a confirmed save with focus restored even while its verification read is slow', async () => {
 let reads=0;
 vi.stubGlobal('fetch',vi.fn(async (_url,init)=>{
  if(init?.method==='POST')return json({...job,id:'synthetic-new',title:'新合成岗位',isActive:true});
  reads++;return reads===1?json([job]):new Promise<Response>(()=>{});
 }));
 show(<JobsPage/>);const create=await screen.findByRole('button',{name:'新建岗位'});
 await waitFor(()=>expect(create).toBeEnabled());create.focus();fireEvent.click(create);
 fireEvent.change(screen.getByLabelText(/岗位名称/),{target:{value:'新合成岗位'}});
 fireEvent.click(screen.getByRole('button',{name:'保存岗位'}));
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 expect(create).toBeEnabled();expect(create).toHaveFocus();
 expect(screen.getByRole('heading',{name:'新合成岗位'})).toBeVisible();
});
it('unlocks file selection after a confirmed upload even if summary refresh is slow', async () => {
 let reads=0;
 vi.stubGlobal('fetch',vi.fn(async (url,init)=>{
  if(init?.method==='POST')return json({ragIngested:true});
  if(String(url).includes('/resumes/'))return ++reads===1?json({resumes:[]}):new Promise<Response>(()=>{});
  return json([job]);
 }));
 const view=show(<ResumesPage/>);await screen.findByText('还没有读取到已保存简历');
 fireEvent.change(view.container.querySelector('input[type=file]')!,{target:{files:[new File(['Synthetic experience'],'synthetic.txt')]}});
 const send=screen.getByRole('button',{name:'上传并解析'});await waitFor(()=>expect(send).toBeEnabled());fireEvent.click(send);
 await screen.findByText(/简历已解析并保存到个人简历库/);
 expect(screen.getByRole('button',{name:'选择简历文件'})).toBeEnabled();
 expect(screen.queryByText(/处理中，请保留此页/)).toBeNull();
 expect(screen.getByRole('group',{name:'上传反馈'})).toHaveFocus();
});

it('does not send or freeze an upload when the browser cannot persist its pending marker', async () => {
 let writes=0;
 vi.stubGlobal('fetch',vi.fn(async (url,init)=>{if(init?.method==='POST')writes++;return String(url).includes('/resumes/')?json({resumes:[]}):json([job]);}));
 const set=Storage.prototype.setItem;
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(key,value){if(key.startsWith('ia_resume_upload_unresolved:'))throw new DOMException('Synthetic quota','QuotaExceededError');set.call(this,key,value);});
 const view=show(<ResumesPage/>);await screen.findByText('还没有读取到已保存简历');
 fireEvent.change(view.container.querySelector('input[type=file]')!,{target:{files:[new File(['Synthetic experience'],'synthetic.txt')]}});
 const submit=screen.getByRole('button',{name:'上传并解析'});await waitFor(()=>expect(submit).toBeEnabled());fireEvent.click(submit);
 expect(await screen.findByRole('alert')).toHaveTextContent('本次尚未提交');expect(writes).toBe(0);
 expect(screen.getByRole('button',{name:'重新选择文件'})).toBeEnabled();expect(submit).toBeEnabled();
 expect(screen.queryByRole('region',{name:'待核对的上传'})).toBeNull();
});
