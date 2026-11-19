import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthGate } from './App';
import { AUTH_SESSION_STORAGE_KEY, clearSession, getSession, saveSession } from './utils/auth';

const clients: QueryClient[]=[];
const session=(id:string)=>({userId:id,accessToken:`SYNTHETIC-${id}`,email:`${id}@example.invalid`,role:'USER' as const});
const json=(data:unknown)=>new Response(JSON.stringify(data));
function PrivateJobs(){const q=useQuery({queryKey:['target-jobs'],queryFn:async()=>{const r=await fetch('/api/interview/target-jobs');return await r.json() as {title:string}[];}});return <section aria-label="会话私有资料">{q.data?.map(row=><p key={row.title}>{row.title}</p>)}</section>;}
function show(strict=false){const c=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:30_000}}});clients.push(c);const node=<QueryClientProvider client={c}><AuthGate><PrivateJobs/></AuthGate></QueryClientProvider>;return render(strict?<StrictMode>{node}</StrictMode>:node);}
async function loginB(){fireEvent.change(screen.getByLabelText('用户名'),{target:{value:'synthetic-b'}});fireEvent.change(screen.getByLabelText('密码'),{target:{value:'synthetic-password-123'}});fireEvent.click(screen.getByRole('button',{name:'登录',exact:true}));}
function expire(){act(()=>{clearSession();window.dispatchEvent(new Event('ia:session-expired'));});}
beforeEach(()=>{localStorage.clear();saveSession(session('synthetic-a'));});
afterEach(()=>{cleanup();clients.splice(0).forEach(c=>c.clear());localStorage.clear();vi.unstubAllGlobals();vi.restoreAllMocks();});
it.each([false,true])('never shows the previous cached account after expiry and another login (StrictMode=%s)',async strict=>{
 let reads=0;vi.stubGlobal('fetch',vi.fn(async url=>{if(String(url)==='/api/auth/login')return json(session('synthetic-b'));reads++;return json([{title:`${getSession()?.userId} private job`}]);}));show(strict);
 expect(await screen.findByText('synthetic-a private job')).toBeVisible();expire();expect(screen.queryByText('synthetic-a private job')).toBeNull();
 await loginB();expect(await screen.findByText('synthetic-b private job')).toBeVisible();expect(screen.queryByText('synthetic-a private job')).toBeNull();expect(reads).toBeGreaterThanOrEqual(2);
});
it('keeps a late previous-account read out of the new account cache and visible UI',async()=>{
 let release!:(r:Response)=>void;let aStarted=false;
 vi.stubGlobal('fetch',vi.fn(async url=>{
  if(String(url)==='/api/auth/login')return json(session('synthetic-b'));
  if(getSession()?.userId==='synthetic-a'){aStarted=true;return new Promise<Response>(resolve=>{release=resolve;});}
  return json([{title:'synthetic-b private job'}]);
 }));show();await waitFor(()=>expect(aStarted).toBe(true));expire();await loginB();
 await act(async()=>release(json([{title:'synthetic-a late private job'}])));
 expect(await screen.findByText('synthetic-b private job')).toBeVisible();expect(screen.queryByText('synthetic-a late private job')).toBeNull();
});
it('refreshes protected UI after a complete session publication from another tab',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>json([{title:`${getSession()?.userId} private job`}])));show();await screen.findByText('synthetic-a private job');
 act(()=>{const value=JSON.stringify({session:session('synthetic-b'),revision:'synthetic-publication-b'});localStorage.setItem(AUTH_SESSION_STORAGE_KEY,value);window.dispatchEvent(new StorageEvent('storage',{key:AUTH_SESSION_STORAGE_KEY,newValue:value}));});
 expect(await screen.findByText('synthetic-b private job')).toBeVisible();expect(screen.queryByText('synthetic-a private job')).toBeNull();
});
it('hides private UI immediately on another tab publishing logout',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>json([{title:'synthetic-a private job'}])));show();await screen.findByText('synthetic-a private job');
 act(()=>{const value=JSON.stringify({session:null,revision:'synthetic-logout'});localStorage.setItem(AUTH_SESSION_STORAGE_KEY,value);window.dispatchEvent(new StorageEvent('storage',{key:AUTH_SESSION_STORAGE_KEY,newValue:value}));});
 expect(await screen.findByRole('heading',{name:'欢迎回来'})).toBeVisible();expect(screen.queryByText('synthetic-a private job')).toBeNull();
});
it('does not leave a previous plaintext password populated after a successful login expires',async()=>{
 localStorage.clear();vi.stubGlobal('fetch',vi.fn(async url=>String(url)==='/api/auth/login'?json(session('synthetic-b')):json([{title:'synthetic-b private job'}])));show();await loginB();await screen.findByText('synthetic-b private job');expire();
 expect(screen.getByLabelText('密码')).toHaveValue('');
});

it('replaces the private cache when the same account receives a new session token', async () => {
 let reads=0;
 vi.stubGlobal('fetch',vi.fn(async()=>json([{title:`private read ${++reads}`}])));
 show();await screen.findByText('private read 1');
 act(()=>saveSession({...session('synthetic-a'),accessToken:'SYNTHETIC-a-replacement'}));
 expect(await screen.findByText('private read 2')).toBeVisible();
 expect(screen.queryByText('private read 1')).toBeNull();
});
