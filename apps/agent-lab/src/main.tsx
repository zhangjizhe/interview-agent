import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  BookOpen,
  Bot,
  FlaskConical,
  FileUp,
  Gauge,
  GitBranch,
  LogOut,
  RefreshCw,
  Search,
  ScrollText,
  ShieldAlert,
  SlidersHorizontal,
  ToggleLeft,
  Workflow,
} from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { api, logoutSession, role, token } from './api';
import { QuestionBankWorkspace, type QuestionBankItem } from './QuestionBankWorkspace';
import './styles.css';
import './lab.css';
import { ControlledEvolutionWorkspace } from './ControlledEvolutionWorkspace';
import './visual-theme.css';

type View = 'overview' | 'runtime' | 'mcp' | 'question-bank' | 'trace' | 'evaluation' | 'evolution' | 'experiments' | 'release' | 'audit' | 'operations';
type Server = {
  name: string;
  displayName?: string;
  status: string;
  transport?: string;
  enabled: boolean;
  description?: string;
};

type LabRun = {
  id: string;
  type: string;
  status: string;
  agent: { agentKey: string; version: string; runtimeVersion: string };
  datasetVersion: string;
  metrics: { qualityScore: number; structuredOutputValidRate: number };
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostCny: number;
  failures: Array<{ caseId: string; category: string; severity: string }>;
  startedAt: string;
};
type LabDashboard = {
  dataset: { version: string; caseCount: number; responseCount: number; validationStatus: string };
  summary: { runCount: number; failedRunCount: number; latestDecision: string | null; experimentCount: number };
  thresholds: { qualityScore: number; structuredOutputValidRate: number; latencyMs: number; estimatedCostCny: number };
  runs: LabRun[];
  decisions: Array<{ id: string; decision: string; rationale: string; agent: LabRun['agent']; datasetVersion: string; createdAt: string }>;
  experiments: Array<{ id: string; name: string; hypothesis: string; status: string; comparison?: Record<string, number>; datasetVersion: string; control: LabRun['agent']; treatment: LabRun['agent']; runCount: number }>;
};
type LabRecordedImport = {
  id: string;
  receiptHash: string;
  status: 'PENDING' | 'IMPORTING' | 'IMPORTED' | 'FAILED';
  submittedBy: string;
  importedBy?: string;
  runId?: string;
  error?: string;
  createdAt: string;
  importedAt?: string;
  agent: LabRun['agent'];
  datasetVersion: string;
  metrics: LabRun['metrics'];
  failureCount: number;
};
type AuditKind = 'RUN' | 'IMPORT' | 'EXPERIMENT' | 'DECISION';
type LabAuditResponse = {
  kind: AuditKind;
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  items: Array<Record<string, any>>;
};
type OperationAction = 'MCP_CONFIG_RELOAD' | 'RECORDED_IMPORT_SUBMIT' | 'RECORDED_IMPORT_EXECUTE' | 'EXPERIMENT_CREATE' | 'RELEASE_DECISION_RECORD' | 'RETENTION_EXECUTE';
type OperationOutcome = 'SUCCEEDED' | 'REJECTED';
type OperationObject = 'MCP_REGISTRY' | 'RECORDED_IMPORT' | 'EXPERIMENT' | 'RELEASE_DECISION' | 'RETENTION_POLICY';
type LabOperationLogResponse = {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  items: Array<{
    id: string;
    actorId: string;
    action: OperationAction;
    objectType: OperationObject;
    objectId: string;
    outcome: OperationOutcome;
    createdAt: string;
  }>;
};


const CONTROL_NAV: Array<{ id: View; label: string; icon: typeof Gauge; enabled: boolean }> = [
  { id: 'overview', label: '控制中心', icon: Gauge, enabled: true },
  { id: 'runtime', label: '运行编排', icon: Workflow, enabled: true },
  { id: 'mcp', label: 'MCP 与工具', icon: SlidersHorizontal, enabled: true },
  { id: 'question-bank', label: '题库治理', icon: BookOpen, enabled: true },
  { id: 'trace', label: 'Trace', icon: GitBranch, enabled: true },
  { id: 'evaluation', label: '评测', icon: FlaskConical, enabled: true },
  { id: 'evolution', label: '自进化', icon: RefreshCw, enabled: true },
  { id: 'experiments', label: '实验', icon: Bot, enabled: true },
  { id: 'release', label: '发布', icon: ShieldAlert, enabled: true },
  { id: 'audit', label: '审计', icon: ScrollText, enabled: true },
  { id: 'operations', label: '操作日志', icon: ScrollText, enabled: true },
];

