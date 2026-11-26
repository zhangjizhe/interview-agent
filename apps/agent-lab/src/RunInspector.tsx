import { useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import { RunStatusBadge } from './RunStatusBadge';
import { useMutation, useQuery } from '@tanstack/react-query';
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
  const [copyNotice, setCopyNotice] = useState('');
  const [group, setGroup] = useState('all');
  const [search, setSearch] = useState('');
  const [showContent, setShowContent] = useState(false);
  const [showRunContent, setShowRunContent] = useState(false);
  const [showPromote, setShowPromote] = useState(false);
  const [datasetId, setDatasetId] = useState('');
  const [caseKey, setCaseKey] = useState('');
  const [keywords, setKeywords] = useState('');
  const [note, setNote] = useState('');
  const [promoteFeedback, setPromoteFeedback] = useState('');
  const [ratingNotice, setRatingNotice] = useState('');
  const submitFeedback = useMutation({
    mutationFn: (rating: 'UP' | 'DOWN') =>
      api(`/agent-lab/runs/${encodeURIComponent(runId)}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, sourceApp: 'agent-lab' }),
      }),
    onSuccess: (_res, rating) => {
      setRatingNotice(
        rating === 'DOWN'
          ? '已标记为 Bad Case（👎），已进入待评审队列（不调用模型）。'
          : '已记录正向反馈（👍）（不调用模型）。',
      );
    },
  });
  const datasets = useQuery<Array<{ id: string; name: string; version: string; frozenAt?: string | null }>>({
    queryKey: ['lab-datasets-for-promote'],
    enabled: showPromote,
    retry: false,
    queryFn: () => api('/agent-lab/datasets'),
  });
  const promote = useMutation({
    mutationFn: () =>
      api(`/agent-lab/runs/${encodeURIComponent(runId)}/promote-to-dataset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetId,
          ...(caseKey.trim() ? { key: caseKey.trim() } : {}),
          ...(keywords.trim()
            ? { expectedKeywords: keywords.split(/[,，\n]/).map(s => s.trim()).filter(Boolean) }
            : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      }),
    onSuccess: (created: any) => {
      setPromoteFeedback(`已脱敏沉淀为回归用例：${created?.key || created?.id || '已创建'}（不触发模型调用）。`);
      setCaseKey('');
      setKeywords('');
      setNote('');
    },
  });
  const editableDatasets = (datasets.data ?? []).filter(ds => !ds.frozenAt);
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
      <div className="trace-actions"><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(runId); setCopyNotice('Run ID 已复制'); } catch { setCopyNotice('无法复制，请选择上方 Run ID 手动复制。'); } }}><Copy size={14} aria-hidden="true"/>复制 ID</button><button type="button" disabled={run.isFetching || trace.isFetching} onClick={refresh}><RefreshCw size={14} className={run.isFetching || trace.isFetching ? 'spin' : ''} aria-hidden="true"/>重新读取</button>{close && <button type="button" onClick={close}>关闭运行详情</button>}</div></header>
    {copyNotice && <p className="trace-copy-notice" role="status">{copyNotice}</p>}
    {run.isPending && <p role="status">正在读取受保护运行…</p>}
    {run.isError && <p role="alert" aria-label="运行读取失败">{run.error.message}</p>}
    {data && <>
      <div className="trace-status"><RunStatusBadge status={data.status}/><span>版本 {data.agentVersion?.version ?? '未记录'}</span></div>
      <div className="trace-metrics"><div><span>模型调用</span><strong>{data.tokenUsage?.calls ?? '未知'}</strong></div><div><span>估算费用</span><strong>{costLabel(data.estimatedCost)}</strong></div><div><span>总耗时</span><strong>{durationLabel(data.latencyMs)}</strong></div><div><span>输入 / 输出 Token</span><strong>{data.tokenUsage?.promptTokens ?? '未知'} / {data.tokenUsage?.completionTokens ?? '未知'}</strong></div></div>
      <dl className="trace-properties"><div><dt>Agent</dt><dd>{data.agent?.name ?? data.agentId}</dd></div><div><dt>应用</dt><dd>{data.application ?? '未记录'}</dd></div><div><dt>开始 / 完成</dt><dd>{dateLabel(data.startedAt)} / {dateLabel(data.completedAt)}</dd></div>{data.parentRunId && <div><dt>父运行</dt><dd><code>{data.parentRunId}</code></dd></div>}</dl>
      {data.error && <div role="alert" aria-label="运行失败原因" className="trace-error-summary"><strong>运行失败原因</strong><p>{diagnosticText(data.error)}</p><small>凭据与邮箱已过滤；完整原始记录不在此页面导出。</small></div>}
      <div className="trace-toolbar"><h3>事件时间线 <small>{events.length} 条 · {failures.length} 条异常事件</small></h3><button type="button" disabled={!failures.length} onClick={() => { setGroup('all'); setSearch(''); setSelected(failures[0].id); setShowContent(false); }}>定位首个异常</button></div>
      <div className="trace-filters"><label>事件类型<select value={group} onChange={event => { setGroup(event.target.value); setShowContent(false); }}><option value="all">全部事件</option><option value="errors">仅异常</option><option value="model">模型调用</option><option value="tool">工具与审批</option><option value="workflow">工作流与子 Agent</option><option value="retrieval">检索与数据读取</option><option value="runtime">运行生命周期</option></select></label><label>搜索事件<input value={search} onChange={event => { setSearch(event.target.value); setShowContent(false); }} placeholder="类型、节点、调用 ID 或序号" /></label></div>
      {trace.isPending && <p role="status">正在读取 Trace…</p>}
      {trace.isError && <p role="alert" aria-label="Trace 读取失败">Trace 读取失败：{trace.error.message}</p>}
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
      <div className="trace-run-content">
        <div className="trace-run-actions">
          <button type="button" aria-expanded={showRunContent} onClick={() => setShowRunContent(value => !value)}>查看运行输入与最终输出（过滤后的业务内容）</button>
          <button type="button" className="is-promote" aria-expanded={showPromote} onClick={() => { setShowPromote(value => !value); setPromoteFeedback(''); promote.reset(); }}>转入回归集</button>
          <button type="button" disabled={submitFeedback.isPending} onClick={() => { setRatingNotice(''); submitFeedback.mutate('UP'); }}>标记正向 👍</button>
          <button type="button" disabled={submitFeedback.isPending} onClick={() => { setRatingNotice(''); submitFeedback.mutate('DOWN'); }}>标记 Bad Case 👎</button>
        </div>
        {submitFeedback.isError && <p role="alert">{diagnosticText(submitFeedback.error instanceof Error ? submitFeedback.error.message : '反馈记录失败')}</p>}
        {ratingNotice && <p role="status">{ratingNotice}</p>}
        {showRunContent && <div className="trace-content"><h4>运行输入</h4><pre>{diagnosticJson(data.input)}</pre><h4>最终输出</h4><pre>{diagnosticJson(data.output)}</pre></div>}
        {showPromote && <section className="trace-promote-panel" aria-label="沉淀为回归用例">
          <h4>将该 Run 脱敏沉淀为回归用例</h4>
          <p className="trace-muted">服务端将自动脱敏邮箱、手机号与常见密钥前缀；仅可写入未冻结的 Dataset，不调用任何模型。</p>
          {datasets.isPending && <p role="status">正在读取可用数据集…</p>}
          {datasets.isError && <p role="alert">数据集读取失败：{diagnosticText(datasets.error instanceof Error ? datasets.error.message : '读取失败')}</p>}
          {!datasets.isPending && !datasets.isError && !editableDatasets.length && <p>当前没有可编辑（未冻结）的数据集，请先在「评测」页新建数据集版本。</p>}
          {editableDatasets.length > 0 && <form className="trace-promote-form" onSubmit={event => { event.preventDefault(); if (datasetId && !promote.isPending) promote.mutate(); }}>
            <label>目标数据集<select required value={datasetId} onChange={event => setDatasetId(event.target.value)}><option value="">请选择未冻结数据集</option>{editableDatasets.map(ds => <option key={ds.id} value={ds.id}>{ds.name} · {ds.version}</option>)}</select></label>
            <label>用例 Key（可选）<input value={caseKey} onChange={event => setCaseKey(event.target.value)} placeholder="留空自动生成 badcase-xxxx" pattern="[a-z][a-z0-9-]{1,63}" /></label>
            <label>期望关键词（可选，逗号分隔）<input value={keywords} onChange={event => setKeywords(event.target.value)} placeholder="例如：熔断,降级,幂等" /></label>
            <label>Bad Case 备注（可选）<input value={note} onChange={event => setNote(event.target.value)} maxLength={1000} placeholder="记录偏题、幻觉或追问不足原因" /></label>
            <button type="submit" disabled={!datasetId || promote.isPending}>{promote.isPending ? '沉淀中…' : '确认转入回归集'}</button>
          </form>}
          {promote.isError && <p role="alert">{diagnosticText(promote.error instanceof Error ? promote.error.message : '转入失败')}</p>}
          {promoteFeedback && <p role="status">{promoteFeedback}</p>}
        </section>}
      </div>
      <p className="trace-muted">这里只读取已持久化记录。未记录的耗时、Token 与费用保留未知；刷新不会重新调用模型。</p>
    </>}
  </section>;
}
