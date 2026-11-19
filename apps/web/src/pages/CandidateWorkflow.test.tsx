import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from './HomePage';
import { ReportPage } from './ReportPage';
import { JobsPage } from './JobsPage';
import { WorkflowDialog } from '../components/WorkflowDialog';

const clients: QueryClient[]=[];
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
function show(node:React.ReactNode, path='/') {
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}}); clients.push(client);
 return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={node}/><Route path="/reports/:id" element={node}/></Routes></MemoryRouter></QueryClientProvider>);
}
afterEach(()=>{cleanup();clients.splice(0).forEach(c=>c.clear());localStorage.clear();sessionStorage.clear();vi.unstubAllGlobals();vi.restoreAllMocks();});
function homeFetch(post:(init?:RequestInit)=>Promise<Response>) {
 localStorage.setItem('ia_userId','fixture-owner');localStorage.setItem('ia_access_token','SYNTHETIC-UI-ONLY');
 vi.stubGlobal('fetch',vi.fn(async(url,init)=>{
  if(init?.method==='POST')return post(init);
  if(String(url).endsWith('/target-jobs'))return json([{id:'job',title:'合成岗位',isActive:true}]);
  if(String(url).includes('/resumes/'))return json({resumes:[{id:'resume',name:'Synthetic'}]});
  if(String(url).includes('/readiness'))return json(null);
  return json([]);
 }));
}
it('locks duplicate starts and navigation controls while practice awaits acknowledgement',async()=>{
 let release!:(r:Response)=>void;let calls=0;
 homeFetch(()=>{calls++;return new Promise(r=>{release=r;});});show(<HomePage view="practice"/>);
 const start=await screen.findByRole('button',{name:'开始面试'});
 await act(async()=>{});
 act(()=>{fireEvent.click(start);fireEvent.click(start);});
 expect(calls).toBe(1);expect(screen.getByRole('button',{name:'完整模拟'})).toBeDisabled();
 expect(screen.queryByRole('link',{name:'返回首页'})).toBeNull();
 expect(screen.queryByRole('link',{name:'查看简历库 / 上传新简历'})).toBeNull();
 await act(async()=>release(json({message:'Synthetic unavailable'},503)));
 expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic unavailable');
 expect(screen.getByRole('button',{name:'开始面试'})).toBeDisabled();
 expect(sessionStorage.getItem('ia_interview_start_unresolved:fixture-owner')).toBe('pending');
 fireEvent.click(screen.getByRole('button',{name:'已核对，允许再次创建'}));
 expect(screen.getByRole('button',{name:'开始面试'})).toBeEnabled();
});
it('never treats failed settings reads as a missing job and offers a GET retry',async()=>{
 let reads=0;vi.stubGlobal('fetch',vi.fn(async()=>++reads===1?json({},503):json([])));show(<JobsPage/>);
 expect(await screen.findByRole('button',{name:'重新读取岗位'})).toBeEnabled();
 expect(screen.queryByRole('heading',{name:'创建目标岗位'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'重新读取岗位'}));
 const create = await screen.findByRole('button',{name:'创建目标岗位'});
 fireEvent.click(create); expect(await screen.findByRole('dialog')).toHaveTextContent('创建目标岗位');expect(reads).toBe(2);
});
it('reports failed new-attempt creation instead of leaving the report silently unchanged',async()=>{
 let posts=0;vi.stubGlobal('fetch',vi.fn(async(url,init)=>{
  if(init?.method==='POST'){posts++;return json({message:'Synthetic creation failure'},503);}
  if(String(url).endsWith('/evidence'))return json([]);
  return json({id:'report',status:'COMPLETED',position:'合成岗位',targetJobId:'job',report:{overallScore:70,scores:{},strengths:'a',weaknesses:'b',suggestions:'c'}});
 }));show(<ReportPage/>,'/reports/report');
 fireEvent.click(await screen.findByRole('button',{name:'开始新的模拟'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic creation failure');
 expect(screen.getByRole('alert')).toHaveTextContent('避免重复创建');expect(posts).toBe(1);
});
it('restores scrolling/focus on dialog close and refuses Escape while busy',()=>{
 const close=vi.fn();const trigger=document.createElement('button');document.body.append(trigger);trigger.focus();
 const v=render(<WorkflowDialog labelledBy="dialog-title" busy onClose={close}><h2 id="dialog-title">准备</h2><button>下一步</button></WorkflowDialog>);
 expect(document.body.style.overflow).toBe('hidden');fireEvent.keyDown(document,{key:'Escape'});expect(close).not.toHaveBeenCalled();
 v.rerender(<WorkflowDialog labelledBy="dialog-title" busy={false} onClose={close}><h2 id="dialog-title">准备</h2></WorkflowDialog>);
 fireEvent.keyDown(document,{key:'Escape'});expect(close).toHaveBeenCalledTimes(1);v.unmount();expect(trigger).toHaveFocus();expect(document.body.style.overflow).toBe('');trigger.remove();
});
it('keeps a permanent resume management entry even when a resume is already saved',async()=>{
 let posts=0;homeFetch(async()=>{posts++;return json({ragIngested:true});});show(<HomePage/>);
 const link=await screen.findByRole('link',{name:/我的简历 查看解析摘要/});
 expect(link).toHaveAttribute('href','/prepare/resumes');expect(posts).toBe(0);
});