function ControlCenter() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>('overview');
  const [feedback, setFeedback] = useState('');
  const [auditKind, setAuditKind] = useState<AuditKind>('RUN');
  const [auditDataset, setAuditDataset] = useState('');
  const [auditAgent, setAuditAgent] = useState('');
  const [auditStatus, setAuditStatus] = useState('');
  const [auditFrom, setAuditFrom] = useState('');
  const [auditTo, setAuditTo] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [operationAction, setOperationAction] = useState('');
  const [operationOutcome, setOperationOutcome] = useState('');
  const [operationObjectType, setOperationObjectType] = useState('');
  const [operationPage, setOperationPage] = useState(1);
  const [questionQuery, setQuestionQuery] = useState('');
  const [questionPosition, setQuestionPosition] = useState('');
  const [questionSearch, setQuestionSearch] = useState('');
  const [questionMessage, setQuestionMessage] = useState('');
  const questionSearchVersion = useRef(0);
  const clearQuestionSearch = () => {
    questionSearchVersion.current += 1;
    setQuestionSearch('');
    setQuestionMessage('');
  };
  const servers = useQuery({
    queryKey: ['agent-lab-mcp'],
    queryFn: () => api('/admin/mcp-servers'),
    refetchInterval: 30_000,
  });
  const lab = useQuery({
    queryKey: ['agent-lab-dashboard'],
    queryFn: () => api('/agent-lab/dashboard'),
    refetchInterval: 30_000,
  });
  const recordedImports = useQuery({
    queryKey: ['agent-lab-recorded-imports'],
    queryFn: () => api('/agent-lab/recorded-imports'),
    refetchInterval: 30_000,
  });
  const audit = useQuery({
    queryKey: ['agent-lab-audit', auditKind, auditDataset, auditAgent, auditStatus, auditFrom, auditTo, auditPage],
    queryFn: () => {
      const params = new URLSearchParams({ kind: auditKind, page: String(auditPage), limit: '20' });
      if (auditDataset) params.set('datasetVersion', auditDataset);
      if (auditAgent) params.set('agentKey', auditAgent);
      if (auditStatus) params.set('status', auditStatus);
      if (auditFrom) params.set('from', auditFrom);
      if (auditTo) params.set('to', auditTo);
      return api(`/agent-lab/audit?${params.toString()}`);
    },
    enabled: role() === 'ADMIN',
  });
  const operationLogs = useQuery({
    queryKey: ['agent-lab-operation-logs', operationAction, operationOutcome, operationObjectType, operationPage],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(operationPage), limit: '20' });
      if (operationAction) params.set('action', operationAction);
      if (operationOutcome) params.set('outcome', operationOutcome);
      if (operationObjectType) params.set('objectType', operationObjectType);
      return api(`/agent-lab/operation-logs?${params.toString()}`);
    },
    enabled: role() === 'ADMIN',
  });
  const questions = useQuery({
    queryKey: ['agent-lab-question-bank', questionPosition],
    queryFn: () => api(`/interview/question-bank/list?position=${encodeURIComponent(questionPosition)}&limit=50`),
    enabled: role() === 'ADMIN',
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['agent-lab-mcp'] });
    queryClient.invalidateQueries({ queryKey: ['agent-lab-dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['agent-lab-recorded-imports'] });
    queryClient.invalidateQueries({ queryKey: ['agent-lab-audit'] });
    queryClient.invalidateQueries({ queryKey: ['agent-lab-operation-logs'] });
  };
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
  const executeImport = useMutation({
    mutationFn: (importId: string) => api(`/agent-lab/recorded-imports/${importId}/execute`, { method: 'POST' }),
    onSuccess: () => {
      setFeedback('录制报告已导入控制面。');
      refresh();
    },
  });
  const createExperiment = useMutation({
    mutationFn: ({ controlRunId, treatmentRunId }: { controlRunId: string; treatmentRunId: string }) =>
      api('/agent-lab/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ controlRunId, treatmentRunId }),
      }),
    onSuccess: () => {
      setFeedback('实验比较已记录。');
      refresh();
    },
  });
  const recordDecision = useMutation({
    mutationFn: ({ runId, decision, rationaleCode }: { runId: string; decision: string; rationaleCode: string }) =>
      api('/agent-lab/release-decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, decision, rationaleCode }),
      }),
    onSuccess: () => {
      setFeedback('人工发布决策已记录。');
      refresh();
    },
  });

  if (role() !== 'ADMIN') return <AdminAccess />;
  if (servers.isLoading || lab.isLoading || recordedImports.isLoading) return <main className="agent-loading">正在连接控制面...</main>;
  if (servers.isError || lab.isError || recordedImports.isError) {
    const error = (servers.error || lab.error || recordedImports.error) as Error;
    return <main className="agent-gate"><ShieldAlert size={26}/><h1>无法读取控制面</h1><p>{error.message}</p><button className="agent-command" onClick={() => {
      localStorage.removeItem('ia_access_token'); localStorage.removeItem('ia_user_role'); localStorage.removeItem('ia_userId'); window.location.reload();
    }}>重新登录控制台</button></main>;
  }

  const data = servers.data as { servers: Server[]; runningCount: number; count: number };
  const labData = lab.data as LabDashboard;
  const imports = (recordedImports.data as { imports: LabRecordedImport[] }).imports;
  const questionItems = ((questions.data as { results?: QuestionBankItem[] })?.results || []);
  const currentMutationError = toggle.error || health.error || reload.error || executeImport.error || createExperiment.error || recordDecision.error;
  const searchQuestions = async () => {
    if (!questionQuery.trim()) return;
    const version = ++questionSearchVersion.current;
    setQuestionMessage('');
    try {
      const data = await api(`/interview/question-bank/search?q=${encodeURIComponent(questionQuery)}&position=${encodeURIComponent(questionPosition)}&limit=20`);
      if (version !== questionSearchVersion.current) return;
      setQuestionSearch(JSON.stringify(data.results || []));
    } catch (error) {
      if (version !== questionSearchVersion.current) return;
      setQuestionSearch('');
      setQuestionMessage(error instanceof Error ? error.message : '搜索失败');
    }
  };
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
              onClick={() => enabled && setView(id)}
            >
              <Icon size={16}/><span>{label}</span>{!enabled && <em>未配置</em>}
            </button>
          ))}
        </nav>
        <div className="agent-sidebar-note"><span className="agent-status-dot"/>控制 API 已受 RBAC 保护</div>
        <button
          type="button"
          className="agent-signout"
          onClick={async () => {
            try { if (await logoutSession()) window.location.reload(); }
            catch (error) { setFeedback(error instanceof Error ? error.message : '退出未确认，请重试。'); }
          }}
        ><LogOut size={16}/>退出控制台</button>
      </aside>

      <main className="agent-workspace">
        <header className="agent-topbar">
          <div><p className="agent-eyebrow">AGENT OPERATIONS</p><h1>{titleFor(view)}</h1></div>
          <button className="agent-command" onClick={() => {
            if (window.confirm('重新加载 MCP 配置不会发布或修改运行结果。继续吗？')) reload.mutate();
          }} disabled={reload.isPending}>
            <RefreshCw size={16} className={reload.isPending ? 'spin' : ''}/>{reload.isPending ? '重载中' : '重新加载 MCP'}
          </button>
        </header>

        {currentMutationError && <p className="agent-error">{(currentMutationError as Error).message}</p>}
        {feedback && <p className="agent-feedback">{feedback}</p>}

        {view === 'overview' && <Overview data={data} lab={labData} onRuntime={() => setView('runtime')} onMcp={() => setView('mcp')} />}
        {view === 'runtime' && <RuntimeCanvas />}
        {view === 'mcp' && <McpWorkspace data={data} health={health} toggle={toggle} />}
        {view === 'question-bank' && <QuestionBankWorkspace
          questions={questionItems}
          query={questionQuery}
          position={questionPosition}
          searchResults={questionSearch ? JSON.parse(questionSearch) as QuestionBankItem[] : null}
          message={questionMessage || (questions.isError ? '题库暂不可用，请重试；未将读取失败显示为空数据。' : '')}
          loading={questions.isLoading}
          onQuery={(value) => { clearQuestionSearch(); setQuestionQuery(value); }}
          onPosition={(value) => { clearQuestionSearch(); setQuestionPosition(value); }}
          onSearch={searchQuestions}
          onClearSearch={clearQuestionSearch}
        />}
        {view === 'trace' && <TraceWorkspace runs={labData.runs} />}
        {view === 'evaluation' && <EvaluationWorkspace data={labData} imports={imports} executeImport={executeImport} />}
        {view === 'evolution' && <ControlledEvolutionWorkspace />}
        {view === 'experiments' && <ExperimentWorkspace runs={labData.runs} experiments={labData.experiments} createExperiment={createExperiment} />}
        {view === 'release' && <ReleaseWorkspace runs={labData.runs} decisions={labData.decisions} recordDecision={recordDecision} />}
        {view === 'audit' && <AuditWorkspace
          audit={audit}
          datasetOptions={Array.from(new Set([labData.dataset.version, ...labData.runs.map((run) => run.datasetVersion), ...imports.map((record) => record.datasetVersion)]))}
          agentOptions={Array.from(new Set([...labData.runs.map((run) => run.agent.agentKey), ...imports.map((record) => record.agent.agentKey)]))}
          filters={{ kind: auditKind, dataset: auditDataset, agent: auditAgent, status: auditStatus, from: auditFrom, to: auditTo, page: auditPage }}
          onFilters={(next) => {
            setAuditKind(next.kind);
            setAuditDataset(next.dataset);
            setAuditAgent(next.agent);
            setAuditStatus(next.status);
            setAuditFrom(next.from);
            setAuditTo(next.to);
            setAuditPage(next.page);
          }}
        />}
        {view === 'operations' && <OperationLogWorkspace
          logs={operationLogs}
          filters={{ action: operationAction, outcome: operationOutcome, objectType: operationObjectType, page: operationPage }}
          onFilters={(next) => {
            setOperationAction(next.action);
            setOperationOutcome(next.outcome);
            setOperationObjectType(next.objectType);
            setOperationPage(next.page);
          }}
        />}
      </main>
    </div>
  );
}

