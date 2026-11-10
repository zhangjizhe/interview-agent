import { useState } from 'react';
import { RunInspector } from './RunInspector';

type Result = {
  runId?: string | null;
  run?: { id?: string | null };
  evidence?: { runIds?: string[]; samples?: Array<{ assertions?: Array<{ evidence?: { runId?: string } }> }> };
};

export function EvaluationRunLinks({ result, agentId, versionId }: { result: Result; agentId: string; versionId: string }) {
  const [selected, setSelected] = useState('');
  const ids = Array.from(new Set([result.runId, result.run?.id, ...(result.evidence?.runIds ?? []),
    ...(result.evidence?.samples?.flatMap(sample => sample.assertions?.map(item => item.evidence?.runId) ?? []) ?? [])]
    .filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))));
  if (!ids.length) return <p>未记录关联 Run；无法追踪运行详情。</p>;
  return <section aria-label="关联运行与 Trace">
    <p>关联运行 · 只读查看，不执行模型、不修改发布状态。</p>
    <ul>{ids.map(id => <li key={id}><button type="button" aria-expanded={selected === id} onClick={() => setSelected(id)}>查看 Run {id} 的运行记录与 Trace</button></li>)}</ul>
    {selected && <RunInspector key={selected} runId={selected} agentId={agentId} versionId={versionId} close={() => setSelected('')} />}
  </section>;
}
