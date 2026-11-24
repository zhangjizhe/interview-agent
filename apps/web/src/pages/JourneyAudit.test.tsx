import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HomePage } from './HomePage';
import { useState } from 'react';
import { TrainingPage } from './TrainingPage';
const clients: QueryClient[] = [];
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const row = { id: 'fixture-interview', position: 'Synthetic Engineer', level: 'P5', status: 'COMPLETED', startedAt: '2026-11-18T00:00:00Z', report: { overallScore: 70 } };
function show(node: React.ReactNode) {
 const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
 return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/interviews']}><Routes><Route path="/interviews" element={node}/><Route path="/reports/:id" element={<div>Report destination</div>}/></Routes></MemoryRouter></QueryClientProvider>);
}
function fetches(list: () => Promise<Response>, write?: (url: string, init: RequestInit) => Promise<Response>, rooms: unknown[] = []) {
 vi.stubGlobal('fetch', vi.fn(async (url, init) => {
  const path = String(url);
  if (init?.method) return write ? write(path, init) : json({}, 405);
  if (path === '/api/interview/list') return list();
  if (path.includes('/resumes/')) return json({ resumes: [] });
  if (path.includes('/empty-rooms')) return json({ emptyRooms: rooms });
  if (path.includes('/usage/')) return json({ interviewsRemaining: 10 });
  return json([]);
 }));
}
beforeEach(() => { localStorage.setItem('ia_access_token','SYNTHETIC');localStorage.setItem('ia_userId','fixture-owner'); });
afterEach(() => { cleanup();clients.splice(0).forEach(c=>c.clear());localStorage.clear();sessionStorage.clear();vi.unstubAllGlobals(); });
it('provides a dedicated practice page with actionable missing prerequisites and no automatic writes', async () => {
 let writes=0;fetches(async()=>json([]),async()=>{writes++;return json({});}); show(<HomePage view="practice"/>);
 expect(await screen.findByRole('heading',{name:'选择这次练习的方向'})).toBeVisible();
 expect(await screen.findByRole('link',{name:'设置目标岗位',exact:true})).toHaveAttribute('href','/prepare/jobs');
 expect(screen.getByRole('link',{name:/个人简历/})).toHaveAttribute('href','/prepare/resumes');
 expect(screen.queryByRole('heading',{name:'最近面试'})).toBeNull();expect(writes).toBe(0);
});
it('distinguishes pending, failed and empty interview reads and supports read-only recovery', async () => {
 let release!:(v:Response)=>void;let attempt=0;
 fetches(()=>++attempt===1?new Promise(resolve=>{release=resolve;}):Promise.resolve(json([])));show(<HomePage view="interviews"/>);
 expect(screen.getByRole('status')).toHaveTextContent('正在读取面试记录');expect(screen.queryByText('还没有面试记录。')).toBeNull();
 await act(async()=>release(json({},503)));
 expect(await screen.findByRole('alert')).toHaveTextContent('面试记录暂时无法读取');expect(screen.queryByText('还没有面试记录。')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'重新读取面试记录'}));expect(await screen.findByText('还没有面试记录。')).toBeVisible();expect(attempt).toBe(2);
});
it('does not turn malformed successful interview data into an empty library', async () => {
 fetches(async()=>json({items:[]}));show(<HomePage view="interviews"/>);
 expect(await screen.findByRole('alert')).toHaveTextContent('面试记录暂时无法读取');expect(screen.queryByText('还没有面试记录。')).toBeNull();
});
it('opens a completed report directly and filters records without new requests', async () => {
 let reads=0;fetches(async()=>{reads++;return json([row,{...row,id:'pending',position:'Backend',status:'IN_PROGRESS',report:null}]);});show(<HomePage view="interviews"/>);
 await screen.findByRole('button',{name:'打开评价'});
 fireEvent.change(screen.getByRole('searchbox',{name:'搜索面试记录'}),{target:{value:'missing'}});expect(screen.getByText('没有匹配的面试记录。')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'清除筛选'}));fireEvent.change(screen.getByRole('combobox',{name:'筛选面试状态'}),{target:{value:'OPEN_REPORT'}});
 expect(screen.queryByRole('button',{name:'继续面试'})).toBeNull();expect(reads).toBe(1);
 fireEvent.click(screen.getByRole('button',{name:'打开评价'}));expect(await screen.findByText('Report destination')).toBeVisible();
});
it('requires explicit deletion confirmation and verifies the delete receipt', async () => {
 let writes=0;fetches(async()=>json([]),async()=>{writes++;return json({});},[{id:'empty',position:'Synthetic empty room',idleMinutes:35}]);show(<HomePage view="interviews"/>);
 fireEvent.click(await screen.findByRole('button',{name:'删除',exact:true}));expect(writes).toBe(0);
 fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'保留记录'}));expect(writes).toBe(0);
 fireEvent.click(screen.getByRole('button',{name:'删除',exact:true}));fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'确认删除'}));
 expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('删除结果尚未确认');expect(writes).toBe(1);
});
it('requires confirmation before retrying a potentially paid report and rejects another interview receipt', async () => {
 let writes=0;fetches(async()=>json([{...row,report:null}]),async()=>{writes++;return json({report:{id:'report',interviewId:'other'}});});show(<HomePage view="interviews"/>);
 fireEvent.click(await screen.findByRole('button',{name:'重试评价'}));expect(writes).toBe(0);
 const dialog=screen.getByRole('dialog');expect(dialog).toHaveTextContent('可能产生模型费用');fireEvent.click(within(dialog).getByRole('button',{name:'确认生成评价'}));
 expect(await within(dialog).findByRole('alert')).toHaveTextContent('评价仍未生成');expect(writes).toBe(1);
});
it('gives an actionable training empty state without inventing recommendations', async () => {
 fetches(async()=>json([]));show(<TrainingPage/>);
 expect(await screen.findByRole('link',{name:'设置目标岗位'})).toHaveAttribute('href','/prepare/jobs');expect(screen.queryByRole('button',{name:'完成训练'})).toBeNull();
});
it('explains unavailable skill practice and keeps complete simulation available',async()=>{
 vi.stubGlobal('fetch',vi.fn(async url=>String(url).includes('/target-jobs/')?json({targetJob:{skillRequirements:[]}}):String(url).includes('/resumes/')?json({resumes:[{}]}):String(url).endsWith('/target-jobs')?json([{id:'job',title:'Synthetic role',isActive:true}]):json([])));
 show(<HomePage view="practice"/>);fireEvent.click(await screen.findByRole('button',{name:'单技能练习'}));
 expect(await screen.findByText(/当前岗位尚无可选技能/)).toBeVisible();expect(screen.getByRole('button',{name:'开始面试'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'完整模拟'}));expect(screen.getByRole('button',{name:'开始面试'})).toBeEnabled();
});