function titleFor(view: View) {
  return { overview: '控制中心', runtime: '架构视图', mcp: 'MCP 与工具治理', 'question-bank': '题库治理', trace: 'Trace 运行记录', evaluation: '评测证据', evolution: '受控自进化', experiments: '实验比较', release: '发布决策', audit: '审计查询', operations: '操作日志' }[view];
}

function Overview({ data, lab, onRuntime, onMcp }: { data: { runningCount: number; count: number }; lab: LabDashboard; onRuntime: () => void; onMcp: () => void }) {
  const latestDecision = lab.decisions[0];
  return <div className="agent-page-grid">
    <section className="agent-hero">
      <p className="agent-eyebrow">SYSTEM STATUS</p>
      <h2>Agent 的运行与评测工作台</h2>
      <p>合成基准：Golden Dataset {lab.dataset.version}，格式校验覆盖 {lab.dataset.caseCount} 个 Case 和 {lab.dataset.responseCount} 个回答。录制指标用于回放与工程验证；当前业务版本的质量结论见受控自进化证据。</p>
      <div className="agent-hero-actions"><button onClick={onRuntime}><Workflow size={16}/>查看编排</button><button className="quiet" onClick={onMcp}><SlidersHorizontal size={16}/>治理 MCP</button></div>
    </section>
    <section className="agent-metric-grid">
      <article><span>MCP 服务</span><strong>{data.runningCount} / {data.count}</strong><small>当前可用</small></article>
      <article><span>运行编排</span><strong>受控</strong><small>阶段可见，内部推理不可见</small></article>
      <article><span>录制报告发布记录</span><strong>{lab.summary.latestDecision || '无记录'}</strong><small>{latestDecision ? `${new Date(latestDecision.createdAt).toLocaleString()} · 仅记录人工决定，不触发部署` : '尚无人工发布决定'}</small></article>
    </section>
    <section className="lab-summary-grid">
      <article><span>数据集</span><strong>{lab.dataset.validationStatus}</strong><small>{lab.dataset.version} · {lab.runs[0] ? new Date(lab.runs[0].startedAt).toLocaleString() : '当前控制面读取'}</small></article>
      <article><span>失败运行</span><strong>{lab.summary.failedRunCount}</strong><small>最近 20 条运行</small></article>
      <article><span>录制报告质量门</span><strong>{Math.round(lab.thresholds.qualityScore * 100)}%</strong><small>版本自进化使用独立发布证据门</small></article>
    </section>
    <RuntimeCanvas compact />
  </div>;
}

