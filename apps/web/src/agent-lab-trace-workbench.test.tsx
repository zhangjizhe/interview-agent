import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RuntimeTraceWorkspace } from '../../agent-lab/src/RuntimeTraceWorkspace';
import { RunInspector } from '../../agent-lab/src/RunInspector';
import { diagnosticJson } from '../../agent-lab/src/trace-diagnostics';

const run = (id = 'run-1') => ({ id, agentId: 'agent-1', agentVersionId: 'version-1', status: 'FAILED',
  agent: { name: 'Document assistant', key: 'documents' }, agentVersion: { version: '2.0.0' }, application: 'portfolio',
  createdAt: '2026-11-09T08:00:00Z', estimatedCost: null, latencyMs: 340, tokenUsage: { calls: 1, promptTokens: 20, completionTokens: 50 },
  input: { message: 'question-private', authorization: 'secret-input' }, output: { response: 'answer-private', systemPrompt: 'private-system' },
  error: 'Output validation failed; token=secret-error; user@example.com' });
const events = [
  { id: 'end', runId: 'run-1', seq: 3, type: 'run.failed', step: 'validate', error: 'JSON schema rejected', payload: { status: 'FAILED' } },
  { id: 'model', runId: 'run-1', seq: 2, type: 'model.end', step: 'answer', callId: 'call-1', estimatedCost: .0002, tokenUsage: { promptTokens: 20, completionTokens: 50 },
    metadata: { provider: 'qwen', model: 'fixture-model', apiKey: 'secret-model' }, output: { response: 'event-answer', password: 'private-password' } },
  { id: 'start', runId: 'run-1', seq: 1, type: 'turn.start', step: 'runtime' },
];
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.useRealTimers(); });
function view(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
function setup(handler: (url: string) => unknown | Promise<unknown>) {
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET' });
    const data = await handler(String(url));
    return data instanceof Response ? data : new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  }));
  return calls;
}
it('lists real runtime API records, filters status/search, opens the exact Run and refreshes with GET only', async () => {
  const calls = setup(url => url === '/api/agent-lab/runs' ? [run(), { ...run('other'), status: 'COMPLETED', agent: { name: 'Other' } }] : url.endsWith('/trace') ? events : run());
  view(<RuntimeTraceWorkspace />);
  const list = await screen.findByRole('complementary', { name: '运行列表' });
  await within(list).findByRole('button', { name: /Document assistant/ });
  fireEvent.change(screen.getByLabelText('运行状态'), { target: { value: 'FAILED' } });
  expect(within(list).queryByRole('button', { name: /Other/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('筛选运行'), { target: { value: 'portfolio' } });
  fireEvent.click(within(list).getByRole('button', { name: /Document assistant/ }));
  expect(await screen.findByText('JSON schema rejected')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '重新读取' }));
  await waitFor(() => expect(calls.filter(call => call.url.endsWith('/trace'))).toHaveLength(2));
  expect(calls.every(call => call.method === 'GET')).toBe(true);
  expect(calls.some(call => call.url.includes('dashboard'))).toBe(false);
});
it('sorts and inspects events, finds failure, filters and only reveals business content explicitly', async () => {
  setup(url => url.endsWith('/trace') ? events : run());
  view(<RunInspector runId="run-1" />);
  expect(await screen.findByText('JSON schema rejected')).toBeInTheDocument();
  const timeline = screen.getByLabelText('事件列表');
  expect(within(timeline).getAllByRole('button').map(button => button.textContent?.slice(0, 1))).toEqual(['1', '2', '3']);
  fireEvent.click(within(timeline).getByRole('button', { name: /2 · model.end/ }));
  const detail = screen.getByRole('article', { name: '事件详情' });
  expect(within(detail).getByText(/fixture-model/)).toBeInTheDocument();
  expect(within(detail).getByText('call-1')).toBeInTheDocument();
  expect(screen.queryByText(/event-answer/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '查看过滤后的输入 / 输出' }));
  expect(screen.getByText(/event-answer/)).toBeInTheDocument();
  expect(screen.queryByText(/private-password|secret-model|secret-error|user@example.com/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('事件类型'), { target: { value: 'model' } });
  expect(within(timeline).getAllByRole('button')).toHaveLength(1);
  expect(screen.queryByText(/event-answer/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '定位首个异常' }));
  expect(within(detail).getByText('JSON schema rejected')).toBeInTheDocument();
  expect(within(timeline).getAllByRole('button')).toHaveLength(3);
  fireEvent.change(screen.getByLabelText('搜索事件'), { target: { value: 'not-found' } });
  expect(screen.getByText('没有匹配事件，请调整筛选条件。')).toBeInTheDocument();
  expect(screen.queryByText(/question-private|answer-private/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /查看运行输入与最终输出/ }));
  expect(screen.getByText(/question-private/)).toBeInTheDocument();
  expect(screen.getByText(/answer-private/)).toBeInTheDocument();
  expect(screen.queryByText(/private-system|secret-input/)).not.toBeInTheDocument();
});
it.each([403, 404])('keeps denied/missing runtime %s distinct from an empty workspace', async status => {
  const calls = setup(url => url.endsWith('/runs') ? [] : new Response(JSON.stringify({ message: '无权访问' }), { status }));
  view(<RuntimeTraceWorkspace />);
  fireEvent.change(screen.getByLabelText('按 Run ID 打开'), { target: { value: 'protected-run' } });
  fireEvent.click(screen.getByRole('button', { name: '打开运行' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('无权访问');
  expect(calls.some(call => call.url.endsWith('/trace'))).toBe(false);
});
it.each([null, [{ ...events[0], runId: 'foreign-run' }], [events[0], events[0]]])('rejects malformed or mixed-run Trace %# without inventing events', async trace => {
  setup(url => url.endsWith('/trace') ? trace : run());
  view(<RunInspector runId="run-1" />);
  expect(await screen.findByRole('alert', { name: 'Trace 读取失败' })).toHaveTextContent(/Trace 读取失败/);
  expect(screen.queryByLabelText('事件列表')).not.toBeInTheDocument();
});
it('shows list failure rather than no-data and supports GET retry', async () => {
  let fail = true;
  const calls = setup(() => fail ? new Response(JSON.stringify({ message: 'unavailable' }), { status: 503 }) : []);
  view(<RuntimeTraceWorkspace />);
  expect(await screen.findByRole('alert')).toHaveTextContent('运行列表读取失败');
  expect(screen.queryByText('当前工作区尚无 Agent Run。')).not.toBeInTheDocument();
  fail = false; fireEvent.click(screen.getByRole('button', { name: '刷新运行列表' }));
  expect(await screen.findByText('当前工作区尚无 Agent Run。')).toBeInTheDocument();
  expect(calls).toHaveLength(2);
});
it('hides stale Run/Trace on failed reread and resets revealed content when Run changes', async () => {
  let fail = false;
  setup(url => fail ? new Response('{}', { status: 403 }) : url.endsWith('/trace') ? events : run());
  const rendered = view(<RunInspector runId="run-1" />);
  await screen.findByText('JSON schema rejected');
  fireEvent.click(screen.getByRole('button', { name: /查看运行输入与最终输出/ }));
  expect(screen.getByText(/question-private/)).toBeInTheDocument();
  fail = true; fireEvent.click(screen.getByRole('button', { name: '重新读取' }));
  await screen.findByRole('alert', { name: '运行读取失败' });
  expect(screen.queryByLabelText('事件列表')).not.toBeInTheDocument();
  expect(screen.queryByText(/question-private/)).not.toBeInTheDocument();
  rendered.rerender(<QueryClientProvider client={clients[0]}><RunInspector runId="another-run" /></QueryClientProvider>);
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Run run-1 详情' })).not.toBeInTheDocument());
});
it('bounds diagnostics and removes nested credentials, system messages, URL secrets and HTML execution', () => {
  const result = diagnosticJson({ promptTokens: 911, nested: { apiKey: 'private-key', systemPrompt: 'private-prompt' }, system: { role: 'system', content: 'private-instruction' }, url: 'https://user:password@example.com/path?token=abc#secret', text: 'Bearer credential sk-secretkey012345 <script>evil()</script> test@example.com' });
  expect(result).not.toMatch(/private-key|private-prompt|private-instruction|credential|sk-secretkey012345|user:password|token=abc|test@example.com/);
  expect(result).toContain('"promptTokens": 911');
  expect(result).toContain('<script>evil()</script>'); // React renders this as text, never HTML.
  expect(diagnosticJson({ long: 'x'.repeat(20000) }).length).toBeLessThan(6100);
  expect(diagnosticJson({ long: 'x'.repeat(20000) })).toContain('内容已截断');
});
it('times out a stalled read, exposes a retry, and never sends a model mutation', async () => {
  vi.useFakeTimers();
  const fetch = vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  }));
  vi.stubGlobal('fetch', fetch);
  view(<RunInspector runId="stalled" />);
  await act(async () => { await vi.advanceTimersByTimeAsync(15020); });
  expect(screen.getByRole('alert')).toHaveTextContent('读取超时或已取消');
  expect(screen.getByRole('button', { name: '重新读取' })).toBeEnabled();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1]?.method).toBeUndefined();
});

it('preserves the accessible failed-Run alert used by the real external-init browser regression', async () => {
  setup(url => url.endsWith('/trace') ? [] : run());
  view(<RunInspector runId="run-1" />);
  const alert = await screen.findByRole('alert', { name: '运行失败原因' });
  expect(alert).toHaveTextContent('Output validation failed');
  expect(alert).not.toHaveTextContent('secret-error');
  expect(alert).not.toHaveTextContent('user@example.com');
  expect(alert).toHaveTextContent('[已隐藏]');
});
