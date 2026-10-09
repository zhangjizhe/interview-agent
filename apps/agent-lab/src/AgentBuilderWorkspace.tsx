import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import './agent-builder.css';

type Version = { id: string; version: string; status: string; systemPrompt: string; modelConfig: any; runtimeConfig: any; inputSchema?: any; outputSchema?: any };
type Agent = { id: string; name: string; key: string; description?: string; type: string; versions?: Version[]; currentVersion?: Version };
type Node = { id: string; agentVersionId: string; inputFrom: 'input' | 'previous'; next?: string; branch?: { contains: string; then: string; else: string } };
const inputSchema = { type: 'object', properties: { message: { type: 'string', maxLength: 10000 } }, required: ['message'], additionalProperties: false };
const outputSchema = { type: 'object', properties: { response: { type: 'string', maxLength: 20000 } }, required: ['response'], additionalProperties: false };
export function AgentBuilderWorkspace() {
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
  const [message, setMessage] = useState(''); const [runId, setRunId] = useState(''); const [confirmed, setConfirmed] = useState(false);
  const [feedback, setFeedback] = useState('');
  const pending = useRef<{ signature: string; key: string }>();
  const agents = useQuery<Agent[]>({ queryKey: ['registry-agents'], queryFn: () => api('/agent-lab/agents') });
  const selected = useQuery<Agent>({ queryKey: ['builder-agent', agentId], queryFn: () => api(`/agent-lab/agents/${agentId}`), enabled: !!agentId });
  const models = useQuery<any[]>({ queryKey: ['runtime-models'], queryFn: () => api('/agent-lab/runtime/models') });
  const versions = useQuery<Array<Version & { agentName: string }>>({ queryKey: ['builder-node-versions', agents.data?.map(a => a.id).join(',')], enabled: !!agents.data,
    queryFn: async () => (await Promise.all((agents.data ?? []).map(async agent =>
      (await api(`/agent-lab/agents/${agent.id}/versions`)).map((item: Version) => ({ ...item, agentName: agent.name }))))).flat()
      .filter(item => item.runtimeConfig?.adapter === 'single-agent-v1' && item.status !== 'ARCHIVED') });
  const run = useQuery<any>({ queryKey: ['builder-run', runId], queryFn: () => api(`/agent-lab/runs/${runId}`), enabled: !!runId,
    refetchInterval: query => ['PENDING', 'RUNNING'].includes(query.state.data?.status) ? 1500 : false });
  const trace = useQuery<any[]>({ queryKey: ['builder-trace', runId, run.data?.status], queryFn: () => api(`/agent-lab/runs/${runId}/trace`), enabled: !!runId });
  const history = useQuery<any[]>({ queryKey: ['builder-history', agentId, run.data?.status], queryFn: () => api(`/agent-lab/runs?agentId=${agentId}`), enabled: !!agentId });
  const busy = ['PENDING', 'RUNNING'].includes(run.data?.status);
  const savedVersion = selected.data?.versions?.find(item => item.id === versionId);
  const refresh = async () => { await Promise.all([cache.invalidateQueries({ queryKey: ['registry-agents'] }), cache.invalidateQueries({ queryKey: ['builder-agent'] }), cache.invalidateQueries({ queryKey: ['builder-node-versions'] })]); };
  const definition = () => ({ version, systemPrompt: adapter === 'single-agent-v1' ? prompt : '',
    modelConfig: adapter === 'single-agent-v1' ? { provider, maxTokens, temperature } : {},
    runtimeConfig: { adapter, maxEstimatedCostCny: budget, maxDurationMs: duration, ...(adapter === 'finite-workflow-v1' ? { nodes } : {}) }, inputSchema, outputSchema });
  const save = useMutation({ mutationFn: async () => {
    if (creating) return api('/agent-lab/configured-agents', { method: 'POST', body: JSON.stringify({ key, name, description, type: adapter === 'finite-workflow-v1' ? 'WORKFLOW' : 'CUSTOM', initialVersion: definition() }) });
    return api(`/agent-lab/agents/${agentId}/versions`, { method: 'POST', body: JSON.stringify(definition()) });
  }, onSuccess: async result => {
    setConfirmed(false); pending.current = undefined;
    setFeedback('草稿已保存。正式版本未改变；请在下方选择保存的版本核验。');
    if (creating) { setAgentId(result.id); setVersionId(result.versions[0].id); setCreating(false); } else setVersionId(result.id);
    await refresh();
  } });
  const start = useMutation({ mutationFn: async () => {
    const signature = JSON.stringify({ agentId, versionId, message });
    if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
    return api(`/agent-lab/agents/${agentId}/test-runs`, { method: 'POST', body: JSON.stringify({ input: { message }, agentVersionId: versionId, requestKey: pending.current.key }) });
  }, onSuccess: result => { setRunId(result.id); setFeedback(result.reused ? '已读取原运行，不重复调用模型。' : '草稿测试已排队，可查询状态或取消。'); } });
  const cancel = useMutation({ mutationFn: () => api(`/agent-lab/runs/${runId}/cancel`, { method: 'POST' }), onSuccess: () => { setFeedback('取消已请求；在途调用仍需结算，后续节点停止。'); cache.invalidateQueries({ queryKey: ['builder-run'] }); } });
  function load(item: Version) {
    pending.current = undefined; setVersionId(item.id); setAdapter(item.runtimeConfig?.adapter ?? 'single-agent-v1'); setPrompt(item.systemPrompt);
    setProvider(item.modelConfig?.provider ?? 'qwen'); setMaxTokens(item.modelConfig?.maxTokens ?? 512); setTemperature(item.modelConfig?.temperature ?? 0.3);
    setBudget(item.runtimeConfig?.maxEstimatedCostCny ?? 0.05); setDuration(item.runtimeConfig?.maxDurationMs ?? 120000); setNodes(item.runtimeConfig?.nodes ?? []);
    setVersion(item.version); setConfirmed(false);
  }
  function changeNode(index: number, patch: Partial<Node>) { setNodes(nodes.map((node, i) => i === index ? { ...node, ...patch } : node)); }
  const errors = [agents.error, selected.error, models.error, versions.error, run.error, trace.error, history.error, save.error, start.error, cancel.error].filter(Boolean);
  return <section className="builder-workspace">
    <div className="builder-heading"><div><h2>Agent 与工作流</h2><p>配置保存为草稿；测试不会发布。工作流引用固定版本，按真实运行记录展示。</p></div>
      <button onClick={() => { setConfirmed(false); pending.current = undefined; setRunId(''); setCreating(true); setAgentId(''); setVersionId(''); setName(''); setKey(''); setDescription(''); setVersion('1.0.0'); setPrompt(''); setAdapter('single-agent-v1'); setNodes([]); }}>新增 Agent / 工作流</button></div>
    {errors.map((error, index) => <p role="alert" className="agent-error" key={index}>{String((error as Error).message)}</p>)}
    {feedback && <p role="status">{feedback}</p>}
    <label>选择 Agent<select value={agentId} onChange={event => { setConfirmed(false); pending.current = undefined; setRunId(''); setAgentId(event.target.value); setVersionId(''); setCreating(false); }}><option value="">请选择</option>{agents.data?.map(agent => <option value={agent.id} key={agent.id}>{agent.name} · {agent.key}</option>)}</select></label>
    {!agents.isLoading && !agents.error && !agents.data?.length && <p>尚无自定义 Agent，点击新增并保存初始草稿。</p>}
    {agentId && <div><p>正式版本：{selected.data?.currentVersion?.version ?? '未发布'}</p><label>读取版本<select value={versionId} onChange={event => { const item = selected.data?.versions?.find(v => v.id === event.target.value); if (item) load(item); }}><option value="">选择版本</option>{selected.data?.versions?.map(item => <option key={item.id} value={item.id}>{item.version} · {item.status} · {item.runtimeConfig?.adapter}</option>)}</select></label></div>}
    {(creating || agentId) && <form onSubmit={event => { event.preventDefault(); save.mutate(); }}>
      {creating && <div className="builder-fields"><label>名称<input required maxLength={120} value={name} onChange={e => setName(e.target.value)}/></label><label>唯一 key<input required pattern="[a-z][a-z0-9-]{1,63}" value={key} onChange={e => setKey(e.target.value)}/></label><label>用途<textarea maxLength={4000} value={description} onChange={e => setDescription(e.target.value)}/></label></div>}
      <div className="builder-fields"><label>保存为版本<input required pattern="[0-9]+\.[0-9]+\.[0-9]+" value={version} onChange={e => setVersion(e.target.value)}/></label>
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
      <p>输入：message 字符串；输出：response 字符串。每节点最多一次模型请求，禁用自动 fallback，工具/记忆绑定尚未开放。</p>
      <button type="submit" disabled={save.isPending}>{save.isPending ? '保存中' : creating ? '创建并保存初始草稿' : '保存新版本草稿'}</button>
    </form>}
    {savedVersion && ['single-agent-v1', 'finite-workflow-v1'].includes(savedVersion.runtimeConfig?.adapter) && <section><h3>受控测试 · {savedVersion.version} · {savedVersion.status}</h3>
      <p>运行使用已保存配置，与上方未保存编辑独立。估算总上限 {savedVersion.runtimeConfig.maxEstimatedCostCny} CNY；取消不能撤回在途请求，未知费用不计零。</p>
      <label>测试输入<textarea maxLength={10000} value={message} onChange={e => { setMessage(e.target.value); setConfirmed(false); }}/></label>
      <label className="builder-confirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>确认按已保存版本启动模型调用及预算</label>
      <button disabled={!confirmed || !message.trim() || start.isPending || busy} onClick={() => start.mutate()}>启动草稿测试</button>
      <button disabled={busy || start.isPending} onClick={() => { pending.current = undefined; setFeedback('已准备新运行请求；下一次启动会重新调用模型。'); }}>准备新运行</button>
    </section>}
    {run.data && <section><h3>运行 {run.data.id}</h3><p>状态：{run.data.status} · {run.data.application}</p>
      <p>估算费用：{run.data.estimatedCost === null || run.data.estimatedCost === undefined ? '未知' : `${run.data.estimatedCost} CNY`} · 调用次数：{run.data.tokenUsage?.calls ?? '未知'}</p>
      {run.data.error && <p role="alert">{run.data.error}</p>}<button disabled={!busy || cancel.isPending} onClick={() => cancel.mutate()}>取消运行</button>
      {run.data.output?.response && <pre>{run.data.output.response}</pre>}
      <h4>节点与 Trace</h4><ol>{trace.data?.map(event => <li key={event.id}>{event.seq} · {event.type} · {event.step} {event.error && `· ${event.error}`}</li>)}</ol>
    </section>}
    {agentId && <section><h3>运行记录</h3>{history.isLoading && <p role="status">正在读取运行记录…</p>}{history.isSuccess && Array.isArray(history.data) && history.data.length === 0 && <p>暂无运行</p>}{history.data?.map(item => <button key={item.id} onClick={() => setRunId(item.id)}>{item.id} · {item.status}</button>)}</section>}
  </section>;
}