function TraceWorkspace({ runs }: { runs: LabRun[] }) {
  if (!runs.length) return <EmptyState title="尚无 Trace 运行记录" text="Harness 记录会在完成后显示版本、数据集、阶段摘要、延迟、Token、成本和失败分类。" />;
  return <section className="lab-list">{runs.map((run) => <article className="lab-row" key={run.id}>
    <div><p className="agent-eyebrow">{run.type} / {run.status}</p><h2>{run.agent.agentKey} <span>{run.agent.version}</span></h2><p>{run.datasetVersion} · {new Date(run.startedAt).toLocaleString()}</p></div>
    <div className="lab-row-metrics"><span>质量 {Math.round(run.metrics.qualityScore * 100)}%</span><span>有效 {Math.round(run.metrics.structuredOutputValidRate * 100)}%</span><span>{run.durationMs}ms</span><span>{run.inputTokens + run.outputTokens} tokens</span><span>{run.estimatedCostCny.toFixed(3)} CNY</span></div>
    <div className="lab-failures">{run.failures.length ? run.failures.map((failure) => <span key={`${failure.caseId}-${failure.category}`} className={`severity-${failure.severity.toLowerCase()}`}>{failure.category}</span>) : <span className="severity-low">无分类失败</span>}</div>
  </article>)}</section>;
}

