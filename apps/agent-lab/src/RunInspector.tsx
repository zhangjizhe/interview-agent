import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { checkedEvents, costLabel, dateLabel, diagnosticJson, diagnosticText, durationLabel, eventGroup, isFailure, numeric, type RuntimeRun } from './trace-diagnostics';
import './trace-workbench.css';

export async function readRuntime(path: string, signal?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 15000);
  try { return await api(path, { signal: controller.signal }); }
  catch (error) {
    if (controller.signal.aborted) throw new Error('读取超时或已取消；可重新读取，不会重跑模型。');
    throw new Error(diagnosticText(error instanceof Error ? error.message : '读取失败'));
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export function RunInspector({ runId, agentId, versionId, close }: { runId: string; agentId?: string; versionId?: string; close?: () => void }) {
  return <Inspector key={`${agentId ?? ''}:${versionId ?? ''}:${runId}`} runId={runId} agentId={agentId} versionId={versionId} close={close} />;
}
function Inspector({ runId, agentId, versionId, close }: { runId: string; agentId?: string; versionId?: string; close?: () => void }) {
  const [selected, setSelected] = useState('');
  const [group, setGroup] = useState('all');
  const [search, setSearch] = useState('');
  const [showContent, setShowContent] = useState(false);
  const [showRunContent, setShowRunContent] = useState(false);
  const run = useQuery<RuntimeRun>({ queryKey: ['runtime-inspector', agentId, versionId, runId], retry: false,
    refetchInterval: query => ['PENDING', 'RUNNING'].includes(query.state.data?.status ?? '') ? 3000 : false,
    queryFn: async ({ signal }) => {
      const value = await readRuntime(`/agent-lab/runs/${encodeURIComponent(runId)}`, signal);
      if (value?.id !== runId || (agentId && value.agentId !== agentId) || (versionId && value.agentVersionId !== versionId)) {
        throw new Error('运行与当前评测版本不匹配，未展示详情。');
      }
      return value;
    } });
  const trace = useQuery({ queryKey: ['runtime-inspector-events', agentId, versionId, runId, run.data?.status], retry: false,
    enabled: Boolean(run.data) && !run.isError,
    queryFn: async ({ signal }) => checkedEvents(await readRuntime(`/agent-lab/runs/${encodeURIComponent(runId)}/trace`, signal), runId) });
  const events = trace.isError ? [] : trace.data ?? [];
  const failures = events.filter(isFailure);
  const visible = events.filter(event => (group === 'all' || (group === 'errors' ? isFailure(event) : eventGroup(event) === group))
    && `${event.seq} ${event.type} ${event.step ?? ''} ${event.name ?? ''} ${event.callId ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const current = visible.find(event => event.id === selected) ?? visible.find(isFailure) ?? visible[0];
  const data = !run.isError ? run.data : undefined;
  const refresh = async () => {
    const next = await run.refetch();
    if (!next.isError) await trace.refetch();
  };
  return <section className="trace-inspector" aria-label={`Run ${runId} 详情`}>
    <header className="trace-heading"><div><p className="trace-eyebrow">RUN INSPECTOR · 只读排障</p><h2>运行详情</h2><code>{runId}</code></div>
      <div className="trace-actions"><button type="button" disabled={run.isFetching || trace.isFetching} onClick={refresh}>重新读取</button>{close && <button type="button" onClick={close}>关闭运行详情</button>}</div></header>
    {run.isPending && <p role="status">正在读取受保护运行…</p>}
    {run.isError && <p role="alert">{run.error.message}</p>}
    {data && <>
      <p className={`trace-status ${data.status === 'FAILED' ? 'is-failure' : ''}`}>状态：{data.status} · 版本：{data.agentVersion?.version ?? '未记录'}</p>
      <div className="trace-metrics"><div><span>模型调用</span><strong>{data.tokenUsage?.calls ?? '未知'}</strong></div><div><span>估算费用</span><strong>{costLabel(data.estimatedCost)}</strong></div><div><span>总耗时</span><strong>{durationLabel(data.latencyMs)}</strong></div><div><span>输入 / 输出 Token</span><strong>{data.tokenUsage?.promptTokens ?? '未知'} / {data.tokenUsage?.completionTokens ?? '未知'}</strong></div></div>
      <dl className="trace-properties"><div><dt>Agent</dt><dd>{data.agent?.name ?? data.agentId}</dd></div><div><dt>应用</dt><dd>{data.application ?? '未记录'}</dd></div><div><dt>开始 / 完成</dt><dd>{dateLabel(data.startedAt)} / {dateLabel(data.completedAt)}</dd></div>{data.parentRunId && <div><dt>父运行</dt><dd><code>{data.parentRunId}</code></dd></div>}</dl>
      {data.error && <div className="trace-error-summary"><strong>运行失败原因</strong><p>{diagnosticText(data.error)}</p><small>凭据与邮箱已过滤；完整原始记录不在此页面导出。</small></div>}
      <div className="trace-toolbar"><h3>事件时间线 <small>{events.length} 条 · {failures.length} 条异常事件</small></h3><button type="button" disabled={!failures.length} onClick={() => { setGroup('all'); setSearch(''); setSelected(failures[0].id); setShowContent(false); }}>定位首个异常</button></div>
      <div className="trace-filters"><label>事件类型<select value={group} onChange={event => { setGroup(event.target.value); setShowContent(false); }}><option value="all">全部事件</option><option value="errors">仅异常</option><option value="model">模型调用</option><option value="tool">工具与审批</option><option value="workflow">工作流与子 Agent</option><option value="retrieval">检索与数据读取</option><option value="runtime">运行生命周期</option></select></label><label>搜索事件<input value={search} onChange={event => { setSearch(event.target.value); setShowContent(false); }} placeholder="类型、节点、调用 ID 或序号" /></label></div>
      {trace.isPending && <p role="status">正在读取 Trace…</p>}
      {trace.isError && <p role="alert">Trace 读取失败：{trace.error.message}</p>}
      {!trace.isPending && !trace.isError && !events.length && <p>未记录 Trace 事件；不代表运行已通过评测。</p>}
      {!trace.isPending && !trace.isError && Boolean(events.length) && <div className="trace-split"><div className="trace-timeline" aria-label="事件列表">{visible.length ? visible.map(event => <button key={event.id} type="button" className={`trace-event ${isFailure(event) ? 'is-failure' : ''}`} aria-pressed={current?.id === event.id} onClick={() => { setSelected(event.id); setShowContent(false); }}>
        <span className="trace-event-title">{event.seq} · {event.type}{event.step ? ` · ${event.step}` : ''}</span><span>{event.name ?? event.type}{isFailure(event) ? ' · 事件失败' : ''}</span><small>{dateLabel(event.createdAt)}{numeric(event.latencyMs) ? ` · ${durationLabel(event.latencyMs)}` : ''}</small>
      </button>) : <p>没有匹配事件，请调整筛选条件。</p>}</div>
        <article className="trace-event-detail" aria-label="事件详情">{current ? <><p className="trace-eyebrow">事件 #{current.seq}</p><h3>{current.type}</h3><dl className="trace-properties"><div><dt>节点</dt><dd>{current.step ?? '未记录'}</dd></div><div><dt>时间</dt><dd>{dateLabel(current.createdAt)}</dd></div><div><dt>调用 ID</dt><dd>{current.callId ?? '未记录'}</dd></div><div><dt>耗时 / 估算费用</dt><dd>{durationLabel(current.latencyMs)} / {costLabel(current.estimatedCost)}</dd></div></dl>
          {current.error && <div className="trace-error-summary"><strong>事件错误</strong><pre>{diagnosticText(current.error)}</pre></div>}
          <h4>调用与执行元数据</h4><pre>{diagnosticJson(current.metadata)}</pre><h4>Token 用量</h4><pre>{diagnosticJson(current.tokenUsage)}</pre>
          <h4>事件数据</h4><p className="trace-muted">输入、输出与工具结果可能含业务资料；常见凭据字段会隐藏，系统消息与 Prompt 不展示。</p><button type="button" aria-expanded={showContent} onClick={() => setShowContent(value => !value)}>{showContent ? '收起业务内容' : '查看过滤后的输入 / 输出'}</button>
          {showContent && <div className="trace-content"><h4>输入</h4><pre>{diagnosticJson(current.input)}</pre><h4>输出</h4><pre>{diagnosticJson(current.output)}</pre><h4>工具、路由与检索结果</h4><pre>{diagnosticJson(current.payload)}</pre></div>}
        </> : <p>选择事件以查看细节。</p>}</article></div>}
      <div className="trace-run-content"><button type="button" aria-expanded={showRunContent} onClick={() => setShowRunContent(value => !value)}>查看运行输入与最终输出（过滤后的业务内容）</button>{showRunContent && <div className="trace-content"><h4>运行输入</h4><pre>{diagnosticJson(data.input)}</pre><h4>最终输出</h4><pre>{diagnosticJson(data.output)}</pre></div>}</div>
      <p className="trace-muted">这里只读取已持久化记录。未记录的耗时、Token 与费用保留未知；刷新不会重新调用模型。</p>
    </>}
  </section>;
}
