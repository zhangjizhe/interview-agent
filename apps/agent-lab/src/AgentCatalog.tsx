import { useState } from 'react';
import { Bot, Plus, Search, Workflow } from 'lucide-react';
export type CatalogAgent = { id: string; name: string; key: string; type: string; description?: string; status?: string; currentVersion?: { id: string; version: string; status: string } | null; _count?: { versions: number } };
export const agentState = (value?: string) => ({ ACTIVE: '已启用', DRAFT: '未发布', ARCHIVED: '已归档停用' }[value ?? ''] ?? '状态未记录');
export function AgentCatalog({ agents, selected, pending, error, loading, onSelect, onCreate, onRefresh }: {
  agents: CatalogAgent[]; selected: string; pending: boolean; error?: string; loading: boolean;
  onSelect: (id: string) => void; onCreate: () => void; onRefresh: () => void;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const visible = agents.filter(agent => (!status || agent.status === status) && `${agent.name} ${agent.key} ${agent.description ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="builder-catalog" aria-label="历史 Agent 目录">
    <header className="builder-heading"><div><h2>Agent 目录</h2><p>管理已有 Agent、正式版本与运行记录。Agent 按请求执行，启用状态独立于 Run 状态。</p></div><div className="builder-toolbar"><button type="button" disabled={pending || loading} onClick={onRefresh}>刷新目录</button><button className="builder-primary" type="button" disabled={pending} onClick={onCreate}><Plus size={15}/>新增 Agent / 工作流</button></div></header>
    <div className="builder-catalog-filters"><label><span><Search size={14}/>查找 Agent</span><input disabled={pending} value={search} onChange={e => setSearch(e.target.value)} placeholder="名称、key 或用途"/></label><label>生命周期<select disabled={pending} value={status} onChange={e => setStatus(e.target.value)}><option value="">全部状态</option><option value="ACTIVE">已启用</option><option value="DRAFT">未发布</option><option value="ARCHIVED">已归档停用</option></select></label><span>{visible.length} / {agents.length} 个已加载</span></div>
    {loading && <p role="status">正在读取 Agent 目录…</p>}{error && <p role="alert">目录读取失败：{error}</p>}
    {!loading && !error && <div className="builder-catalog-grid">{visible.map(agent => <button type="button" key={agent.id} className="builder-agent-card" aria-pressed={selected === agent.id} disabled={pending} onClick={() => onSelect(agent.id)}><span className="builder-card-heading">{agent.type === 'WORKFLOW' ? <Workflow size={18}/> : <Bot size={18}/>}<strong>{agent.name}</strong><span className={`builder-state state-${agent.status?.toLowerCase()}`}>{agentState(agent.status)}</span></span><code>{agent.key}</code><span className="builder-card-description">{agent.description || '尚未填写用途'}</span><span className="builder-card-foot">正式版本 {agent.currentVersion?.status === 'PUBLISHED' ? agent.currentVersion.version : '未发布'}<span>{agent._count?.versions ?? '—'} 个版本</span></span></button>)}{!visible.length && <div className="builder-catalog-empty"><Bot size={24}/><strong>{agents.length ? '没有匹配的 Agent' : '还没有 Agent'}</strong><p>{agents.length ? '调整名称或状态筛选。' : '创建 Agent 并保存初始草稿，之后再测试与评测。'}</p></div>}</div>}
  </section>;
}
