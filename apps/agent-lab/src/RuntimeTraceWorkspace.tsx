import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { readRuntime, RunInspector } from './RunInspector';
import { costLabel, dateLabel, durationLabel, type RuntimeRun } from './trace-diagnostics';

export function RuntimeTraceWorkspace() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState('');
  const [lookup, setLookup] = useState('');
  const runs = useQuery<RuntimeRun[]>({ queryKey: ['runtime-trace-runs'], retry: false,
    queryFn: async ({ signal }) => {
      const result = await readRuntime('/agent-lab/runs', signal);
      if (!Array.isArray(result) || result.some(run => !run || typeof run.id !== 'string' || typeof run.status !== 'string')) throw new Error('运行列表格式异常，未显示为空数据。');
      return result;
    } });
  const visible = (runs.isError ? [] : runs.data ?? []).filter(run => (!status || run.status === status)
    && `${run.id} ${run.agent?.name ?? ''} ${run.agent?.key ?? ''} ${run.application ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="trace-workspace"><header className="trace-heading"><div><p className="trace-eyebrow">RUNTIME OBSERVABILITY</p><h2>运行排障工作台</h2><p>当前工作区最近 100 条真实 Agent Run；选择运行查看事件与故障细节。</p></div><button type="button" disabled={runs.isFetching} onClick={() => runs.refetch()}>刷新运行列表</button></header>
    <form className="trace-controls" onSubmit={event => { event.preventDefault(); if (lookup.trim()) setSelected(lookup.trim()); }}>
      <label>筛选运行<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Run ID、Agent 名称或应用" /></label>
      <label>运行状态<select value={status} onChange={event => setStatus(event.target.value)}><option value="">全部状态</option>{['PENDING','RUNNING','COMPLETED','FAILED','CANCELLED'].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>按 Run ID 打开<input value={lookup} onChange={event => setLookup(event.target.value)} maxLength={200} placeholder="定位更早的已有运行" /></label><button type="submit" disabled={!lookup.trim()}>打开运行</button>
    </form>
    {runs.isPending && <p role="status">正在读取运行列表…</p>}{runs.isError && <p role="alert">运行列表读取失败：{runs.error.message}</p>}
    <div className="trace-workspace-grid"><aside className="trace-run-list" aria-label="运行列表">{visible.map(run => <button type="button" key={run.id} aria-pressed={selected === run.id} className={`trace-run-card ${run.status === 'FAILED' ? 'is-failure' : ''}`} onClick={() => setSelected(run.id)}><strong>{run.agent?.name ?? '未记录 Agent'} <span>{run.agentVersion?.version}</span></strong><span>{run.status} · {run.application ?? '未记录应用'}</span><code>{run.id}</code><small>{dateLabel(run.createdAt)}</small><small>{durationLabel(run.latencyMs)} · {costLabel(run.estimatedCost)}</small></button>)}
      {runs.isSuccess && !visible.length && <p>{runs.data.length ? '没有匹配运行，请调整筛选条件。' : '当前工作区尚无 Agent Run。'}</p>}</aside>
      {selected ? <RunInspector runId={selected} close={() => setSelected('')} /> : <div className="trace-empty"><h3>选择一次运行，开始定位问题</h3><p>查看完整事件顺序、模型与工具元数据、异常原因，以及过滤后的输入输出。此处不会启动模型。</p></div>}
    </div></div>;
}