function EvaluationWorkspace({ data, imports, executeImport }: {
  data: LabDashboard;
  imports: LabRecordedImport[];
  executeImport: { isPending: boolean; variables?: string; mutate: (importId: string) => void };
}) {
  return <div className="agent-page-grid">
    <section className="lab-thresholds"><h2>发布门阈值</h2><span>质量 {'>='} {Math.round(data.thresholds.qualityScore * 100)}%</span><span>结构化有效 {'>='} {Math.round(data.thresholds.structuredOutputValidRate * 100)}%</span><span>延迟 {'<='} {data.thresholds.latencyMs}ms</span><span>成本 {'<='} {data.thresholds.estimatedCostCny} CNY</span></section>
    <RecordedImports imports={imports} executeImport={executeImport} />
    <TraceWorkspace runs={data.runs} />
  </div>;
}

function RecordedImports({ imports, executeImport }: {
  imports: LabRecordedImport[];
  executeImport: { isPending: boolean; variables?: string; mutate: (importId: string) => void };
}) {
  if (!imports.length) return <section className="lab-imports"><h2>录制报告</h2><p>暂无待处理报告</p></section>;
  return <section className="lab-imports"><h2>录制报告</h2>{imports.map((record) => {
    const pending = record.status === 'PENDING';
    const busy = executeImport.isPending && executeImport.variables === record.id;
    return <article className="lab-import-row" key={record.id}>
      <div><p className={`import-${record.status.toLowerCase()}`}>{record.status}</p><h3>{record.agent.agentKey} <span>{record.agent.version}</span></h3><p>{record.datasetVersion} · {new Date(record.createdAt).toLocaleString()}</p></div>
      <div className="lab-row-metrics"><span>质量 {Math.round(record.metrics.qualityScore * 100)}%</span><span>失败 {record.failureCount}</span><span>{record.receiptHash.slice(0, 12)}</span></div>
      {pending ? <button className="agent-command" onClick={() => executeImport.mutate(record.id)} disabled={busy}><FileUp size={16}/>{busy ? '导入中' : '导入'}</button> : <p className="lab-import-detail">{record.importedBy || record.error || record.runId || ''}</p>}
    </article>;
  })}</section>;
}

function ExperimentWorkspace({ runs, experiments, createExperiment }: {
  runs: LabRun[];
  experiments: LabDashboard['experiments'];
  createExperiment: { isPending: boolean; mutate: (input: { controlRunId: string; treatmentRunId: string }) => void };
}) {
  return <div className="agent-page-grid">
    <ExperimentComposer runs={runs} createExperiment={createExperiment} />
    {experiments.length
      ? <section className="lab-list">{experiments.map((experiment) => <article className="lab-row" key={experiment.id}><div><p className="agent-eyebrow">{experiment.status} / {experiment.datasetVersion}</p><h2>{experiment.name}</h2><p>{experiment.hypothesis}</p></div><div className="lab-row-metrics"><span>Control {experiment.control.version}</span><span>Treatment {experiment.treatment.version}</span>{Object.entries(experiment.comparison || {}).map(([key, value]) => <span key={key}>{key}: {Number(value).toFixed(3)}</span>)}</div></article>)}</section>
      : <EmptyState title="尚无实验比较" text="没有可比较运行" />}
  </div>;
}

