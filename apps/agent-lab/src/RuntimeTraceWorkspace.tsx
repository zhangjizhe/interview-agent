import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, GitBranch, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import { readRuntime, RunInspector } from './RunInspector';
import { RunStatusBadge } from './RunStatusBadge';
import { costLabel, dateLabel, durationLabel, numeric, type RuntimeRun } from './trace-diagnostics';

const selectedFromUrl = () => (new URLSearchParams(window.location.search).get('run') ?? '').slice(0, 200);
export function RuntimeTraceWorkspace() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState(selectedFromUrl);
  const [lookup, setLookup] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const inspector = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1050px)').matches) {
      inspector.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }, [selected]);
  useEffect(() => {
    const onPop = () => setSelected(selectedFromUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const selectRun = (id: string) => {
    setSelected(id);
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'trace');
    if (id) url.searchParams.set('run', id); else url.searchParams.delete('run');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  };
  const runs = useQuery<RuntimeRun[]>({ queryKey: ['runtime-trace-runs'], retry: false,
    queryFn: async ({ signal }) => {
      const result = await readRuntime('/agent-lab/runs', signal);
      if (!Array.isArray(result) || result.some(run => !run || typeof run.id !== 'string' || typeof run.status !== 'string')) throw new Error('运行列表格式异常，未显示为空数据。');
      return result;
    } });
  const visible = (runs.isError ? [] : runs.data ?? []).filter(run => (!status || run.status === status)
    && `${run.id} ${run.agent?.name ?? ''} ${run.agent?.key ?? ''} ${run.application ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const resetFilters = () => { setSearch(''); setStatus(''); };
  return <div className="trace-workspace">
    <header className="trace-heading trace-list-heading"><div><span className="trace-section-title">最近运行</span><p>当前工作区最近 100 条记录 · 读取记录不会启动模型</p></div><div className="trace-list-actions"><button className="trace-filter-toggle" type="button" aria-controls="trace-filter-form" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(value => !value)}><SlidersHorizontal size={14} aria-hidden="true"/>筛选与定位</button><button type="button" disabled={runs.isFetching} onClick={() => void runs.refetch()}><RefreshCw size={14} className={runs.isFetching ? 'spin' : ''} aria-hidden="true"/>{runs.isFetching ? '正在读取…' : '刷新运行列表'}</button></div></header>
    <form id="trace-filter-form" className={`trace-controls ${filtersOpen ? 'is-open' : ''}`} onSubmit={event => { event.preventDefault(); if (lookup.trim()) selectRun(lookup.trim()); }}>
      <label className="trace-search-field">筛选运行<span><Search size={15} aria-hidden="true"/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Run ID、Agent 或应用" /></span></label>
      <label>运行状态<select value={status} onChange={event => setStatus(event.target.value)}><option value="">全部状态</option><option value="PENDING">等待中</option><option value="RUNNING">运行中</option><option value="COMPLETED">已完成</option><option value="FAILED">失败</option><option value="CANCELLED">已取消</option></select></label>
      <label>按 Run ID 打开<input value={lookup} onChange={event => setLookup(event.target.value)} maxLength={200} placeholder="粘贴已有运行 ID" /></label><button type="submit" disabled={!lookup.trim()}>打开运行<ArrowRight size={14} aria-hidden="true"/></button>
    </form>
    {runs.isPending && <div className="trace-list-state" role="status"><RefreshCw size={18} className="spin"/>正在读取运行列表…</div>}
    {runs.isError && <div className="trace-list-state trace-list-error" role="alert"><strong>运行列表读取失败</strong><span>{runs.error.message}</span><button type="button" disabled={runs.isFetching} onClick={() => void runs.refetch()}>重试读取运行列表</button></div>}
    {runs.isSuccess && <div className="trace-result-count"><span role="status">显示 {visible.length} / {runs.data.length} 条记录</span>{(search || status) && <button type="button" onClick={resetFilters}><X size={13} aria-hidden="true"/>清除筛选</button>}</div>}
    <div className="trace-workspace-grid"><aside className="trace-run-list" aria-label="运行列表">{visible.map(run => <button type="button" key={run.id} aria-pressed={selected === run.id} className="trace-run-card" onClick={() => selectRun(run.id)}><span className="trace-card-head"><strong>{run.agent?.name ?? '未记录 Agent'}</strong><RunStatusBadge status={run.status}/></span><span className="trace-card-context">{run.application ?? '未记录应用'}<span>版本 {run.agentVersion?.version ?? '未记录'}</span></span><code>{run.id}</code><small>{dateLabel(run.createdAt)}</small><span className="trace-card-footer"><small>{durationLabel(run.latencyMs)}</small><small title={costLabel(run.estimatedCost)}>{numeric(run.estimatedCost) ? costLabel(run.estimatedCost) : '费用未知'}</small></span></button>)}
      {runs.isSuccess && !visible.length && <div className="trace-list-state"><Search size={22}/><strong>{runs.data.length ? '没有匹配的运行' : '暂无运行记录'}</strong><p>{runs.data.length ? '换一个关键词或清除状态筛选。' : '完成一次 Agent 运行后，可在这里查看记录。'}</p>{(search || status) && <button type="button" onClick={resetFilters}>清除筛选</button>}</div>}</aside>
      {selected ? <div className="trace-inspector-slot" ref={inspector}><RunInspector runId={selected} close={() => selectRun('')} /></div> : <div className="trace-empty"><span className="trace-empty-icon"><GitBranch size={26} aria-hidden="true"/></span><h3>选择运行，查看发生了什么</h3><p>左侧选择一条记录，查看事件顺序、调用元数据与失败原因；也可粘贴 Run ID 定位更早的记录。</p><div className="trace-empty-steps"><span>01 选择运行</span><ArrowRight size={14}/><span>02 定位事件</span><ArrowRight size={14}/><span>03 核对输入与输出</span></div><small>仅展示已持久化的执行记录，不展示内部推理。</small></div>}
    </div></div>;
}
