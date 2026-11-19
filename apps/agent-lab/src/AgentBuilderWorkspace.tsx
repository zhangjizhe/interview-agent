import { RunStatusBadge } from './RunStatusBadge';
import { dateLabel } from './trace-diagnostics';
import { AgentCatalog, agentState, type CatalogAgent } from './AgentCatalog';
import { DataBindingPicker } from './DataBindingPicker';
import { RunInspector } from './RunInspector';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import './agent-builder.css';

type Version = { id: string; version: string; status: string; systemPrompt: string; modelConfig: any; runtimeConfig: any; knowledgeBindings?: { collectionIds?: string[] }; inputSchema?: any; outputSchema?: any };
type Agent = Omit<CatalogAgent, 'currentVersion'> & { versions?: Version[]; currentVersion?: Version };
type Node = { id: string; agentVersionId: string; inputFrom: 'input' | 'previous'; next?: string; branch?: { contains: string; then: string; else: string } };
const inputSchema = { type: 'object', properties: { message: { type: 'string', maxLength: 10000 } }, required: ['message'], additionalProperties: false };
const outputSchema = { type: 'object', properties: { response: { type: 'string', maxLength: 20000 } }, required: ['response'], additionalProperties: false };
export function AgentBuilderWorkspace({ onBusyChange, onDirtyChange }: { onBusyChange?: (value: boolean) => void; onDirtyChange?: (value: boolean) => void } = {}) {
  const cache = useQueryClient();
  const [agentId, setAgentId] = useState('');
  const [versionId, setVersionId] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState(''); const [key, setKey] = useState(''); const [description, setDescription] = useState('');
  const [version, setVersion] = useState('1.0.0'); const [adapter, setAdapter] = useState('single-agent-v1');
  const [prompt, setPrompt] = useState(''); const [provider, setProvider] = useState('qwen');
  const [maxTokens, setMaxTokens] = useState(512); const [temperature, setTemperature] = useState(0.3);
  const [budget, setBudget] = useState(0.05); const [duration, setDuration] = useState(120000);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [message, setMessage] = useState(''); const [runId, setRunId] = useState(''); const [confirmed, setConfirmed] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [lifecycleConfirm, setLifecycleConfirm] = useState(false);
  const [dirty, setDirty] = useState(false);
  const pending = useRef<{ signature: string; key: string }>();
  const agents = useQuery<Agent[]>({ queryKey: ['registry-agents'], queryFn: async () => { const rows = await api('/agent-lab/agents'); if (!Array.isArray(rows) || rows.some(row => typeof row?.id !== 'string' || typeof row.name !== 'string' || typeof row.key !== 'string')) throw new Error('Agent 目录格式异常，请重新读取。'); return rows; } });
  const selected = useQuery<Agent>({ queryKey: ['builder-agent', agentId], queryFn: () => api(`/agent-lab/agents/${agentId}`), enabled: !!agentId });
  const models = useQuery<any[]>({ queryKey: ['runtime-models'], queryFn: () => api('/agent-lab/runtime/models') });
  const versions = useQuery<Array<Version & { agentName: string }>>({ queryKey: ['builder-node-versions', agents.data?.map(a => a.id).join(',')], enabled: !!agents.data,
    queryFn: async () => (await Promise.all((agents.data ?? []).filter(agent => agent.status !== 'ARCHIVED').map(async agent =>
      (await api(`/agent-lab/agents/${agent.id}/versions`)).map((item: Version) => ({ ...item, agentName: agent.name }))))).flat()
      .filter(item => item.runtimeConfig?.adapter === 'single-agent-v1' && item.status !== 'ARCHIVED') });
  const run = useQuery<any>({ queryKey: ['builder-run', runId], queryFn: () => api(`/agent-lab/runs/${runId}`), enabled: !!runId,
    refetchInterval: query => ['PENDING', 'RUNNING'].includes(query.state.data?.status) ? 1500 : false });
  const history = useQuery<any[]>({ queryKey: ['builder-history', agentId, run.data?.status], queryFn: () => api(`/agent-lab/runs?agentId=${agentId}`), enabled: !!agentId });
  const busy = ['PENDING', 'RUNNING'].includes(run.data?.status);
  const savedVersion = selected.data?.versions?.find(item => item.id === versionId);
  const refresh = async () => { await Promise.all([cache.invalidateQueries({ queryKey: ['registry-agents'] }), cache.invalidateQueries({ queryKey: ['builder-agent'] }), cache.invalidateQueries({ queryKey: ['builder-node-versions'] })]); };
  const definition = () => ({ version, systemPrompt: adapter === 'single-agent-v1' ? prompt : '',
    modelConfig: adapter === 'single-agent-v1' ? { provider, maxTokens, temperature } : {},
    runtimeConfig: { adapter, maxEstimatedCostCny: budget, maxDurationMs: duration, ...(adapter === 'finite-workflow-v1' ? { nodes } : {}) }, ...(adapter === 'single-agent-v1' && collectionIds.length ? { knowledgeBindings: { collectionIds } } : {}), inputSchema, outputSchema });
  const save = useMutation({ onMutate: () => { setFeedback(''); }, mutationFn: async () => {
    const create = creating;
    const targetAgentId = agentId;
    const submitted = definition();
    const result = create
      ? await api('/agent-lab/configured-agents', { method: 'POST', body: JSON.stringify({ key, name, description, type: adapter === 'finite-workflow-v1' ? 'WORKFLOW' : 'CUSTOM', initialVersion: submitted }) })
      : await api(`/agent-lab/agents/${targetAgentId}/versions`, { method: 'POST', body: JSON.stringify(submitted) });
    const saved = create ? result?.versions?.[0] : result;
    const validId = (value: unknown) => typeof value === 'string' && !!value.trim();
    if ((create && !Array.isArray(result?.versions)) || !validId(result?.id) || !validId(saved?.id) || saved?.agentId !== (create ? result.id : targetAgentId)
      || saved?.version !== submitted.version || saved?.status !== 'DRAFT') {
      throw new Error('草稿保存未确认，请重新读取 Agent 和版本后核验，避免重复创建。');
    }
    return result;
  }, onSuccess: async result => {
    setConfirmed(false); setDirty(false); pending.current = undefined;
    setFeedback('草稿已保存。正式版本未改变；请在下方选择保存的版本核验。');
    if (creating) { setAgentId(result.id); setVersionId(result.versions[0].id); setCreating(false); } else setVersionId(result.id);
    await refresh();
  } });
  const start = useMutation({ onMutate: () => { setFeedback(''); }, mutationFn: async () => {
    const targetAgentId = agentId; const targetVersionId = versionId; const submittedMessage = message;
    const signature = JSON.stringify({ agentId: targetAgentId, versionId: targetVersionId, message: submittedMessage });
    if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
    const requestKey = pending.current.key;
    const result = await api(`/agent-lab/agents/${targetAgentId}/test-runs`, { method: 'POST', body: JSON.stringify({ input: { message: submittedMessage }, agentVersionId: targetVersionId, requestKey }) });
    if (typeof result?.id !== 'string' || !result.id.trim() || typeof result.reused !== 'boolean'
      || !['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(result.status)) {
      throw new Error('运行启动未确认，请先核验运行记录；再次提交将复用同一请求键。');
    }
    try {
      const persisted = await api(`/agent-lab/runs/${result.id}`);
      if (persisted?.id !== result.id || persisted?.agentId !== targetAgentId || persisted?.agentVersionId !== targetVersionId
        || persisted?.requestKey !== requestKey || persisted?.application !== 'lab-draft-test'
        || !persisted?.input || typeof persisted.input !== 'object' || Array.isArray(persisted.input) || persisted.input.message !== submittedMessage) throw new Error('Run binding mismatch');
    } catch {
      throw new Error('运行启动未确认，请先核验运行记录；再次提交将复用同一请求键。');
    }
    return result;
  }, onSuccess: result => { setRunId(result.id); setFeedback(result.reused ? '已读取原运行，不重复调用模型。' : '草稿测试已排队，可查询状态或取消。'); } });
  const cancel = useMutation({ onMutate: () => setFeedback(''), mutationFn: async () => {
    const targetRunId = runId;
    const result = await api(`/agent-lab/runs/${targetRunId}/cancel`, { method: 'POST' });
    const status = result?.status;
    const flag = result?.cancelRequestedAt;
    const recorded = typeof flag === 'string' && Number.isFinite(Date.parse(flag)) && new Date(flag).toISOString() === flag;
    const terminal = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(status);
    if (!targetRunId.trim() || result?.id !== targetRunId || !['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(status)
      || (!recorded && !(terminal && flag === null))) {
      throw new Error('取消结果未确认，请刷新运行状态后核验。');
    }
    return { status, recorded };
  }, onSuccess: result => {
    setFeedback(result.recorded ? '取消已请求；在途调用仍需结算，后续节点停止。' : `运行已结束（${result.status}），请核验最终状态；本次未确认取消请求。`);
    cache.invalidateQueries({ queryKey: ['builder-run'] });
  } });
  const lifecycle = useMutation({ onMutate: () => setFeedback(''), mutationFn: async () => {
    const agent = selected.data;
    if (!agent || agent.id !== agentId) throw new Error('请先读取 Agent 状态');
    const archived = agent.status === 'ARCHIVED';
    if (archived && agent.currentVersion?.status !== 'PUBLISHED') throw new Error('恢复启用需要已发布的正式版本，请先完成版本发布流程。');
    const target = archived ? 'ACTIVE' : 'ARCHIVED';
    await api(archived ? `/agent-lab/agents/${agent.id}/versions/${agent.currentVersion!.id}/activate` : `/agent-lab/agents/${agent.id}/archive`, { method: 'POST' });
    const persisted = await api(`/agent-lab/agents/${agent.id}`);
    if (persisted?.id !== agent.id || persisted.status !== target || persisted.currentVersion?.id !== agent.currentVersion?.id) throw new Error('状态更新未确认，请刷新核对后再操作。');
    return target;
  }, onSuccess: async target => { setLifecycleConfirm(false); setFeedback(target === 'ARCHIVED' ? '已归档停用，保留版本与运行记录；已开始的调用不会自动撤回。' : '已恢复启用正式版本。'); await refresh(); }, onSettled: () => { void cache.invalidateQueries({ queryKey: ['builder-agent', agentId] }); void cache.invalidateQueries({ queryKey: ['registry-agents'] }); } });
  const contextLocked = save.isPending || start.isPending || cancel.isPending || lifecycle.isPending;
  useEffect(() => { onBusyChange?.(contextLocked); return () => onBusyChange?.(false); }, [contextLocked, onBusyChange]);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => { if (!dirty && !contextLocked) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty, contextLocked]);
  function clearOperationErrors() { save.reset(); start.reset(); cancel.reset(); lifecycle.reset(); setLifecycleConfirm(false); }
  function load(item: Version) {
    clearOperationErrors();
    setRunId('');
    setFeedback('');
    pending.current = undefined; setVersionId(item.id); setAdapter(item.runtimeConfig?.adapter ?? 'single-agent-v1'); setPrompt(item.systemPrompt);
    setProvider(item.modelConfig?.provider ?? 'qwen'); setMaxTokens(item.modelConfig?.maxTokens ?? 512); setTemperature(item.modelConfig?.temperature ?? 0.3);
    setBudget(item.runtimeConfig?.maxEstimatedCostCny ?? 0.05); setDuration(item.runtimeConfig?.maxDurationMs ?? 120000); setNodes(item.runtimeConfig?.nodes ?? []);
    setCollectionIds(item.knowledgeBindings?.collectionIds ?? []);
    setVersion(item.version); setConfirmed(false); setDirty(false);
  }
  function changeNode(index: number, patch: Partial<Node>) { setNodes(nodes.map((node, i) => i === index ? { ...node, ...patch } : node)); }
  const errors = [agents.error, selected.error, models.error, versions.error, run.error, history.error, save.error, start.error, cancel.error, lifecycle.error].filter(Boolean);
  return <section className="builder-workspace">
    <AgentCatalog agents={agents.data ?? []} selected={agentId} pending={contextLocked} loading={agents.isFetching} error={agents.error instanceof Error ? agents.error.message : undefined}
      onRefresh={() => { void refresh(); }}
      onCreate={() => { if (dirty && !window.confirm('当前有未保存修改，放弃后新建？')) return; setDirty(false);  clearOperationErrors(); setFeedback(''); setConfirmed(false); pending.current = undefined; setRunId(''); setCreating(true); setAgentId(''); setVersionId(''); setName(''); setKey(''); setDescription(''); setVersion('1.0.0'); setPrompt(''); setAdapter('single-agent-v1'); setNodes([]); setCollectionIds([]); }}
      onSelect={id => { if (id === agentId) return; if (dirty && !window.confirm('当前有未保存修改，放弃后切换 Agent？')) return; clearOperationErrors(); setFeedback(''); setConfirmed(false); pending.current = undefined; setRunId(''); setAgentId(id); setCollectionIds([]); setVersionId(''); setCreating(false); setDirty(false); }} />
    {errors.map((error, index) => <p role="alert" className="agent-error" key={index}>{String((error as Error).message)}</p>)}
    {feedback && <p role="status">{feedback}</p>}
    <label>选择 Agent<select disabled={contextLocked} value={agentId} onChange={event => { if (dirty && !window.confirm('当前有未保存修改，放弃后切换 Agent？')) return; setDirty(false); clearOperationErrors(); setFeedback(''); setConfirmed(false); pending.current = undefined; setRunId(''); setAgentId(event.target.value); setCollectionIds([]); setVersionId(''); setCreating(false); }}><option value="">请选择</option>{agents.data?.map(agent => <option value={agent.id} key={agent.id}>{agent.name} · {agent.key}</option>)}</select></label>
    {!agents.isLoading && !agents.error && !agents.data?.length && <p>尚无自定义 Agent，点击新增并保存初始草稿。</p>}
    {agentId && selected.data && <section className="builder-agent-overview"><div className="builder-heading"><div><h3>{selected.data.name} <span className="builder-state">{agentState(selected.data.status)}</span></h3><p>{selected.data.description || '尚未填写用途'}</p></div><button type="button" disabled={contextLocked} onClick={() => setLifecycleConfirm(value => !value)}>{selected.data.status === 'ARCHIVED' ? '恢复启用' : '归档停用'}</button></div>{lifecycleConfirm && <div className="builder-lifecycle-confirm" role="group" aria-label="确认 Agent 状态变更"><p>{selected.data.status === 'ARCHIVED' ? '使用已发布的当前版本恢复启用，不重新发布草稿。' : '将阻止新运行及尚未开始执行的队列请求；保留历史版本与 Run。已开始的调用需另行取消。'}</p><button type="button" disabled={contextLocked || (selected.data.status === 'ARCHIVED' && selected.data.currentVersion?.status !== 'PUBLISHED')} onClick={() => lifecycle.mutate()}>{lifecycle.isPending ? '更新中…' : '确认状态变更'}</button><button type="button" disabled={contextLocked} onClick={() => setLifecycleConfirm(false)}>取消</button></div>}<p>正式版本：{selected.data.currentVersion?.status === 'PUBLISHED' ? selected.data.currentVersion.version : '未发布'}</p><label>读取版本<select disabled={contextLocked} value={versionId} onChange={event => { const item = selected.data?.versions?.find(v => v.id === event.target.value); if (item) { if (dirty && !window.confirm('放弃未保存修改并读取此版本？')) return; load(item); } }}><option value="">请选择需要读取的版本</option>{selected.data?.versions?.map(item => <option key={item.id} value={item.id}>{item.version} · {item.status} · {item.runtimeConfig?.adapter}</option>)}</select></label></section>}
    {agentId && !versionId && !creating && <p className="builder-hint">先读取一个历史版本，再修改配置或发起受控测试。</p>}
    {savedVersion && !['single-agent-v1', 'finite-workflow-v1'].includes(savedVersion.runtimeConfig?.adapter) && <section className="builder-hint"><h3>历史应用版本 · 只读</h3><p>此版本使用 {savedVersion.runtimeConfig?.adapter || '未记录'} 适配器。其编排由所属应用维护，可在下方核对历史运行；本页仅编辑已接入配置运行时的版本。</p></section>}
    {(creating || (agentId && savedVersion && ['single-agent-v1', 'finite-workflow-v1'].includes(savedVersion.runtimeConfig?.adapter))) && <form onChange={() => { setDirty(true); setConfirmed(false); }} onSubmit={event => { event.preventDefault(); if (!contextLocked) save.mutate(); }}><fieldset className="builder-save-fields" disabled={save.isPending}>
      {creating && <div className="builder-fields"><label>名称<input required maxLength={120} value={name} onChange={e => setName(e.target.value)}/></label><label>唯一 key<input required pattern="[a-z][a-z0-9-]{1,63}" value={key} onChange={e => setKey(e.target.value)}/></label><label>用途<textarea maxLength={4000} value={description} onChange={e => setDescription(e.target.value)}/></label></div>}
      <div className="builder-fields"><label>保存为版本<input aria-label="保存为版本" required pattern="[0-9]+\.[0-9]+\.[0-9]+" value={version} onChange={e => setVersion(e.target.value)}/><small>使用未占用的版本号，历史版本不会被覆盖。</small></label>
      <label>执行方式<select value={adapter} onChange={e => setAdapter(e.target.value)}><option value="single-agent-v1">单 Agent</option><option value="finite-workflow-v1">有限工作流</option></select></label>
      <label>总预算上限（估算 CNY）<input type="number" min="0.01" max="100" step="0.01" required value={budget} onChange={e => setBudget(Number(e.target.value))}/></label>
      <label>时限（ms）<input type="number" min="1000" max="600000" required value={duration} onChange={e => setDuration(Number(e.target.value))}/></label></div>
      {adapter === 'single-agent-v1' ? <><label>系统提示<textarea required maxLength={20000} rows={6} value={prompt} onChange={e => setPrompt(e.target.value)}/></label><div className="builder-fields">
        <label>模型 Provider<select value={provider} onChange={e => setProvider(e.target.value)}>{models.data?.map(item => <option key={item.provider} value={item.provider}>{item.provider} · {item.model} · {item.enabled ? '网关已启用' : '不可用'}</option>)}</select></label>
        <label>最大输出 Token<input type="number" min="1" max="4096" required value={maxTokens} onChange={e => setMaxTokens(Number(e.target.value))}/></label>
        <label>温度<input type="number" min="0" max="2" step="0.1" required value={temperature} onChange={e => setTemperature(Number(e.target.value))}/></label></div></> : <>
          <p>按节点顺序定义无环图；无后继表示结束。“previous”传入前一执行节点的回答。草稿测试可引用草稿，发布要求全部依赖已发布。</p>
          {nodes.map((node, index) => <fieldset key={index}><legend>节点 {index + 1}</legend><div className="builder-fields">
            <label>节点 ID<input required value={node.id} onChange={e => changeNode(index, { id: e.target.value })}/></label>
            <label>固定 Agent 版本<select required value={node.agentVersionId} onChange={e => changeNode(index, { agentVersionId: e.target.value })}><option value="">请选择</option>{versions.data?.map(item => <option key={item.id} value={item.id}>{item.agentName} @ {item.version} · {item.status}</option>)}</select></label>
            <label>输入映射<select value={node.inputFrom} onChange={e => changeNode(index, { inputFrom: e.target.value as Node['inputFrom'] })}><option value="input">原始输入</option><option value="previous">前一节点回答</option></select></label>
            <label>路由<select value={node.branch ? 'branch' : 'next'} onChange={e => changeNode(index, e.target.value === 'branch' ? { next: undefined, branch: { contains: '', then: '', else: '' } } : { branch: undefined, next: undefined })}><option value="next">顺序 / 结束</option><option value="branch">条件分支</option></select></label>
            {node.branch ? <><label>回答包含<input required value={node.branch.contains} onChange={e => changeNode(index, { branch: { ...node.branch!, contains: e.target.value } })}/></label>{(['then', 'else'] as const).map(arm => <label key={arm}>{arm === 'then' ? '命中节点' : '未命中节点'}<input required value={node.branch![arm]} onChange={e => changeNode(index, { branch: { ...node.branch!, [arm]: e.target.value } })}/></label>)}</> : <label>后继 ID（空为结束）<input value={node.next ?? ''} onChange={e => changeNode(index, { next: e.target.value || undefined })}/></label>}
          </div><button type="button" onClick={() => setNodes(nodes.filter((_, i) => i !== index))}>移除节点</button></fieldset>)}
          <button type="button" disabled={nodes.length >= 10} onClick={() => setNodes([...nodes, { id: `node-${nodes.length + 1}`, agentVersionId: '', inputFrom: nodes.length ? 'previous' : 'input' }])}>新增节点</button>
        </>}
      {adapter === 'single-agent-v1' && <DataBindingPicker value={collectionIds} onChange={setCollectionIds} />}
      <p>输入：message 字符串；输出：response 字符串。每节点最多一次模型请求，禁用自动 fallback，工具/记忆绑定尚未开放。</p>
      <button type="submit" disabled={contextLocked}>{save.isPending ? '保存中' : creating ? '创建并保存初始草稿' : '保存新版本草稿'}</button>
    </fieldset></form>}
    {savedVersion && ['single-agent-v1', 'finite-workflow-v1'].includes(savedVersion.runtimeConfig?.adapter) && <section><h3>受控测试 · {savedVersion.version} · {savedVersion.status}</h3>
      <p>运行使用已保存配置，与上方未保存编辑独立。估算总上限 {savedVersion.runtimeConfig.maxEstimatedCostCny} CNY；取消不能撤回在途请求，未知费用不计零。</p>
      <label>测试输入<textarea disabled={start.isPending || cancel.isPending} maxLength={10000} value={message} onChange={e => { setMessage(e.target.value); setConfirmed(false); }}/></label>
      <label className="builder-confirm"><input disabled={start.isPending || cancel.isPending} type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>确认按已保存版本启动模型调用及预算</label>
      <button disabled={!confirmed || !message.trim() || contextLocked || busy || selected.data?.status === 'ARCHIVED'} onClick={() => start.mutate()}>启动草稿测试</button>
      <button disabled={busy || contextLocked} onClick={() => { pending.current = undefined; setFeedback('已准备新运行请求；下一次启动会重新调用模型。'); }}>准备新运行</button>
    </section>}
    {run.data && <section><h3>运行 {run.data.id}</h3><p>状态：{run.data.status} · {run.data.application}</p>
      <p>运行 Agent：{run.data.agent?.name || '未记录'} · 固定版本：{run.data.agentVersion?.version || '未记录'}</p>
      <p>估算费用：{run.data.estimatedCost === null || run.data.estimatedCost === undefined ? '未知' : `${run.data.estimatedCost} CNY`} · 调用次数：{run.data.tokenUsage?.calls ?? '未知'}</p>
      <button disabled={!busy || cancel.isPending} onClick={() => cancel.mutate()}>取消运行</button>
      <RunInspector runId={run.data.id} agentId={run.data.agentId} versionId={run.data.agentVersionId} />
    </section>}
    {agentId && <section><h3>运行记录</h3>{history.isLoading && <p role="status">正在读取运行记录…</p>}{history.isSuccess && Array.isArray(history.data) && history.data.length === 0 && <p>暂无运行</p>}<div className="builder-history-list">{history.data?.map(item => <button type="button" key={item.id} aria-label={`${item.id} · ${item.status}`} disabled={contextLocked} onClick={() => setRunId(item.id)}><code>{item.id}</code><RunStatusBadge status={item.status}/><small>{dateLabel(item.createdAt)}</small></button>)}</div></section>}
  </section>;
}