function ExperimentComposer({ runs, createExperiment }: {
  runs: LabRun[];
  createExperiment: { isPending: boolean; mutate: (input: { controlRunId: string; treatmentRunId: string }) => void };
}) {
  const [controlRunId, setControlRunId] = useState('');
  const [treatmentRunId, setTreatmentRunId] = useState('');
  const compatibleTreatmentRuns = runs.filter((run) => !controlRunId || run.datasetVersion === runs.find((item) => item.id === controlRunId)?.datasetVersion);
  return <section className="lab-command-form">
    <div><p className="agent-eyebrow">EXPERIMENT</p><h2>创建比较</h2></div>
    <label>Control<select aria-label="Control run" value={controlRunId} onChange={(event) => setControlRunId(event.target.value)}><option value="">选择运行</option>{runs.map((run) => <option key={run.id} value={run.id}>{run.agent.agentKey} {run.agent.version} · {run.datasetVersion}</option>)}</select></label>
    <label>Treatment<select aria-label="Treatment run" value={treatmentRunId} onChange={(event) => setTreatmentRunId(event.target.value)}><option value="">选择运行</option>{compatibleTreatmentRuns.map((run) => <option key={run.id} value={run.id} disabled={run.id === controlRunId || run.agent.version === runs.find((item) => item.id === controlRunId)?.agent.version}>{run.agent.agentKey} {run.agent.version} · {run.datasetVersion}</option>)}</select></label>
    <button className="agent-command" onClick={() => createExperiment.mutate({ controlRunId, treatmentRunId })} disabled={!controlRunId || !treatmentRunId || controlRunId === treatmentRunId || createExperiment.isPending}>{createExperiment.isPending ? '创建中' : '创建实验'}</button>
  </section>;
}

function ReleaseWorkspace({ runs, decisions, recordDecision }: {
  runs: LabRun[];
  decisions: LabDashboard['decisions'];
  recordDecision: { isPending: boolean; variables?: { runId: string }; mutate: (input: { runId: string; decision: string; rationaleCode: string }) => void };
}) {
  return <div className="agent-page-grid">
    <section className="lab-release-commands">{runs.length ? runs.map((run) => <DecisionCommand key={run.id} run={run} recordDecision={recordDecision} />) : <EmptyState title="尚无可决策运行" text="没有已导入运行" />}</section>
    {decisions.length ? <section className="lab-list">{decisions.map((decision) => <article className="lab-row" key={decision.id}><div><p className={`decision-${decision.decision.toLowerCase()}`}>{decision.decision}</p><h2>{decision.agent.agentKey} <span>{decision.agent.version}</span></h2><p>{decision.datasetVersion} · {new Date(decision.createdAt).toLocaleString()}</p></div><p className="lab-rationale">{decision.rationale}</p></article>)}</section> : <EmptyState title="尚无发布决策" text="没有已记录决策" />}
  </div>;
}

function DecisionCommand({ run, recordDecision }: {
  run: LabRun;
  recordDecision: { isPending: boolean; variables?: { runId: string }; mutate: (input: { runId: string; decision: string; rationaleCode: string }) => void };
}) {
  const [decision, setDecision] = useState('NEEDS_REVIEW');
  const busy = recordDecision.isPending && recordDecision.variables?.runId === run.id;
  const rationaleCode = decision === 'APPROVE' ? 'QUALITY_GATE_REVIEWED'
    : decision === 'REJECT' ? 'RELEASE_GATE_REJECTED'
      : 'COST_OR_LATENCY_REVIEW';
  return <article className="lab-release-row">
    <div><p className="agent-eyebrow">{run.datasetVersion}</p><h2>{run.agent.agentKey} <span>{run.agent.version}</span></h2><p>质量 {Math.round(run.metrics.qualityScore * 100)}% · {run.durationMs}ms</p></div>
    <select aria-label={`Release decision for ${run.agent.version}`} value={decision} onChange={(event) => setDecision(event.target.value)}><option value="APPROVE">APPROVE</option><option value="NEEDS_REVIEW">NEEDS_REVIEW</option><option value="REJECT">REJECT</option></select>
    <button className="agent-command" onClick={() => recordDecision.mutate({ runId: run.id, decision, rationaleCode })} disabled={busy}>{busy ? '记录中' : '记录决策'}</button>
  </article>;
}

