import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

type Result = {
  runId?: string | null;
  run?: { id?: string | null };
  evidence?: { runIds?: string[]; samples?: Array<{ assertions?: Array<{ evidence?: { runId?: string } }> }> };
};
type Run = { id: string; agentId: string; agentVersionId: string; status: string; estimatedCost: number | null; latencyMs: number | null; tokenUsage?: { calls?: number }; agentVersion?: { version: string } };
type TraceEvent = { id: string; seq: number; type: string; step?: string; latencyMs?: number; error?: string | null };

export function EvaluationRunLinks({ result, agentId, versionId }: { result: Result; agentId: string; versionId: string }) {
  const [selected, setSelected] = useState('');
  const ids = Array.from(new Set([result.runId, result.run?.id, ...(result.evidence?.runIds ?? []),
    ...(result.evidence?.samples?.flatMap(sample => sample.assertions?.map(item => item.evidence?.runId) ?? []) ?? [])]
    .filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))));
  if (!ids.length) return <p>未记录关联 Run；无法追踪运行详情。</p>;
  return <section aria-label="关联运行与 Trace">
    <p>关联运行 · 只读查看，不执行模型、不修改发布状态。</p>
    <ul>{ids.map(id => <li key={id}><button type="button" aria-expanded={selected === id} onClick={() => setSelected(id)}>查看 Run {id} 的运行记录与 Trace</button></li>)}</ul>
    {selected && <RunDetails key={selected} runId={selected} agentId={agentId} versionId={versionId} close={() => setSelected('')} />}
  </section>;
}

function RunDetails({ runId, agentId, versionId, close }: { runId: string; agentId: string; versionId: string; close: () => void }) {
  const run = useQuery<Run>({ queryKey: ['evaluation-run-detail', agentId, versionId, runId], retry: false,
    queryFn: async () => {
      const value: Run = await api(`/agent-lab/runs/${encodeURIComponent(runId)}`);
      if (value.id !== runId || value.agentId !== agentId || value.agentVersionId !== versionId) throw new Error('运行与当前评测版本不匹配，未展示详情。');
      return value;
    } });
  const trace = useQuery<TraceEvent[]>({ queryKey: ['evaluation-run-trace', agentId, versionId, runId], retry: false,
    enabled: Boolean(run.data) && !run.isError, queryFn: () => api(`/agent-lab/runs/${encodeURIComponent(runId)}/trace`) });
  return <section aria-label={`Run ${runId} 详情`} className="evolution-job">
    <h5>运行详情 · {runId}</h5><button type="button" onClick={close}>关闭运行详情</button>
    {run.isPending && <p role="status">正在读取受保护运行…</p>}
    {run.isError && <p role="alert">{run.error.message}</p>}
    {!run.isError && run.data && <>
      <p>状态：{run.data.status} · 版本：{run.data.agentVersion?.version ?? '未记录'}</p>
      <p>模型调用：{run.data.tokenUsage?.calls ?? '未知'} · 估算费用：{typeof run.data.estimatedCost === 'number' ? `¥${run.data.estimatedCost.toFixed(6)}` : '未知，不能按零计算'} · 耗时：{run.data.latencyMs == null ? '未记录' : `${run.data.latencyMs} ms`}</p>
      <p>仅展示运行元数据和事件摘要；不展示 Prompt、输入、输出或原始错误正文。</p>
      {trace.isPending && <p role="status">正在读取 Trace…</p>}
      {trace.isError && <p role="alert">Trace 读取失败：{trace.error.message}</p>}
      {trace.data?.length === 0 && <p>未记录 Trace 事件；不代表运行已通过评测。</p>}
      {!trace.isError && <ol>{trace.data?.map(event => <li key={event.id}>{event.seq} · {event.type}{event.step ? ` · ${event.step}` : ''}{event.error ? ' · 事件失败' : ''}</li>)}</ol>}
    </>}
  </section>;
}
