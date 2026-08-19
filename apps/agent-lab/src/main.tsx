import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, RefreshCw, ShieldAlert, ToggleLeft } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import './styles.css';

type Server = { name: string; displayName?: string; status: string; transport?: string; enabled: boolean; description?: string };
const token = () => localStorage.getItem('ia_access_token');
const role = () => localStorage.getItem('ia_user_role');
async function api(path: string, init?: RequestInit) {
  const response = await fetch(`/api${path}`, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${token()}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `HTTP ${response.status}`);
  return body;
}

function McpControlPlane() {
  const queryClient = useQueryClient();
  const servers = useQuery({ queryKey: ['agent-lab-mcp'], queryFn: () => api('/admin/mcp-servers'), refetchInterval: 30_000 });
  const toggle = useMutation({
    mutationFn: ({ toolName, enabled }: { toolName: string; enabled: boolean }) =>
      api('/admin/mcp-servers/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toolName, enabled }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-lab-mcp'] }),
  });
  const health = useMutation({ mutationFn: (name: string) => api(`/admin/mcp-servers/${name}/health`), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-lab-mcp'] }) });
  const reload = useMutation({ mutationFn: () => api('/admin/mcp-servers/reload', { method: 'POST' }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-lab-mcp'] }) });

  if (role() !== 'ADMIN') return <AdminLogin />;
  if (servers.isLoading) return <main className="loading">正在读取 MCP 控制面...</main>;
  if (servers.isError) return <main className="gate"><ShieldAlert size={24}/><h1>无法读取 MCP 服务</h1><p>{(servers.error as Error).message}</p></main>;
  const data = servers.data as { servers: Server[]; runningCount: number; count: number };
  return <main>
    <header><div><p className="eyebrow">Agent Lab / Control Plane</p><h1>MCP 服务治理</h1><p>系统级操作仅作用于受 RBAC 保护的控制 API。</p></div><button onClick={() => reload.mutate()} disabled={reload.isPending}><RefreshCw size={16}/>{reload.isPending ? '重载中' : '重载配置'}</button></header>
    {(toggle.isError || health.isError || reload.isError) && <p className="error">{(toggle.error || health.error || reload.error as Error)?.message}</p>}
    <section className="summary"><Activity size={18}/><strong>{data.runningCount} / {data.count}</strong><span>服务可用</span></section>
    <section className="list">{data.servers.map((server) => <article key={server.name}>
      <div><span className={`dot ${server.status}`}/><h2>{server.displayName || server.name}</h2><p>{server.description || `${server.transport || 'internal'} · ${server.status}`}</p></div>
      <div className="actions"><button className="icon" title="健康检查" onClick={() => health.mutate(server.name)} disabled={health.isPending}><Activity size={16}/></button><button onClick={() => toggle.mutate({ toolName: server.name, enabled: !server.enabled })} disabled={toggle.isPending}><ToggleLeft size={16}/>{server.enabled ? '系统关闭' : '系统启用'}</button></div>
    </article>)}</section>
  </main>;
}
function AdminLogin() {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || '认证失败');
      if (data.role !== 'ADMIN') throw new Error('当前账号没有 Agent Lab 管理权限');
      localStorage.setItem('ia_access_token', data.accessToken);
      localStorage.setItem('ia_user_role', data.role);
      localStorage.setItem('ia_userId', data.userId);
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '认证失败');
    } finally {
      setPending(false);
    }
  };
  return <main className="gate"><ShieldAlert size={24}/><h1>Agent Lab 管理员登录</h1><p>控制面使用独立会话，不复用候选人页面存储。</p><form onSubmit={submit}><label>用户名<input value={userId} onChange={(event) => setUserId(event.target.value)} required /></label><label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <p className="error">{error}</p>}<button disabled={pending}>{pending ? '认证中' : '登录控制台'}</button></form></main>;
}

createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><McpControlPlane/></QueryClientProvider>);