function AuditWorkspace({ audit, datasetOptions, agentOptions, filters, onFilters }: {
  audit: ReturnType<typeof useQuery>;
  datasetOptions: string[];
  agentOptions: string[];
  filters: { kind: AuditKind; dataset: string; agent: string; status: string; from: string; to: string; page: number };
  onFilters: (next: { kind: AuditKind; dataset: string; agent: string; status: string; from: string; to: string; page: number }) => void;
}) {
  const statusOptions: Record<AuditKind, string[]> = {
    RUN: ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'],
    IMPORT: ['PENDING', 'IMPORTING', 'IMPORTED', 'FAILED'],
    EXPERIMENT: ['DRAFT', 'RUNNING', 'COMPLETED'],
    DECISION: ['APPROVE', 'NEEDS_REVIEW', 'REJECT'],
  };
  const update = (change: Partial<typeof filters>) => onFilters({ ...filters, ...change, page: change.page ?? 1 });
  const data = audit.data as LabAuditResponse | undefined;
  return <div className="agent-page-grid">
    <section className="lab-audit-filters">
      <label>类型<select aria-label="Audit kind" value={filters.kind} onChange={(event) => update({ kind: event.target.value as AuditKind, status: '' })}><option value="RUN">Run</option><option value="IMPORT">Import</option><option value="EXPERIMENT">Experiment</option><option value="DECISION">Decision</option></select></label>
      <label>数据集<select aria-label="Audit dataset" value={filters.dataset} onChange={(event) => update({ dataset: event.target.value })}><option value="">全部</option>{datasetOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>版本<select aria-label="Audit agent" value={filters.agent} onChange={(event) => update({ agent: event.target.value })}><option value="">全部</option>{agentOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>状态<select aria-label="Audit status" value={filters.status} onChange={(event) => update({ status: event.target.value })}><option value="">全部</option>{statusOptions[filters.kind].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>开始<input aria-label="Audit from" type="date" value={filters.from} onChange={(event) => update({ from: event.target.value })} /></label>
      <label>结束<input aria-label="Audit to" type="date" value={filters.to} onChange={(event) => update({ to: event.target.value })} /></label>
    </section>
    {audit.isLoading ? <EmptyState title="正在读取审计记录" text="请稍候" /> : audit.isError ? <EmptyState title="无法读取审计记录" text={(audit.error as Error).message} /> : <AuditList data={data} onPage={(page) => update({ page })} />}
  </div>;
}

function AuditList({ data, onPage }: { data?: LabAuditResponse; onPage: (page: number) => void }) {
  if (!data || !data.items.length) return <EmptyState title="没有匹配的审计记录" text="调整筛选条件后重试" />;
  return <section className="lab-list">
    {data.items.map((item) => <article className="lab-row" key={item.id}>
      <div><p className="agent-eyebrow">{data.kind} / {item.status || item.decision}</p><h2>{item.agent?.agentKey || item.name || item.receiptHash?.slice(0, 12)} <span>{item.agent?.version || ''}</span></h2><p>{item.datasetVersion || ''} · {new Date(item.createdAt).toLocaleString()}</p></div>
      <div className="lab-row-metrics"><span>{item.runId || item.experimentId || item.failureCount !== undefined ? `引用 ${item.runId || item.experimentId || item.failureCount}` : '审计记录'}</span>{item.metrics?.qualityScore !== undefined && <span>质量 {Math.round(item.metrics.qualityScore * 100)}%</span>}</div>
    </article>)}
    <div className="lab-pagination"><span>{data.total} 条</span><button className="icon-command" title="上一页" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>‹</button><button className="icon-command" title="下一页" disabled={!data.hasMore} onClick={() => onPage(data.page + 1)}>›</button></div>
  </section>;
}

function OperationLogWorkspace({ logs, filters, onFilters }: {
  logs: ReturnType<typeof useQuery>;
  filters: { action: string; outcome: string; objectType: string; page: number };
  onFilters: (next: { action: string; outcome: string; objectType: string; page: number }) => void;
}) {
  const update = (change: Partial<typeof filters>) => onFilters({ ...filters, ...change, page: change.page ?? 1 });
  const data = logs.data as LabOperationLogResponse | undefined;
  return <div className="agent-page-grid">
    <section className="lab-audit-filters operation-log-filters">
      <label>动作<select aria-label="Operation action" value={filters.action} onChange={(event) => update({ action: event.target.value })}><option value="">全部</option><option value="MCP_CONFIG_RELOAD">重新加载 MCP</option><option value="RECORDED_IMPORT_SUBMIT">Receipt 提交</option><option value="RECORDED_IMPORT_EXECUTE">Receipt 导入</option><option value="EXPERIMENT_CREATE">创建实验</option><option value="RELEASE_DECISION_RECORD">发布决策</option><option value="RETENTION_EXECUTE">保留清理</option></select></label>
      <label>结果<select aria-label="Operation outcome" value={filters.outcome} onChange={(event) => update({ outcome: event.target.value })}><option value="">全部</option><option value="SUCCEEDED">成功</option><option value="REJECTED">拒绝</option></select></label>
      <label>对象<select aria-label="Operation object type" value={filters.objectType} onChange={(event) => update({ objectType: event.target.value })}><option value="">全部</option><option value="MCP_REGISTRY">MCP Registry</option><option value="RECORDED_IMPORT">Receipt</option><option value="EXPERIMENT">Experiment</option><option value="RELEASE_DECISION">Decision</option><option value="RETENTION_POLICY">Retention</option></select></label>
    </section>
    {logs.isLoading ? <EmptyState title="正在读取操作日志" text="请稍候" /> : logs.isError ? <EmptyState title="无法读取操作日志" text={(logs.error as Error).message} /> : <OperationLogList data={data} onPage={(page) => update({ page })} />}
  </div>;
}

function OperationLogList({ data, onPage }: { data?: LabOperationLogResponse; onPage: (page: number) => void }) {
  if (!data || !data.items.length) return <EmptyState title="没有匹配的操作日志" text="操作日志只记录受控管理操作的主体、对象和结果。" />;
  return <section className="lab-list">
    {data.items.map((item) => <article className="lab-row" key={item.id}>
      <div><p className="agent-eyebrow">{item.action} / {item.outcome}</p><h2>{item.objectType} <span>{item.objectId}</span></h2><p>管理员 {item.actorId} · {new Date(item.createdAt).toLocaleString()}</p></div>
    </article>)}
    <div className="lab-pagination"><span>{data.total} 条</span><button className="icon-command" title="上一页" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>‹</button><button className="icon-command" title="下一页" disabled={!data.hasMore} onClick={() => onPage(data.page + 1)}>›</button></div>
  </section>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <section className="lab-empty"><FlaskConical size={20}/><h2>{title}</h2><p>{text}</p></section>;
}

function RuntimeCanvas({ compact = false }: { compact?: boolean }) {
  return <section className={`runtime-canvas ${compact ? 'compact' : ''}`}>
    <div className="runtime-heading"><div><p className="agent-eyebrow">RUNTIME TOPOLOGY</p><h2>受控 Agent 编排</h2></div><span>不展示思维链</span></div>
    <div className="runtime-flow">
      {['请求边界', '规划', '执行', '复核', '受控输出'].map((label, index) => (
        <div className="runtime-step" key={label}>
          <div className="runtime-node"><span>{String(index + 1).padStart(2, '0')}</span><strong>{label}</strong></div>
          {index < 4 && <i aria-hidden="true"/>}
        </div>
      ))}
    </div>
    <div className="runtime-foot"><span>静态架构示意，不表示正在运行</span><span>候选人数据默认不进入控制台</span></div>
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

function AdminAccess({ expired = false }: { expired?: boolean }) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(expired ? '登录已过期，请重新登录。' : '');
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
      if (registering) {
        setRegistering(false);
        setError(data.role === 'ADMIN'
          ? '管理员账号已创建，请使用相同凭据登录。'
          : '账号已创建，但 Agent Lab 仅允许管理员进入。请联系部署管理员授权后再登录。');
        return;
      }
      if (data.role !== 'ADMIN') throw new Error('账号登录成功，但当前账号尚未获得 Agent Lab 管理员权限。');
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

function LabSessionGate() {
  const queryClient = useQueryClient();
  const [active, setActive] = useState(Boolean(token()) && role() === 'ADMIN');
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const onExpired = () => { queryClient.clear(); setExpired(true); setActive(false); };
    window.addEventListener('ia:session-expired', onExpired);
    return () => window.removeEventListener('ia:session-expired', onExpired);
  }, [queryClient]);
  return active ? <ControlCenter /> : <AdminAccess expired={expired} />;
}

createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><LabSessionGate/></QueryClientProvider>);
