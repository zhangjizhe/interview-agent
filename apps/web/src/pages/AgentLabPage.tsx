import { useMemo, useState } from 'react';
import { Link, NavLink, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowUpRight,
  Bot,
  Boxes,
  Check,
  ChevronRight,
  AlertCircle,
  Copy,
  Database,
  FileJson2,
  FlaskConical,
  LayoutDashboard,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  TerminalSquare,
  Workflow,
  X,
} from 'lucide-react';
import { agentLabRequest, downloadAgentLabTrace, formatDate, formatDuration, outputPreview } from '../agent-lab/api';
import type {
  AgentVersion,
  EvaluationDataset,
  EvaluationDatasetDetail,
  EvaluationRun,
  Evaluator,
  LabAgent,
  LabApplication,
  LabRun,
  TraceEvent,
} from '../agent-lab/types';

type LabView = 'overview' | 'applications' | 'agents' | 'runs' | 'evaluations';

const navigation: Array<{ view: LabView; label: string; icon: typeof LayoutDashboard }> = [
  { view: 'overview', label: '概览', icon: LayoutDashboard },
  { view: 'applications', label: '应用', icon: Boxes },
  { view: 'agents', label: 'Agent', icon: Bot },
  { view: 'runs', label: '运行记录', icon: Activity },
  { view: 'evaluations', label: '评测', icon: FlaskConical },
];

function badgeClass(status?: string) {
  switch (status) {
    case 'COMPLETED':
    case 'ACTIVE':
    case 'PUBLISHED':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'RUNNING':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'FAILED':
    case 'ARCHIVED':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'DRAFT':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

function StatusBadge({ status }: { status?: string }) {
  return <span className={`inline-flex border px-2 py-0.5 text-xs font-medium ${badgeClass(status)}`}>{status || '未知'}</span>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="border border-dashed border-slate-300 bg-white px-5 py-12 text-center">
      <p className="text-sm font-medium text-slate-800">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{detail}</p>
    </div>
  );
}

function RequestError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="flex items-start gap-2 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{error instanceof Error ? error.message : '请求失败，请稍后重试。'}</span>
    </div>
  );
}

function SectionHeader({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold text-slate-950">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{detail}</p>
      </div>
      {action}
    </header>
  );
}

