import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { EvaluationRunLinks } from '../../agent-lab/src/EvaluationRunLinks';
import { ControlledEvolutionWorkspace } from '../../agent-lab/src/ControlledEvolutionWorkspace';
const result = { id: 'result', runId: 'run-a', run: { id: 'run-a' }, passed: true, datasetCase: { key: 'case' }, evidence: { runIds: ['run-a', 'run-b'], samples: [{ assertions: [{ id: 'event', passed: true, reason: 'observed', evidence: { runId: 'run-a' } }] }] } };
const evaluation = { id: 'eval', status: 'COMPLETED', score: 100, failedCases: 0, agentVersion: { id: 'version', version: '1.0.3', status: 'PUBLISHED' }, dataset: { id: 'dataset', name: 'Synthetic', version: '1' }, evaluator: { id: 'evaluator', name: 'Contract', type: 'BUSINESS_ASSERTIONS' }, totalCases: 1, completedCases: 1, completedSamples: 2, createdAt: '2026-11-09T00:00:00Z' };
const run = (id = 'run-a') => ({ id, agentId: 'agent', agentVersionId: 'version', status: 'COMPLETED', estimatedCost: .001, latencyMs: 20, tokenUsage: { calls: 1 }, agentVersion: { version: '1.0.3' } });
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(c => c.clear()); clients.length = 0; vi.unstubAllGlobals(); });
function view(element: React.ReactNode) { const c = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(c); return render(<QueryClientProvider client={c}>{element}</QueryClientProvider>); }
function setup(handler: (url: string) => unknown | Promise<unknown>) { const calls: { url: string; method: string }[] = [];vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => { calls.push({ url: String(url), method: init?.method ?? 'GET' }); const body = await handler(String(url)); return body instanceof Response ? body : new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }); })); return calls; }
const panel = () => <EvaluationRunLinks result={result} agentId="agent" versionId="version" />;
it('opens a deduplicated exact report sample through GETs without model work', async () => {
 const calls = setup(url => url.endsWith('/agents') ? [{ id:'agent',key:'public',name:'Public' }] : url.endsWith('/agents/agent/evaluations') ? [evaluation] : url.endsWith('/evaluations/eval') ? { ...evaluation, results:[result] } : url.endsWith('/runs/run-a') ? run() : url.endsWith('/trace') ? [{ id:'event',seq:3,type:'model.end',step:'answer' }] : []);
 view(<ControlledEvolutionWorkspace />);fireEvent.click(await screen.findByRole('button',{name:'查看 eval 的逐项证据'}));fireEvent.click(await screen.findByRole('button',{name:/查看 Run run-a /}));expect(await screen.findByText('3 · model.end · answer')).toBeInTheDocument();expect(screen.getAllByRole('button',{name:/查看 Run run-a /})).toHaveLength(1);expect(calls.every(c=>c.method==='GET')).toBe(true);
});
it.each([403,404])('denied/missing %s does not load Trace or invent success', async status=>{
 const calls=setup(()=>new Response(JSON.stringify({message:'不可访问'}),{status}));view(panel());fireEvent.click(screen.getByRole('button',{name:/查看 Run run-a /}));expect(await screen.findByRole('alert')).toHaveTextContent('不可访问');expect(calls).toHaveLength(1);expect(screen.queryByText(/状态：COMPLETED/)).not.toBeInTheDocument();
});
it.each([{agentId:'foreign'},{agentVersionId:'wrong'},{id:'wrong'}])('rejects mismatched report provenance %#', async patch=>{
 const calls=setup(()=>({...run(),...patch}));view(panel());fireEvent.click(screen.getByRole('button',{name:/查看 Run run-a /}));expect(await screen.findByRole('alert')).toHaveTextContent('不匹配');expect(calls).toHaveLength(1);
});
it('keeps unknown costs, empty Trace and private fields honest', async ()=>{
 setup(url=>url.endsWith('/trace')?[]:{...run(),estimatedCost:null,input:'private-input',output:'private-output',error:'private-error'});view(panel());fireEvent.click(screen.getByRole('button',{name:/查看 Run run-a /}));expect(await screen.findByText(/未知，不能按零计算/)).toBeInTheDocument();expect(await screen.findByText(/未记录 Trace 事件/)).toBeInTheDocument();for(const value of ['private-input','private-output','private-error'])expect(screen.queryByText(value)).not.toBeInTheDocument();
});
it('a late previous Run cannot replace the newly selected Run', async ()=>{
 let release!:(v:unknown)=>void;const held=new Promise(resolve=>{release=resolve});const calls=setup(url=>url.endsWith('/runs/run-a')?held:url.endsWith('/trace')?[{id:'b',seq:9,type:'run-b.end'}]:run('run-b'));view(panel());fireEvent.click(screen.getByRole('button',{name:/查看 Run run-a /}));await waitFor(()=>expect(calls).toHaveLength(1));fireEvent.click(screen.getByRole('button',{name:/查看 Run run-b /}));expect(await screen.findByText('9 · run-b.end')).toBeInTheDocument();release(run());await waitFor(()=>expect(screen.getByRole('region',{name:'Run run-b 详情'})).toBeInTheDocument());expect(screen.queryByRole('region',{name:'Run run-a 详情'})).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'关闭运行详情'}));expect(screen.queryByText('9 · run-b.end')).not.toBeInTheDocument();
});