it('ignores a late creation reply after switching from practice to records',async()=>{
 let release!:(value:Response)=>void;
 vi.stubGlobal('fetch',vi.fn(async(url,init)=>{
  if(init?.method==='POST')return new Promise<Response>(resolve=>{release=resolve;});
  if(String(url).includes('/resumes/'))return json({resumes:[{}]});
  if(String(url).endsWith('/target-jobs'))return json([{id:'job',title:'Synthetic role',isActive:true}]);
  if(String(url).includes('/empty-rooms'))return json({emptyRooms:[]});
  return json([]);
 }));
 function Switcher(){const[view,setView]=useState<'practice'|'interviews'>('practice');return <><button onClick={()=>setView('interviews')}>切换记录页</button><HomePage view={view}/></>;}
 show(<Switcher/>);const start=await screen.findByRole('button',{name:'开始面试'});await waitFor(()=>expect(start).toBeEnabled());fireEvent.click(start);
 fireEvent.click(screen.getByRole('button',{name:'切换记录页'}));
 await act(async()=>release(json({interviewId:'late-response'})));
 expect(await screen.findByRole('heading',{name:'面试记录',exact:true})).toBeVisible();
 expect(screen.queryByRole('alert')).toBeNull();expect(sessionStorage.getItem('ia_interview_start_unresolved:fixture-owner')).toBe('pending');
});