function Metric({
  label,
  value,
  accent = 'text-slate-950',
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-2 font-mono text-2xl font-semibold ${accent}`}>{value}</div>
    </div>
  );
}

function LabShell({ view, children }: { view: LabView; children: React.ReactNode }) {
  const sessionUser = localStorage.getItem('ia_userId') || '当前用户';
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:px-6">
          <Link to="/lab" className="flex items-center gap-2 font-semibold text-slate-950">
            <span className="grid h-7 w-7 place-items-center bg-cyan-600 text-white"><Workflow className="h-4 w-4" /></span>
            AgentLab
          </Link>
          <Link to="/" className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-950">
            进入 Interview <ArrowUpRight className="h-4 w-4" />
          </Link>
          <div className="hidden items-center gap-3 border-l border-slate-200 pl-4 text-xs text-slate-500 sm:flex">
            <span className="max-w-32 truncate font-mono">{sessionUser}</span>
            <button
              onClick={() => {
                localStorage.removeItem('ia_access_token');
                localStorage.removeItem('ia_userId');
                localStorage.removeItem('ia_user_role');
                window.location.href = '/';
              }}
              className="text-slate-500 hover:text-rose-700"
            >
              退出
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl md:grid-cols-[184px_minmax(0,1fr)]">
        <aside className="border-b border-slate-200 bg-white md:min-h-[calc(100vh-56px)] md:border-b-0 md:border-r">
          <nav className="flex overflow-x-auto px-3 py-2 md:flex-col md:gap-1 md:px-3 md:py-5" aria-label="AgentLab 导航">
            {navigation.map(({ view: itemView, label, icon: Icon }) => (
              <NavLink
                key={itemView}
                to={itemView === 'overview' ? '/lab' : `/lab/${itemView}`}
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-2 px-3 py-2 text-sm transition ${
                    isActive || view === itemView
                      ? 'bg-cyan-50 font-medium text-cyan-800'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}

function useLabData() {
  const applications = useQuery({
    queryKey: ['agent-lab', 'applications'],
    queryFn: () => agentLabRequest<LabApplication[]>('/applications'),
  });
  const agents = useQuery({
    queryKey: ['agent-lab', 'agents'],
    queryFn: () => agentLabRequest<LabAgent[]>('/agents'),
  });
  const runs = useQuery({
    queryKey: ['agent-lab', 'runs'],
    queryFn: () => agentLabRequest<LabRun[]>('/runs'),
  });
  const datasets = useQuery({
    queryKey: ['agent-lab', 'datasets'],
    queryFn: () => agentLabRequest<EvaluationDataset[]>('/datasets'),
  });
  const evaluators = useQuery({
    queryKey: ['agent-lab', 'evaluators'],
    queryFn: () => agentLabRequest<Evaluator[]>('/evaluators'),
  });
  return { applications, agents, runs, datasets, evaluators };
}

function Overview() {
  const client = useQueryClient();
  const data = useLabData();
  const bootstrap = useMutation({
    mutationFn: () => agentLabRequest<LabApplication>('/applications/bootstrap/interview', { method: 'POST' }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['agent-lab', 'applications'] });
      client.invalidateQueries({ queryKey: ['agent-lab', 'agents'] });
    },
  });
  const isLoading = data.applications.isLoading || data.agents.isLoading || data.runs.isLoading;
  const failedRuns = (data.runs.data || []).filter((run) => run.status === 'FAILED').length;
  const completedRuns = (data.runs.data || []).filter((run) => run.status === 'COMPLETED').length;

  return (
    <LabShell view="overview">
      <SectionHeader
        title="工作区概览"
        detail="版本化 Agent、应用运行、评测证据都从同一条运行记录中回溯。"
        action={
          <button
            onClick={() => bootstrap.mutate()}
            disabled={bootstrap.isPending}
            className="inline-flex items-center justify-center gap-2 bg-cyan-700 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-800 disabled:bg-cyan-300"
          >
            {bootstrap.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            接入 Interview
          </button>
        }
      />
      <RequestError error={bootstrap.error} />
      {isLoading ? (
        <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-cyan-700" /></div>
      ) : (
        <div className="mt-6 space-y-8">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Application" value={data.applications.data?.length || 0} accent="text-cyan-700" />
            <Metric label="已注册 Agent" value={data.agents.data?.length || 0} accent="text-violet-700" />
            <Metric label="已完成运行" value={completedRuns} accent="text-emerald-700" />
            <Metric label="失败运行" value={failedRuns} accent="text-rose-700" />
          </div>
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">最近运行</h2>
                <Link to="/lab/runs" className="inline-flex items-center gap-1 text-sm text-cyan-700 hover:text-cyan-900">
                  全部记录 <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
              {(data.runs.data || []).length === 0 ? (
                <EmptyState title="尚无运行记录" detail="Interview 完成一轮消息后，会自动写入 AgentLab。" />
              ) : (
                <div className="overflow-x-auto border border-slate-200 bg-white">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                      <tr><th className="px-4 py-3 font-medium">时间</th><th className="px-4 py-3 font-medium">Agent</th><th className="px-4 py-3 font-medium">来源</th><th className="px-4 py-3 font-medium">状态</th><th className="px-4 py-3 font-medium">耗时</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.runs.data?.slice(0, 6).map((run) => (
                        <tr key={run.id} className="text-slate-700">
                          <td className="px-4 py-3 text-slate-500">{formatDate(run.createdAt)}</td>
                          <td className="px-4 py-3">{run.agent.name}</td>
                          <td className="px-4 py-3">{run.application || '直接运行'}</td>
                          <td className="px-4 py-3"><StatusBadge status={run.status} /></td>
                          <td className="px-4 py-3 font-mono text-xs">{formatDuration(run.latencyMs)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="border-t border-slate-200 pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
              <h2 className="text-sm font-semibold text-slate-800">当前契约</h2>
              <dl className="mt-4 space-y-4 text-sm">
                <div><dt className="text-slate-500">运行证据</dt><dd className="mt-1 text-slate-800">追加式 TraceEvent，按序回放。</dd></div>
                <div><dt className="text-slate-500">离线评测</dt><dd className="mt-1 text-slate-800">关键词、JSON Schema、延迟三类确定性规则。</dd></div>
                <div><dt className="text-slate-500">Interview</dt><dd className="mt-1 text-slate-800">保留 SSE 主链路，通过 Application 旁路纳入运行记录。</dd></div>
              </dl>
            </section>
          </div>
        </div>
      )}
    </LabShell>
  );
}

function Applications() {
  const client = useQueryClient();
  const { applications, agents } = useLabData();
  const bootstrap = useMutation({
    mutationFn: () => agentLabRequest<LabApplication>('/applications/bootstrap/interview', { method: 'POST' }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['agent-lab', 'applications'] });
      client.invalidateQueries({ queryKey: ['agent-lab', 'agents'] });
    },
  });
  return (
    <LabShell view="applications">
      <SectionHeader
        title="应用"
        detail="Application 将面向用户的业务流程绑定到一个可版本化 Agent。"
        action={<button onClick={() => bootstrap.mutate()} disabled={bootstrap.isPending} className="inline-flex items-center gap-2 bg-cyan-700 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-800 disabled:bg-cyan-300"><Plus className="h-4 w-4" />引导 Interview</button>}
      />
      <div className="mt-6">
        <RequestError error={applications.error || bootstrap.error} />
        {applications.isLoading ? <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-cyan-700" /></div> : (applications.data || []).length === 0 ? <EmptyState title="尚未创建 Application" detail="引导 Interview 后，既有面试轮次将被纳入 Lab Run。" /> : (
          <div className="divide-y divide-slate-200 border border-slate-200 bg-white">
            {applications.data?.map((application) => (
              <div key={application.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center bg-cyan-50 text-cyan-700"><Boxes className="h-4 w-4" /></span><h2 className="font-medium text-slate-900">{application.name}</h2><StatusBadge status={application.status} /></div>
                  <p className="mt-2 text-sm text-slate-500"><span className="font-mono">{application.key}</span> · {application.agent.name} · {application.agent.currentVersion?.version || '未激活版本'}</p>
                </div>
                <div className="flex items-center gap-5 text-sm"><span className="text-slate-500">运行 <span className="font-mono text-slate-900">{application._count?.runs || 0}</span></span><Link to={`/lab/agents?agent=${application.agentId}`} className="inline-flex items-center gap-1 text-cyan-700 hover:text-cyan-900">查看 Agent <ChevronRight className="h-4 w-4" /></Link></div>
              </div>
            ))}
          </div>
        )}
        {!agents.isLoading && (agents.data || []).length === 0 && <p className="mt-3 text-sm text-amber-700">当前工作区尚无可绑定 Agent。</p>}
      </div>
    </LabShell>
  );
}

function Agents() {
  const client = useQueryClient();
  const [searchParams] = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);
  const [showVersion, setShowVersion] = useState(false);
  const [runMessage, setRunMessage] = useState('');
  const [runOutput, setRunOutput] = useState('');
  const [form, setForm] = useState({ key: '', name: '', type: 'custom', description: '' });
  const [versionForm, setVersionForm] = useState({
    version: '',
    systemPrompt: '',
    runtimeConfig: '{"adapter":"interview-multi-agent"}',
    modelConfig: '{}',
    changelog: '',
  });
  const { agents } = useLabData();
  const selectedAgentId = searchParams.get('agent');
  const selectedAgent = useMemo(
    () => (agents.data || []).find((agent) => agent.id === selectedAgentId) || null,
    [agents.data, selectedAgentId],
  );
  const selectedAgentDetail = useQuery({
    queryKey: ['agent-lab', 'agent', selectedAgentId],
    queryFn: () => agentLabRequest<LabAgent>(`/agents/${selectedAgentId}`),
    enabled: Boolean(selectedAgentId),
  });
  const versions = selectedAgentDetail.data?.versions || [];
  const create = useMutation({
    mutationFn: () => agentLabRequest<LabAgent>('/agents', { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: () => {
      setShowCreate(false);
      setForm({ key: '', name: '', type: 'custom', description: '' });
      client.invalidateQueries({ queryKey: ['agent-lab', 'agents'] });
    },
  });
  const clone = useMutation({
    mutationFn: (agent: LabAgent) => {
      const suffix = Date.now().toString().slice(-5);
      return agentLabRequest<LabAgent>(`/agents/${agent.id}/clone`, { method: 'POST', body: JSON.stringify({ key: `${agent.key}-copy-${suffix}`, name: `${agent.name} 副本` }) });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['agent-lab', 'agents'] }),
  });
  const createVersion = useMutation({
    mutationFn: () => agentLabRequest<AgentVersion>(`/agents/${selectedAgentId}/versions`, {
      method: 'POST',
      body: JSON.stringify({
        version: versionForm.version,
        systemPrompt: versionForm.systemPrompt,
        runtimeConfig: JSON.parse(versionForm.runtimeConfig),
        modelConfig: JSON.parse(versionForm.modelConfig),
        changelog: versionForm.changelog,
      }),
    }),
    onSuccess: () => {
      setShowVersion(false);
      setVersionForm({ version: '', systemPrompt: '', runtimeConfig: '{"adapter":"interview-multi-agent"}', modelConfig: '{}', changelog: '' });
      client.invalidateQueries({ queryKey: ['agent-lab', 'agent', selectedAgentId] });
      client.invalidateQueries({ queryKey: ['agent-lab', 'agents'] });
    },
  });
  const publishVersion = useMutation({
    mutationFn: (versionId: string) => agentLabRequest<AgentVersion>(`/agents/${selectedAgentId}/versions/${versionId}/publish`, { method: 'POST' }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['agent-lab', 'agent', selectedAgentId] });
      client.invalidateQueries({ queryKey: ['agent-lab', 'agents'] });
    },
  });
  const activateVersion = useMutation({
    mutationFn: (versionId: string) => agentLabRequest<AgentVersion>(`/agents/${selectedAgentId}/versions/${versionId}/activate`, { method: 'POST' }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['agent-lab', 'agent', selectedAgentId] });
      client.invalidateQueries({ queryKey: ['agent-lab', 'agents'] });
    },
  });
  const runAgent = useMutation({
    mutationFn: () => agentLabRequest<LabRun>(`/agents/${selectedAgentId}/run`, {
      method: 'POST',
      body: JSON.stringify({
        input: {
          message: runMessage,
          position: '后端工程师',
          level: 'P6',
        },
        application: 'agent-lab-playground',
      }),
    }),
    onSuccess: (run) => setRunOutput(run.output ? outputPreview(run.output) : run.error || '运行完成，但没有输出。'),
  });

  return (
    <LabShell view="agents">
      <SectionHeader title="Agent 注册表" detail="每个 Agent 通过发布版本、运行记录和评测结果形成可追溯交付。" action={<button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 bg-cyan-700 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-800"><Plus className="h-4 w-4" />新建 Agent</button>} />
      <div className="mt-6 space-y-4">
        <RequestError error={agents.error || create.error || clone.error || selectedAgentDetail.error || createVersion.error || publishVersion.error || activateVersion.error || runAgent.error} />
        {showCreate && (
          <form onSubmit={(event) => { event.preventDefault(); create.mutate(); }} className="grid gap-3 border border-cyan-200 bg-cyan-50 p-4 md:grid-cols-2">
            <label className="text-sm text-slate-700">标识<input required value={form.key} onChange={(event) => setForm({ ...form, key: event.target.value })} placeholder="example-agent" pattern="[a-z][a-z0-9-]{1,63}" className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 outline-none focus:border-cyan-600" /></label>
            <label className="text-sm text-slate-700">名称<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="示例 Agent" className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 outline-none focus:border-cyan-600" /></label>
            <label className="text-sm text-slate-700">类型<input required value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 outline-none focus:border-cyan-600" /></label>
            <label className="text-sm text-slate-700">说明<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 outline-none focus:border-cyan-600" /></label>
            <div className="flex gap-2 md:col-span-2"><button disabled={create.isPending} className="inline-flex items-center gap-2 bg-cyan-700 px-3 py-2 text-sm font-medium text-white disabled:bg-cyan-300"><Check className="h-4 w-4" />创建</button><button type="button" onClick={() => setShowCreate(false)} className="inline-flex items-center gap-2 border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"><X className="h-4 w-4" />取消</button></div>
          </form>
        )}
        {agents.isLoading ? <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-cyan-700" /></div> : (agents.data || []).length === 0 ? <EmptyState title="尚未注册 Agent" detail="先引导 Interview，或创建新的 Agent 定义。" /> : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="grid gap-3 lg:grid-cols-2">
            {agents.data?.map((agent) => (
              <article key={agent.id} className={`border bg-white p-4 ${agent.id === selectedAgentId ? 'border-cyan-500 ring-1 ring-cyan-500' : 'border-slate-200'}`}>
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><Bot className="h-4 w-4 shrink-0 text-violet-700" /><h2 className="truncate font-medium text-slate-900">{agent.name}</h2></div><p className="mt-1 font-mono text-xs text-slate-500">{agent.key}</p></div><StatusBadge status={agent.currentVersion?.status || agent.status} /></div>
                <p className="mt-4 min-h-10 text-sm text-slate-600">{agent.description || '未填写说明'}</p>
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-sm"><span className="text-slate-500">版本 <span className="font-mono text-slate-900">{agent.currentVersion?.version || '-'}</span> · {agent._count?.versions || 0} 个</span><div className="flex items-center gap-3"><Link to={`/lab/agents?agent=${agent.id}`} className="text-cyan-700 hover:text-cyan-900">管理</Link><button onClick={() => clone.mutate(agent)} disabled={clone.isPending} title="克隆 Agent" className="inline-flex items-center gap-1.5 text-cyan-700 hover:text-cyan-900 disabled:text-cyan-300"><Copy className="h-4 w-4" />克隆</button></div></div>
              </article>
            ))}
            </div>
            {!selectedAgent ? (
              <div className="grid min-h-72 place-items-center border border-dashed border-slate-300 bg-white px-6 text-center text-sm text-slate-500">
                选择一个 Agent，管理版本并在沙盒中试跑。
              </div>
            ) : (
              <aside className="border border-slate-200 bg-white">
                <div className="border-b border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold text-slate-900">{selectedAgent.name}</h2>
                      <p className="mt-1 font-mono text-xs text-slate-500">{selectedAgent.key}</p>
                    </div>
                    <button onClick={() => setShowVersion((value) => !value)} className="inline-flex items-center gap-1.5 bg-cyan-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-cyan-800"><Plus className="h-3.5 w-3.5" />新版本</button>
                  </div>
                </div>
                {showVersion && (
                  <form onSubmit={(event) => { event.preventDefault(); createVersion.mutate(); }} className="space-y-3 border-b border-cyan-100 bg-cyan-50 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs text-slate-700">版本号<input required pattern="\d+\.\d+\.\d+.*" value={versionForm.version} onChange={(event) => setVersionForm({ ...versionForm, version: event.target.value })} placeholder="1.1.0" className="mt-1 w-full border border-slate-300 bg-white px-2.5 py-2 text-sm" /></label>
                      <label className="text-xs text-slate-700">变更说明<input value={versionForm.changelog} onChange={(event) => setVersionForm({ ...versionForm, changelog: event.target.value })} placeholder="新增追问策略" className="mt-1 w-full border border-slate-300 bg-white px-2.5 py-2 text-sm" /></label>
                    </div>
                    <label className="block text-xs text-slate-700">系统提示词<textarea required rows={4} value={versionForm.systemPrompt} onChange={(event) => setVersionForm({ ...versionForm, systemPrompt: event.target.value })} placeholder="定义 Agent 的行为边界、输出格式和判断标准" className="mt-1 w-full border border-slate-300 bg-white px-2.5 py-2 text-sm" /></label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs text-slate-700">运行时 JSON<textarea rows={2} value={versionForm.runtimeConfig} onChange={(event) => setVersionForm({ ...versionForm, runtimeConfig: event.target.value })} className="mt-1 w-full border border-slate-300 bg-white px-2.5 py-2 font-mono text-xs" /></label>
                      <label className="text-xs text-slate-700">模型 JSON<textarea rows={2} value={versionForm.modelConfig} onChange={(event) => setVersionForm({ ...versionForm, modelConfig: event.target.value })} className="mt-1 w-full border border-slate-300 bg-white px-2.5 py-2 font-mono text-xs" /></label>
                    </div>
                    <button disabled={createVersion.isPending} className="inline-flex items-center gap-1.5 bg-cyan-700 px-3 py-2 text-xs font-medium text-white disabled:bg-cyan-300"><Check className="h-3.5 w-3.5" />保存草稿</button>
                  </form>
                )}
                <div className="border-b border-slate-200 p-4">
                  <div className="flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">版本发布</h3><span className="font-mono text-xs text-slate-400">{versions.length} versions</span></div>
                  {selectedAgentDetail.isLoading ? <div className="py-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-cyan-700" /></div> : versions.length === 0 ? <p className="py-5 text-sm text-slate-500">还没有版本，先创建一个草稿。</p> : <div className="mt-3 space-y-2">{versions.map((version) => <div key={version.id} className="border border-slate-200 p-3"><div className="flex items-center justify-between gap-2"><div><span className="font-mono text-sm text-slate-900">v{version.version}</span><span className="ml-2"><StatusBadge status={version.status} /></span></div>{selectedAgent.currentVersion?.id === version.id && <span className="text-xs font-medium text-cyan-700">当前</span>}</div><p className="mt-1 truncate text-xs text-slate-500">{version.changelog || '暂无变更说明'}</p><div className="mt-2 flex gap-3 text-xs">{version.status === 'DRAFT' && <button onClick={() => publishVersion.mutate(version.id)} disabled={publishVersion.isPending} className="text-cyan-700 hover:text-cyan-900">发布</button>}{version.status === 'PUBLISHED' && selectedAgent.currentVersion?.id !== version.id && <button onClick={() => activateVersion.mutate(version.id)} disabled={activateVersion.isPending} className="text-cyan-700 hover:text-cyan-900">设为当前</button>}</div></div>)}</div>}
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">试跑 Agent</h3><Play className="h-4 w-4 text-violet-600" /></div>
                  <textarea value={runMessage} onChange={(event) => setRunMessage(event.target.value)} rows={3} placeholder="输入一条面试回答，验证当前版本的行为..." className="mt-3 w-full border border-slate-300 px-3 py-2 text-sm" />
                  <button onClick={() => runAgent.mutate()} disabled={!runMessage.trim() || !selectedAgent.currentVersion || runAgent.isPending} className="mt-2 inline-flex w-full items-center justify-center gap-2 bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:bg-slate-300">{runAgent.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}运行当前版本</button>
                  {runOutput && <div className="mt-3 border border-emerald-200 bg-emerald-50 p-3 text-sm text-slate-700"><div className="mb-1 text-xs font-semibold text-emerald-800">最近输出</div><pre className="max-h-48 overflow-auto whitespace-pre-wrap font-sans">{runOutput}</pre></div>}
                </div>
              </aside>
            )}
          </div>
        )}
      </div>
    </LabShell>
  );
}

function Runs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { runs } = useLabData();
  const selectedRunId = searchParams.get('run');
  const selectedRun = (runs.data || []).find((run) => run.id === selectedRunId) || null;
  const trace = useQuery({
    queryKey: ['agent-lab', 'runs', selectedRunId, 'trace'],
    queryFn: () => agentLabRequest<TraceEvent[]>(`/runs/${selectedRunId}/trace`),
    enabled: Boolean(selectedRunId),
  });
  const exportTrace = useMutation({
    mutationFn: (runId: string) => downloadAgentLabTrace(runId),
  });
  const refresh = () => runs.refetch();

  return (
    <LabShell view="runs">
      <SectionHeader title="运行记录" detail="每个运行包含输入、输出、状态与按序追加的 TraceEvent 证据。" action={<button onClick={refresh} disabled={runs.isFetching} title="刷新运行记录" className="inline-flex items-center gap-2 border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><RefreshCw className={`h-4 w-4 ${runs.isFetching ? 'animate-spin' : ''}`} />刷新</button>} />
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section>
          <RequestError error={runs.error} />
          {runs.isLoading ? <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-cyan-700" /></div> : (runs.data || []).length === 0 ? <EmptyState title="暂无可查看的运行" detail="运行 Interview 或直接执行已发布 Agent 后，记录会显示在这里。" /> : (
            <div className="overflow-x-auto border border-slate-200 bg-white">
              <table className="w-full min-w-[740px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3 font-medium">时间</th><th className="px-4 py-3 font-medium">Agent / 版本</th><th className="px-4 py-3 font-medium">来源</th><th className="px-4 py-3 font-medium">状态</th><th className="px-4 py-3 font-medium">耗时</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {runs.data?.map((run) => <tr key={run.id} onClick={() => setSearchParams({ run: run.id })} className={`cursor-pointer text-slate-700 hover:bg-cyan-50 ${selectedRunId === run.id ? 'bg-cyan-50' : ''}`}><td className="px-4 py-3 text-slate-500">{formatDate(run.createdAt)}</td><td className="px-4 py-3"><div>{run.agent.name}</div><div className="font-mono text-xs text-slate-500">v{run.agentVersion.version}</div></td><td className="px-4 py-3">{run.application || '直接运行'}</td><td className="px-4 py-3"><StatusBadge status={run.status} /></td><td className="px-4 py-3 font-mono text-xs">{formatDuration(run.latencyMs)}</td></tr>)}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <aside className="border border-slate-200 bg-white">
          {!selectedRun ? <div className="grid min-h-64 place-items-center px-5 text-center text-sm text-slate-500">选择一条运行记录以查看原始 Trace。</div> : (
            <div>
              <div className="border-b border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><h2 className="font-medium text-slate-900">{selectedRun.agent.name}</h2><StatusBadge status={selectedRun.status} /></div><p className="mt-1 font-mono text-xs text-slate-500">v{selectedRun.agentVersion.version}</p><div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><span className="block text-slate-500">耗时</span><span className="mt-1 block font-mono text-slate-800">{formatDuration(selectedRun.latencyMs)}</span></div><div><span className="block text-slate-500">外部会话</span><span className="mt-1 block truncate font-mono text-slate-800">{selectedRun.externalRunId || '-'}</span></div></div></div>
              <div className="border-b border-slate-200 p-4"><h3 className="text-xs font-medium text-slate-500">输出摘要</h3><p className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-sm text-slate-700">{selectedRun.error || outputPreview(selectedRun.output)}</p></div>
              <div className="p-4"><div className="flex items-center justify-between"><h3 className="text-xs font-medium text-slate-500">事件序列</h3><button onClick={() => exportTrace.mutate(selectedRun.id)} disabled={exportTrace.isPending} className="inline-flex items-center gap-1 text-xs text-cyan-700 hover:text-cyan-900 disabled:text-cyan-300"><FileJson2 className="h-3.5 w-3.5" />JSONL</button></div><RequestError error={trace.error || exportTrace.error} />{trace.isLoading ? <div className="grid place-items-center py-8"><Loader2 className="h-5 w-5 animate-spin text-cyan-700" /></div> : <ol className="mt-3 space-y-3 border-l border-slate-200 pl-4">{(trace.data || []).map((event) => <li key={event.id} className="relative"><span className="absolute -left-[21px] top-1.5 h-2 w-2 bg-cyan-600" /><div className="flex items-baseline justify-between gap-3"><span className="font-mono text-xs text-slate-500">#{event.seq}</span><span className="text-xs text-slate-400">{formatDate(event.createdAt)}</span></div><p className="mt-0.5 text-sm font-medium text-slate-800">{event.type}</p>{event.error && <p className="mt-1 text-xs text-rose-700">{event.error}</p>}</li>)}</ol>}</div>
            </div>
          )}
        </aside>
      </div>
    </LabShell>
  );
}

function Evaluations() {
  const client = useQueryClient();
  const data = useLabData();
  const [datasetForm, setDatasetForm] = useState({ key: '', name: '', description: '', version: '1.0.0' });
  const [evaluatorForm, setEvaluatorForm] = useState({ key: '', name: '', type: 'KEYWORD' as Evaluator['type'], config: '{"keywords":[]}' });
  const [caseForm, setCaseForm] = useState({ key: '', message: '', position: '后端工程师', level: 'P6', expectedOutput: '{}' });
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [selectedEvaluatorId, setSelectedEvaluatorId] = useState('');
  const createDataset = useMutation({
    mutationFn: () => agentLabRequest<EvaluationDataset>('/datasets', { method: 'POST', body: JSON.stringify(datasetForm) }),
    onSuccess: (dataset) => {
      setDatasetForm({ key: '', name: '', description: '', version: '1.0.0' });
      setSelectedDatasetId(dataset.id);
      client.invalidateQueries({ queryKey: ['agent-lab', 'datasets'] });
    },
  });
  const createEvaluator = useMutation({
    mutationFn: () => agentLabRequest<Evaluator>('/evaluators', { method: 'POST', body: JSON.stringify({ ...evaluatorForm, config: JSON.parse(evaluatorForm.config) }) }),
    onSuccess: () => { client.invalidateQueries({ queryKey: ['agent-lab', 'evaluators'] }); },
  });
  const evaluations = useQuery({
    queryKey: ['agent-lab', 'agents', selectedAgentId, 'evaluations'],
    queryFn: () => agentLabRequest<EvaluationRun[]>(`/agents/${selectedAgentId}/evaluations`),
    enabled: Boolean(selectedAgentId),
  });
  const selectedDataset = useQuery({
    queryKey: ['agent-lab', 'datasets', selectedDatasetId],
    queryFn: () => agentLabRequest<EvaluationDatasetDetail>(`/datasets/${selectedDatasetId}`),
    enabled: Boolean(selectedDatasetId),
  });
  const addCase = useMutation({
    mutationFn: () =>
      agentLabRequest(`/datasets/${selectedDatasetId}/cases`, {
        method: 'POST',
        body: JSON.stringify({
          key: caseForm.key,
          input: {
            message: caseForm.message,
            position: caseForm.position,
            level: caseForm.level,
          },
          expectedOutput: JSON.parse(caseForm.expectedOutput),
        }),
      }),
    onSuccess: () => {
      setCaseForm({ key: '', message: '', position: '后端工程师', level: 'P6', expectedOutput: '{}' });
      client.invalidateQueries({ queryKey: ['agent-lab', 'datasets'] });
      client.invalidateQueries({ queryKey: ['agent-lab', 'datasets', selectedDatasetId] });
    },
  });
  const runEvaluation = useMutation({
    mutationFn: () => agentLabRequest<EvaluationRun>(`/agents/${selectedAgentId}/evaluations`, { method: 'POST', body: JSON.stringify({ datasetId: selectedDatasetId, evaluatorId: selectedEvaluatorId }) }),
    onSuccess: () => evaluations.refetch(),
  });
  const selectedAgent = useMemo(() => (data.agents.data || []).find((agent) => agent.id === selectedAgentId), [data.agents.data, selectedAgentId]);

  return (
    <LabShell view="evaluations">
      <SectionHeader title="离线评测" detail="评测只使用可重复的确定性规则，逐用例结果关联实际 Run 与 Trace 证据。" />
      <div className="mt-6 space-y-8">
        <RequestError error={data.datasets.error || data.evaluators.error || createDataset.error || createEvaluator.error || addCase.error || runEvaluation.error} />
        <section className="grid gap-6 xl:grid-cols-2">
          <form onSubmit={(event) => { event.preventDefault(); createDataset.mutate(); }} className="border border-slate-200 bg-white p-4"><div className="flex items-center gap-2"><Database className="h-4 w-4 text-cyan-700" /><h2 className="font-medium text-slate-900">新建数据集</h2></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm text-slate-700">标识<input required pattern="[a-z][a-z0-9-]{1,63}" value={datasetForm.key} onChange={(event) => setDatasetForm({ ...datasetForm, key: event.target.value })} className="mt-1 w-full border border-slate-300 px-3 py-2" /></label><label className="text-sm text-slate-700">名称<input required value={datasetForm.name} onChange={(event) => setDatasetForm({ ...datasetForm, name: event.target.value })} className="mt-1 w-full border border-slate-300 px-3 py-2" /></label><label className="text-sm text-slate-700">版本<input required value={datasetForm.version} onChange={(event) => setDatasetForm({ ...datasetForm, version: event.target.value })} className="mt-1 w-full border border-slate-300 px-3 py-2" /></label><label className="text-sm text-slate-700">说明<input value={datasetForm.description} onChange={(event) => setDatasetForm({ ...datasetForm, description: event.target.value })} className="mt-1 w-full border border-slate-300 px-3 py-2" /></label></div><button disabled={createDataset.isPending} className="mt-4 inline-flex items-center gap-2 bg-cyan-700 px-3 py-2 text-sm font-medium text-white disabled:bg-cyan-300"><Plus className="h-4 w-4" />创建数据集</button></form>
          <form onSubmit={(event) => { event.preventDefault(); try { createEvaluator.mutate(); } catch { /* JSON.parse error is surfaced by browser console without sending a request. */ } }} className="border border-slate-200 bg-white p-4"><div className="flex items-center gap-2"><TerminalSquare className="h-4 w-4 text-violet-700" /><h2 className="font-medium text-slate-900">新建评测器</h2></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm text-slate-700">标识<input required pattern="[a-z][a-z0-9-]{1,63}" value={evaluatorForm.key} onChange={(event) => setEvaluatorForm({ ...evaluatorForm, key: event.target.value })} className="mt-1 w-full border border-slate-300 px-3 py-2" /></label><label className="text-sm text-slate-700">名称<input required value={evaluatorForm.name} onChange={(event) => setEvaluatorForm({ ...evaluatorForm, name: event.target.value })} className="mt-1 w-full border border-slate-300 px-3 py-2" /></label><label className="text-sm text-slate-700">规则<select value={evaluatorForm.type} onChange={(event) => setEvaluatorForm({ ...evaluatorForm, type: event.target.value as Evaluator['type'] })} className="mt-1 w-full border border-slate-300 bg-white px-3 py-2"><option value="KEYWORD">KEYWORD</option><option value="JSON_SCHEMA">JSON_SCHEMA</option><option value="LATENCY">LATENCY</option></select></label><label className="text-sm text-slate-700">配置 JSON<textarea required rows={1} value={evaluatorForm.config} onChange={(event) => setEvaluatorForm({ ...evaluatorForm, config: event.target.value })} className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono text-xs" /></label></div><button disabled={createEvaluator.isPending} className="mt-4 inline-flex items-center gap-2 bg-violet-700 px-3 py-2 text-sm font-medium text-white disabled:bg-violet-300"><Plus className="h-4 w-4" />创建评测器</button></form>
        </section>
        <section className="border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-medium text-slate-900">评测用例</h2><p className="mt-1 text-sm text-slate-500">每条用例都会驱动一次真实 Agent Run，并保留断言证据。</p></div>{selectedDataset.data && <span className="font-mono text-xs text-slate-500">{selectedDataset.data.cases.length} cases</span>}</div>
          {!selectedDatasetId ? <p className="mt-4 text-sm text-slate-500">从下方执行区选择数据集后添加用例。</p> : selectedDataset.isLoading ? <div className="grid place-items-center py-8"><Loader2 className="h-5 w-5 animate-spin text-cyan-700" /></div> : <form onSubmit={(event) => { event.preventDefault(); addCase.mutate(); }} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5"><label className="text-sm text-slate-700">标识<input required pattern="[a-z][a-z0-9-]{1,63}" value={caseForm.key} onChange={(event) => setCaseForm({ ...caseForm, key: event.target.value })} className="mt-1 w-full border border-slate-300 px-3 py-2" /></label><label className="text-sm text-slate-700">输入消息<input required value={caseForm.message} onChange={(event) => setCaseForm({ ...caseForm, message: event.target.value })} className="mt-1 w-full border border-slate-300 px-3 py-2" /></label><label className="text-sm text-slate-700">岗位<input required value={caseForm.position} onChange={(event) => setCaseForm({ ...caseForm, position: event.target.value })} className="mt-1 w-full border border-slate-300 px-3 py-2" /></label><label className="text-sm text-slate-700">职级<input required value={caseForm.level} onChange={(event) => setCaseForm({ ...caseForm, level: event.target.value })} className="mt-1 w-full border border-slate-300 px-3 py-2" /></label><label className="text-sm text-slate-700">期望输出 JSON<input required value={caseForm.expectedOutput} onChange={(event) => setCaseForm({ ...caseForm, expectedOutput: event.target.value })} className="mt-1 w-full border border-slate-300 px-3 py-2 font-mono text-xs" /></label><div className="md:col-span-2 xl:col-span-5"><button disabled={addCase.isPending} className="inline-flex items-center gap-2 bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:bg-slate-300"><Plus className="h-4 w-4" />添加用例</button></div></form>}
        </section>
        <section className="border-y border-slate-200 py-6"><h2 className="text-sm font-semibold text-slate-800">执行评测</h2><div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"><select value={selectedAgentId} onChange={(event) => setSelectedAgentId(event.target.value)} className="border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">选择 Agent</option>{data.agents.data?.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.currentVersion?.version || '无已发布版本'}</option>)}</select><select value={selectedDatasetId} onChange={(event) => setSelectedDatasetId(event.target.value)} className="border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">选择数据集</option>{data.datasets.data?.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name} · {dataset._count?.cases || 0} cases</option>)}</select><select value={selectedEvaluatorId} onChange={(event) => setSelectedEvaluatorId(event.target.value)} className="border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">选择评测器</option>{data.evaluators.data?.map((evaluator) => <option key={evaluator.id} value={evaluator.id}>{evaluator.name} · {evaluator.type}</option>)}</select><button onClick={() => runEvaluation.mutate()} disabled={!selectedAgent || !selectedDatasetId || !selectedEvaluatorId || runEvaluation.isPending} className="inline-flex items-center justify-center gap-2 bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:bg-slate-300"><Play className="h-4 w-4" />执行</button></div></section>
        <section><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold text-slate-800">评测历史</h2>{selectedAgent && <span className="text-sm text-slate-500">{selectedAgent.name}</span>}</div>{!selectedAgentId ? <EmptyState title="选择一个 Agent" detail="评测历史按 Agent 与其实际发布版本回溯。" /> : evaluations.isLoading ? <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-cyan-700" /></div> : (evaluations.data || []).length === 0 ? <EmptyState title="还没有评测结果" detail="先选择带有用例的数据集和确定性评测器执行一次评测。" /> : <div className="overflow-x-auto border border-slate-200 bg-white"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3 font-medium">时间</th><th className="px-4 py-3 font-medium">数据集</th><th className="px-4 py-3 font-medium">评测器</th><th className="px-4 py-3 font-medium">结果</th><th className="px-4 py-3 font-medium">通过</th></tr></thead><tbody className="divide-y divide-slate-100">{evaluations.data?.map((evaluation) => <tr key={evaluation.id}><td className="px-4 py-3 text-slate-500">{formatDate(evaluation.createdAt)}</td><td className="px-4 py-3">{evaluation.dataset.name}<span className="ml-2 font-mono text-xs text-slate-500">v{evaluation.dataset.version}</span></td><td className="px-4 py-3">{evaluation.evaluator.type}</td><td className="px-4 py-3"><StatusBadge status={evaluation.status} /></td><td className="px-4 py-3 font-mono">{evaluation.passedCases || 0} / {evaluation.totalCases} · {((evaluation.score || 0) * 100).toFixed(0)}%</td></tr>)}</tbody></table></div>}</section>
      </div>
    </LabShell>
  );
}

export function AgentLabPage({ view = 'overview' }: { view?: LabView }) {
  if (view === 'applications') return <Applications />;
  if (view === 'agents') return <Agents />;
  if (view === 'runs') return <Runs />;
  if (view === 'evaluations') return <Evaluations />;
  return <Overview />;
}
