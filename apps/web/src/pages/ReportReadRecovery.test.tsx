import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { ReportPage } from './ReportPage';
const clients: QueryClient[]=[];
const json=(data:unknown)=>new Response(JSON.stringify(data));
const detail={id:'fixture-report',status:'COMPLETED',position:'Synthetic role',report:{overallScore:70,scores:{},strengths:'a',weaknesses:'b',suggestions:'c'}};
function show(){const c=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(c);return render(<QueryClientProvider client={c}><MemoryRouter initialEntries={['/reports/fixture-report']}><Routes><Route path="/reports/:id" element={<ReportPage/>}/></Routes></MemoryRouter></QueryClientProvider>);}
afterEach(()=>{cleanup();clients.splice(0).forEach(c=>c.clear());vi.unstubAllGlobals();});
it('does not interpret malformed detail as a report that has not been generated',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>json({})));show();
 expect(await screen.findByRole('button',{name:'重新读取报告'})).toBeEnabled();expect(screen.queryByText('评价尚未生成')).toBeNull();
});
it('offers evidence read recovery instead of interpreting malformed evidence as no evidence',async()=>{
 let recover=false;vi.stubGlobal('fetch',vi.fn(async url=>String(url).endsWith('/evidence')?json(recover?[]:{}):json(detail)));show();
 const retry=await screen.findByRole('button',{name:'重新读取证据'});expect(screen.queryByText('本场尚无可回放的正式证据。')).toBeNull();
 recover=true;fireEvent.click(retry);expect(await screen.findByText('本场尚无可回放的正式证据。')).toBeVisible();
});
