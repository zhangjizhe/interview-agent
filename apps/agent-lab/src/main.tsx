import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Bot,
  FlaskConical,
  Gauge,
  GitBranch,
  LogOut,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
  ToggleLeft,
  Workflow,
} from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import './styles.css';

type View = 'overview' | 'runtime' | 'mcp';
type Server = {
  name: string;
  displayName?: string;
  status: string;
  transport?: string;
  enabled: boolean;
  description?: string;
};

const CONTROL_NAV: Array<{ id: View | 'trace' | 'evaluation' | 'experiments' | 'release'; label: string; icon: typeof Gauge; enabled: boolean }> = [
  { id: 'overview', label: '控制中心', icon: Gauge, enabled: true },
  { id: 'runtime', label: '运行编排', icon: Workflow, enabled: true },
  { id: 'mcp', label: 'MCP 与工具', icon: SlidersHorizontal, enabled: true },
  { id: 'trace', label: 'Trace', icon: GitBranch, enabled: false },
  { id: 'evaluation', label: '评测', icon: FlaskConical, enabled: false },
  { id: 'experiments', label: '实验', icon: Bot, enabled: false },
];

const token = () => localStorage.getItem('ia_access_token');
const role = () => localStorage.getItem('ia_user_role');

async function api(path: string, init?: RequestInit) {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token()}`,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `HTTP ${response.status}`);
  return body;
}

function ControlCenter() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>('overview');
  const [feedback, setFeedback] = useState('');
  const servers = useQuery({
    queryKey: ['agent-lab-mcp'],
    queryFn: () => api('/admin/mcp-servers'),
    refetchInterval: 30_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['agent-lab-mcp'] });
  const toggle = useMutation({
    mutationFn: ({ toolName, enabled }: { toolName: string; enabled: boolean }) =>
      api('/admin/mcp-servers/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolName, enabled }),
      }),
    onSuccess: (_result, variables) => {
      setFeedback(`${variables.toolName} 已更新。`);
      refresh();
    },
  });
  const health = useMutation({
    mutationFn: (name: string) => api(`/admin/mcp-servers/${name}/health`),
    onSuccess: (_result, name) => {
      setFeedback(`${name} 健康检查完成。`);
      refresh();
    },
  });
  const reload = useMutation({
    mutationFn: () => api('/admin/mcp-servers/reload', { method: 'POST' }),
    onSuccess: () => {
      setFeedback('MCP 配置已重新加载。');
      refresh();
    },
  });

  if (role() !== 'ADMIN') return <AdminAccess />;
  if (servers.isLoading) return <main className="agent-loading">正在连接控制面...</main>;
  if (servers.isError) {
    return <main className="agent-gate"><ShieldAlert size={26}/><h1>无法读取控制面</h1><p>{(servers.error as Error).message}</p></main>;
  }

  const data = servers.data as { servers: Server[]; runningCount: number; count: number };
  const currentMutationError = toggle.error || health.error || reload.error;
  return (
    <div className="agent-shell">
      <aside className="agent-sidebar">
        <div className="agent-brand"><Bot size={19}/><span>Agent Lab</span></div>
        <p className="agent-section-label">CONTROL PLANE</p>
        <nav aria-label="Agent Lab 导航">
          {CONTROL_NAV.map(({ id, label, icon: Icon, enabled }) => (
            <button
              key={id}
              type="button"
              className={`agent-nav-item ${view === id ? 'is-active' : ''}`}
              disabled={!enabled}
              onClick={() => enabled && setView(id as View)}
            >
              <Icon size={16}/><span>{label}</span>{!enabled && <em>未配置</em>}
            </button>
          ))}
        </nav>
        <div className="agent-sidebar-note"><span className="agent-status-dot"/>控制 API 已受 RBAC 保护</div>
        <button
          type="button"
          className="agent-signout"
          onClick={() => {
            localStorage.removeItem('ia_access_token');
            localStorage.removeItem('ia_user_role');
            localStorage.removeItem('ia_userId');
            window.location.reload();
          }}
        ><LogOut size={16}/>退出控制台</button>
      </aside>

      <main className="agent-workspace">
        <header className="agent-topbar">
          <div><p className="agent-eyebrow">AGENT OPERATIONS</p><h1>{view === 'mcp' ? 'MCP 与工具治理' : view === 'runtime' ? '运行编排' : '控制中心'}</h1></div>
          <button className="agent-command" onClick={() => reload.mutate()} disabled={reload.isPending}>
            <RefreshCw size={16} className={reload.isPending ? 'spin' : ''}/>{reload.isPending ? '重载中' : '重载配置'}
          </button>
        </header>

        {currentMutationError && <p className="agent-error">{(currentMutationError as Error).message}</p>}
        {feedback && <p className="agent-feedback">{feedback}</p>}

        {view === 'overview' && <Overview data={data} onRuntime={() => setView('runtime')} onMcp={() => setView('mcp')} />}
        {view === 'runtime' && <RuntimeCanvas />}
        {view === 'mcp' && <McpWorkspace data={data} health={health} toggle={toggle} />}
      </main>
    </div>
  );
}

function Overview({ data, onRuntime, onMcp }: { data: { runningCount: number; count: number }; onRuntime: () => void; onMcp: () => void }) {
  return <div className="agent-page-grid">
    <section className="agent-hero">
      <p className="agent-eyebrow">SYSTEM STATUS</p>
      <h2>受控运行，而不是不可见自动化。</h2>
      <p>当前控制台只展示可验证的治理状态。Trace、评测、实验和发布将在真实 API 合同建立后启用。</p>
      <div className="agent-hero-actions"><button onClick={onRuntime}><Workflow size={16}/>查看编排</button><button className="quiet" onClick={onMcp}><SlidersHorizontal size={16}/>治理 MCP</button></div>
    </section>
    <section className="agent-metric-grid">
      <article><span>MCP 服务</span><strong>{data.runningCount} / {data.count}</strong><small>当前可用</small></article>
      <article><span>运行编排</span><strong>受控</strong><small>阶段可见，内部推理不可见</small></article>
      <article><span>评测发布</span><strong>未配置</strong><small>等待 Harness 发布合同</small></article>
    </section>
    <RuntimeCanvas compact />
  </div>;
}

function RuntimeCanvas({ compact = false }: { compact?: boolean }) {
  return <section className={`runtime-canvas ${compact ? 'compact' : ''}`}>
    <div className="runtime-heading"><div><p className="agent-eyebrow">RUNTIME TOPOLOGY</p><h2>受控 Agent 编排</h2></div><span>不展示思维链</span></div>
    <div className="runtime-flow">
      {['请求边界', '规划', '执行', '复核', '受控输出'].map((label, index) => (
        <div className="runtime-step" key={label}>
          <div className={`runtime-node ${index < 3 ? 'running' : ''}`}><span>{String(index + 1).padStart(2, '0')}</span><strong>{label}</strong></div>
          {index < 4 && <i aria-hidden="true"/>}
        </div>
      ))}
    </div>
    <div className="runtime-foot"><span>工具调用受 MCP 策略约束</span><span>候选人数据默认不进入控制台</span></div>
  </section>;
}

function McpWorkspace({ data, health, toggle }: {
  data: { servers: Server[]; runningCount: number; count: number };
  health: { isPending: boolean; variables?: string; mutate: (name: string) => void };
  toggle: { isPending: boolean; variables?: { toolName: string; enabled: boolean }; mutate: (input: { toolName: string; enabled: boolean }) => void };
}) {
  return <section className="mcp-workspace">
    <div className="mcp-summary"><Activity size={17}/><strong>{data.runningCount} / {data.count}</strong><span>服务可用</span></div>
    <div className="mcp-list">
      {data.servers.map((server) => {
        const healthBusy = health.isPending && health.variables === server.name;
        const toggleBusy = toggle.isPending && toggle.variables?.toolName === server.name;
        return <article className="mcp-row" key={server.name}>
          <div className="mcp-identity"><span className={`agent-status-dot ${server.status}`}/><div><h2>{server.displayName || server.name}</h2><p>{server.description || `${server.transport || 'internal'} · ${server.status}`}</p></div></div>
          <div className="mcp-actions"><button className="icon-command" title="健康检查" onClick={() => health.mutate(server.name)} disabled={healthBusy}><Activity size={16} className={healthBusy ? 'spin' : ''}/></button><button onClick={() => toggle.mutate({ toolName: server.name, enabled: !server.enabled })} disabled={toggleBusy}><ToggleLeft size={16}/>{toggleBusy ? '处理中' : server.enabled ? '系统关闭' : '系统启用'}</button></div>
        </article>;
      })}
    </div>
  </section>;
}

function AdminAccess() {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [registering, setRegistering] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const response = await fetch(`/api/auth/${registering ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || '认证失败');
      if (data.role !== 'ADMIN') throw new Error('当前账号不在 Agent Lab 管理员允许名单中');
      if (registering) {
        setRegistering(false);
        setError('管理员账号已创建，请使用相同凭据登录。');
        return;
      }
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
  return <main className="agent-access"><section><div className="agent-access-mark"><Bot size={22}/></div><p className="agent-eyebrow">AGENT LAB / CONTROL PLANE</p><h1>{registering ? '创建管理员账号' : '进入控制台'}</h1><p>管理员账号由部署允许名单授予。控制面会话独立于候选人产品。</p><form onSubmit={submit}><label>用户名<input value={userId} onChange={(event) => setUserId(event.target.value)} required /></label><label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} required /></label>{error && <p className="agent-error">{error}</p>}<button disabled={pending}>{pending ? '处理中' : registering ? '创建并验证权限' : '登录控制台'}</button><button type="button" className="text-command" onClick={() => { setRegistering((value) => !value); setError(''); }}>{registering ? '已有账号，返回登录' : '创建管理员账号'}</button></form></section><aside><p>CONTROLLED OPERATIONS</p><strong>运行、MCP、评测与发布。</strong><span>未配置的控制面能力不会显示虚构运行数据。</span></aside></main>;
}

createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><ControlCenter/></QueryClientProvider>);
