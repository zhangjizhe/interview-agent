import { diagnosticText } from './trace-diagnostics';
import { LabShell } from './LabShell';
import { useLabNavigation } from './useLabNavigation';
import { KnowledgeLibraryPanel } from './KnowledgeLibraryPanel';
import { DataGovernanceWorkspace } from './DataGovernanceWorkspace';
import { toggleMcpServer, readMcpServers, reloadMcpServers } from './mcp-controls';
import { RuntimeTraceWorkspace } from './RuntimeTraceWorkspace';
import { RunInspector } from './RunInspector';
import { AgentBuilderWorkspace } from './AgentBuilderWorkspace';
import { AccountSecurityDialog } from './AccountSecurityDialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Bot,
  FileUp,
  FlaskConical,
  RefreshCw,
  Search,
  ScrollText,
  ShieldAlert,
  SlidersHorizontal,
  ToggleLeft,
  ToggleRight,
  Workflow,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, logoutSession, role, token } from './api';
import { QuestionBankWorkspace, type QuestionBankItem } from './QuestionBankWorkspace';
import { QuestionCatalogPanel } from './QuestionCatalogPanel';
import { questionBankQuery } from './question-bank-query';
import './styles.css';
import './lab.css';
import { ControlledEvolutionWorkspace } from './ControlledEvolutionWorkspace';
import './visual-theme.css';
import './workspace-shell.css';
import './mobile-layout.css';

type Server = {
  name: string;
  displayName?: string;
  status: string;
  transport?: string;
  enabled: boolean;
  description?: string;
  executable?: boolean;
  lastHealthCheck?: string;
  errorMessage?: string;
  builtin?: boolean;
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


export function ControlCenter() {
  const queryClient = useQueryClient();
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [mcpChecks, setMcpChecks] = useState<Record<string, { ok: boolean; error?: string; latencyMs: number; at: string }>>({});
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
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [view, setView] = useLabNavigation(workspaceBusy, unsavedChanges);
  const [questionSource, setQuestionSource] = useState<'catalog' | 'knowledge'>('catalog');
  const [questionQuery, setQuestionQuery] = useState('');
  const [questionSearching, setQuestionSearching] = useState(false);
  const questionSearchPending = useRef(false);
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
    enabled: view === 'overview' || view === 'mcp',
    queryFn: readMcpServers,
    refetchInterval: 30_000,
  });
  const lab = useQuery({
    queryKey: ['agent-lab-dashboard'],
    enabled: ['overview', 'evaluation', 'experiments', 'release', 'audit'].includes(view),
    queryFn: () => api('/agent-lab/dashboard'),
    refetchInterval: 30_000,
  });
  const recordedImports = useQuery({
    queryKey: ['agent-lab-recorded-imports'],
    enabled: view === 'evaluation' || view === 'audit',
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
    enabled: role() === 'ADMIN' && view === 'audit',
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
    enabled: role() === 'ADMIN' && view === 'operations',
  });
  const questions = useQuery({
    queryKey: ['agent-lab-question-bank', questionPosition],
    queryFn: () => api(`/interview/question-bank/list?${questionBankQuery(questionPosition, 50)}`),
    enabled: role() === 'ADMIN' && view === 'question-bank' && questionSource === 'catalog',
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['agent-lab-mcp'] });
    queryClient.invalidateQueries({ queryKey: ['agent-lab-dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['agent-lab-recorded-imports'] });
    queryClient.invalidateQueries({ queryKey: ['agent-lab-audit'] });
    queryClient.invalidateQueries({ queryKey: ['agent-lab-operation-logs'] });
  };
  const toggle = useMutation({
    onMutate: () => setFeedback(''),
    mutationFn: toggleMcpServer,
    onSuccess: (_result, variables) => {
      setFeedback(`${variables.toolName} 已在当前 API 进程${variables.enabled ? '启用' : '关闭'}。`);
      refresh();
    },
    // A missing receipt does not establish rollback: the server may have applied it.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['agent-lab-mcp'] }),
  });
  const readMcpState = useMutation({
    mutationFn: readMcpServers,
    onMutate: () => setFeedback(''),
    onSuccess: (result) => {
      queryClient.setQueryData(['agent-lab-mcp'], result);
      setFeedback('已重新读取当前 API 进程状态；请核对各工具开关。');
    },
  });
  const health = useMutation({
    mutationFn: async (name: string) => { const result = await api(`/admin/mcp-servers/${encodeURIComponent(name)}/health`); if (typeof result?.ok !== 'boolean' || !Number.isFinite(result.latencyMs) || result.latencyMs < 0) throw new Error('未收到有效检查结果，请重新读取后核对。'); return result; },
    onSuccess: (result, name) => {
      setMcpChecks(current => ({ ...current, [name]: { ...result, at: new Date().toLocaleTimeString() } }));
      setFeedback(result.ok
        ? `${name} 执行绑定已就绪；依赖及实际调用仍需验收。`
        : '');
      refresh();
    },
  });
  const reload = useMutation({
    mutationFn: reloadMcpServers,
    onSuccess: () => {
      setFeedback('当前 API 进程的 MCP 配置已重新加载；运行时开关保持不变。');
      refresh();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['agent-lab-mcp'] }),
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
  const dependencies = view === 'overview' ? [servers, lab]
    : view === 'mcp' ? [servers]
    : ['evaluation', 'audit'].includes(view) ? [lab, recordedImports]
    : ['experiments', 'release'].includes(view) ? [lab] : [];
  const workspaceLoading = dependencies.some(query => query.isPending);
  const workspaceError = dependencies.find(query => query.isError)?.error;
  if (dependencies.some(query => (query.error as { status?: number } | undefined)?.status === 403)) {
    return <main className="agent-access"><section><h1>无法读取控制面</h1><p>当前会话没有访问 Agent Lab 的权限。</p></section></main>;
  }

  const data = servers.data as { servers: Server[]; runningCount: number; count: number };
  const labData = lab.data as LabDashboard;
  const imports = (recordedImports.data as { imports: LabRecordedImport[] } | undefined)?.imports ?? [];
  const questionItems = ((questions.data as { results?: QuestionBankItem[] })?.results || []);
  const currentMutationError = readMcpState.error || toggle.error || health.error || reload.error || executeImport.error || createExperiment.error || recordDecision.error;
  const searchQuestions = async () => {
    if (!questionQuery.trim() || questionSearchPending.current) return;
    questionSearchPending.current = true;
    setQuestionSearching(true);
    const version = ++questionSearchVersion.current;
    setQuestionMessage('');
    try {
      const data = await api(`/interview/question-bank/search?${questionBankQuery(questionPosition, 20, questionQuery)}`);
      if (version !== questionSearchVersion.current) return;
      setQuestionSearch(JSON.stringify(data.results || []));
    } catch (error) {
      if (version !== questionSearchVersion.current) return;
      setQuestionSearch('');
      setQuestionMessage(error instanceof Error ? error.message : '搜索失败');
    } finally { questionSearchPending.current = false; setQuestionSearching(false); }
  };
  return (
    <LabShell view={view} onView={setView} locked={workspaceBusy} onAccount={() => setShowPasswordChange(true)}
      onLogout={async () => {
        try { if (await logoutSession()) window.location.reload(); }
        catch (error) { setFeedback(error instanceof Error ? error.message : '退出未确认，请重试。'); }
      }} actions={view === 'mcp' ? <>
        <button className="agent-command quiet-command" onClick={() => readMcpState.mutate()} disabled={readMcpState.isPending || toggle.isPending || reload.isPending || health.isPending}><RefreshCw size={15} className={readMcpState.isPending ? 'spin' : ''}/>{readMcpState.isPending ? '正在读取…' : '刷新本进程状态'}</button>
        <button className="agent-command" onClick={() => {
          if (window.confirm('仅重新加载当前 API 进程的 MCP 配置；保留运行时开关，不同步其他实例。继续吗？')) reload.mutate();
        }} disabled={reload.isPending || toggle.isPending || readMcpState.isPending || health.isPending}><RefreshCw size={15} className={reload.isPending ? 'spin' : ''}/>{reload.isPending ? '重载中' : '重新加载 MCP'}</button>
      </> : undefined}>
        {showPasswordChange && <AccountSecurityDialog onClose={() => setShowPasswordChange(false)} />}


        {workspaceBusy && <p className="qb-feedback" role="status">当前操作正在处理，完成后可切换页面；请勿重复提交或刷新。</p>}
        {currentMutationError && <p className="agent-error" role="alert">{(currentMutationError as Error).message}</p>}
        {feedback && <p className="agent-feedback" role="status">{feedback}</p>}

        {workspaceLoading && !workspaceError && <section className="lab-state-card" role="status"><RefreshCw size={22} className="spin"/><h2>正在读取工作区</h2><p>正在连接此页面需要的服务，请稍候。</p></section>}
        {workspaceError && <section className="lab-state-card lab-state-error" role="alert"><ShieldAlert size={24}/><h2>此页面的数据暂时不可用</h2><p>{workspaceError.message}</p><button className="agent-command" onClick={() => { for (const query of dependencies) void query.refetch(); }} disabled={dependencies.some(query => query.isFetching)}>重试读取</button><small>你仍可以通过导航访问其他工作区。</small></section>}
        {!workspaceLoading && !workspaceError && <>
        {view === 'overview' && <Overview data={data} lab={labData} onRuntime={() => setView('runtime')} onMcp={() => setView('mcp')} onNavigate={(next) => setView(next)} />}
        {view === 'runtime' && <AgentBuilderWorkspace onBusyChange={setWorkspaceBusy} onDirtyChange={setUnsavedChanges} />}
        {view === 'mcp' && <McpWorkspace data={data} health={health} toggle={toggle} checks={mcpChecks} operationBusy={readMcpState.isPending || reload.isPending} />}
        {view === 'data' && <DataGovernanceWorkspace />}
        {view === 'question-bank' && <><div className="question-source-switch" role="group" aria-label="题库资料来源"><button type="button" disabled={workspaceBusy} aria-pressed={questionSource === 'catalog'} onClick={() => setQuestionSource('catalog')}>业务题库</button><button type="button" disabled={workspaceBusy} aria-pressed={questionSource === 'knowledge'} onClick={() => setQuestionSource('knowledge')}>RAG 知识资料（只读）</button></div>{questionSource === 'knowledge' ? <KnowledgeLibraryPanel /> : <><QuestionBankWorkspace
          onBusyChange={setWorkspaceBusy}
          questions={questionItems}
          query={questionQuery}
          position={questionPosition}
          searchResults={questionSearch ? JSON.parse(questionSearch) as QuestionBankItem[] : null}
          message={questionMessage || (questions.isError ? '题库暂不可用，请重试；未将读取失败显示为空数据。' : '')}
          loading={questions.isLoading}
          listError={questions.isError}
          retrying={questions.isFetching}
          onRetryList={() => { void questions.refetch(); }}
          searching={questionSearching}
          onQuery={(value) => { clearQuestionSearch(); setQuestionQuery(value); }}
          onPosition={(value) => { clearQuestionSearch(); setQuestionPosition(value); }}
          onSearch={searchQuestions}
          onClearSearch={clearQuestionSearch}
        /><details className="qb-maintenance"><summary>题库存储与索引维护<span>高级操作</span></summary><QuestionCatalogPanel /></details></>}</>}
        {view === 'trace' && <RuntimeTraceWorkspace />}
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
        </>}
    </LabShell>
  );
}

type BadCaseItem = {
  runId: string;
  agentId: string;
  agentKey: string;
  agentName: string;
  agentVersionId: string;
  version?: string | null;
  application?: string | null;
  status: string;
  error?: string | null;
  latencyMs?: number | null;
  createdAt: string;
  reasons: string[];
  downvoteCount: number;
  latestFeedback?: { category?: string | null; comment?: string | null; sourceApp?: string | null } | null;
  promotedCaseId?: string | null;
};

type BadCaseQueueResponse = {
  items: BadCaseItem[];
  summary: {
    totalBadCases: number;
    failedRuns: number;
    downvotedRuns: number;
    promotedCount: number;
    pendingTriageCount: number;
  };
};

export function BadCaseFlywheelPanel({ onNavigate }: { onNavigate?: (view: 'trace' | 'evolution' | 'release') => void }) {
  const [inspecting, setInspecting] = useState<BadCaseItem | null>(null);
  const badCases = useQuery<BadCaseQueueResponse>({
    queryKey: ['lab-bad-cases-queue'],
    retry: false,
    queryFn: () => api('/agent-lab/bad-cases?limit=20'),
  });
  const summary = badCases.data?.summary;
  const items = badCases.data?.items ?? [];
  return <section className="lab-section" aria-label="评测驱动演进飞轮与 Bad Case 待评审队列">
    <div className="lab-section-head">
      <div>
        <h2>评测驱动演进飞轮（Eval-Driven Flywheel）</h2>
        <p>消费端运行与 👎 反馈自动汇聚至此 → 脱敏沉淀为回归用例 → 门禁评测对比 → 灰度发布或秒级回滚。</p>
      </div>
    </div>
    <div className="lab-summary-grid">
      <article>
        <span>① Bad Case 捕获</span>
        <strong>{summary ? `${summary.pendingTriageCount} 待评审` : '读取中'}</strong>
        <small>{summary ? `失败运行 ${summary.failedRuns} · 踩反馈 ${summary.downvotedRuns}` : '仅统计真实持久化运行'}</small>
        {onNavigate && <button type="button" className="quiet" onClick={() => onNavigate('trace')}>打开 Trace 排障</button>}
      </article>
      <article>
        <span>② 沉淀回归集</span>
        <strong>{summary ? `${summary.promotedCount} 已沉淀` : '—'}</strong>
        <small>点击下方任意 Bad Case 一键脱敏转入未冻结 Dataset</small>
      </article>
      <article>
        <span>③ 门禁评测对比</span>
        <strong>受控对比</strong>
        <small>同 Dataset / 同断言契约跑出 v1 vs v2 差异证据</small>
        {onNavigate && <button type="button" className="quiet" onClick={() => onNavigate('evolution')}>前往评测门禁</button>}
      </article>
      <article>
        <span>④ 发布与秒级回滚</span>
        <strong>可回滚</strong>
        <small>支持切回任意历史 PUBLISHED 版本并写审计记录</small>
        {onNavigate && <button type="button" className="quiet" onClick={() => onNavigate('release')}>前往发布与回滚</button>}
      </article>
    </div>
    {badCases.isError && <p className="trace-muted">Bad Case 队列暂未就绪（不影响其他控制面操作）。</p>}
    {!badCases.isPending && !badCases.isError && items.length === 0 && (
      <p className="trace-muted">当前无待评审的失败运行或 👎 反馈记录。</p>
    )}
    {items.length > 0 && <div className="lab-list" aria-label="Bad Case 待评审列表">
      {items.map((item) => <article className="lab-row" key={item.runId}>
        <div>
          <p>{item.reasons.map(r => r === 'RUN_FAILED' ? '运行失败' : '消费端 👎').join(' · ')} · {item.promotedCaseId ? '已沉淀回归集' : '待评审'}</p>
          <h3>{item.agentName} <span>{item.version ?? '未知版本'}</span></h3>
          <p>{item.application ?? '未标注应用'} · <code>{item.runId}</code> · {new Date(item.createdAt).toLocaleString()}</p>
          {item.latestFeedback?.comment && <p className="lab-rationale">反馈：{item.latestFeedback.comment}</p>}
          {!item.latestFeedback?.comment && item.error && <p className="lab-rationale">错误：{item.error}</p>}
        </div>
        <div>
          <button type="button" onClick={() => setInspecting(item)}>排查并转回归集</button>
        </div>
      </article>)}
    </div>}
    {inspecting && <RunInspector runId={inspecting.runId} agentId={inspecting.agentId} versionId={inspecting.agentVersionId} close={() => setInspecting(null)} />}
  </section>;
}

function Overview({ data, lab, onRuntime, onMcp, onNavigate }: { data: { runningCount: number; count: number }; lab: LabDashboard; onRuntime: () => void; onMcp: () => void; onNavigate?: (view: 'trace' | 'evolution' | 'release') => void }) {
  const latestDecision = lab.decisions[0];
  return <div className="agent-page-grid">
    <section className="agent-hero">
      <p className="agent-eyebrow">SYSTEM STATUS</p>
      <h2>Agent 的运行与评测工作台</h2>
      <p>合成基准：Golden Dataset {lab.dataset.version}，格式校验覆盖 {lab.dataset.caseCount} 个 Case 和 {lab.dataset.responseCount} 个回答。录制指标用于回放与工程验证；当前业务版本的质量结论见受控自进化证据。</p>
      <div className="agent-hero-actions"><button onClick={onRuntime}><Workflow size={16}/>查看编排</button><button className="quiet" onClick={onMcp}><SlidersHorizontal size={16}/>治理 MCP</button></div>
    </section>
    <BadCaseFlywheelPanel onNavigate={onNavigate} />
    <section className="agent-metric-grid">
      <article><span>MCP 服务</span><strong>{data.runningCount} / {data.count}</strong><small>已启用且执行绑定就绪</small></article>
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

function HarnessRunSummary({ runs }: { runs: LabRun[] }) {
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
    <div><h2>旧 Harness 录制报告汇总</h2><p>此处是录制报告摘要，实际 Agent Run 的逐事件排障请使用 Trace 页面。</p><HarnessRunSummary runs={data.runs} /></div>
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

export function PublishedVersionRollback() {
  const queryClient = useQueryClient();
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [confirmVersionId, setConfirmVersionId] = useState('');
  const [rollbackNotice, setRollbackNotice] = useState('');
  const agents = useQuery<Array<{ id: string; key: string; name: string; status: string; currentVersionId?: string | null; currentVersion?: { id: string; version: string; status: string } | null }>>({
    queryKey: ['lab-release-agents'],
    retry: false,
    queryFn: () => api('/agent-lab/agents'),
  });
  const versions = useQuery<Array<{ id: string; version: string; status: string; publishedAt?: string | null; createdAt: string }>>({
    queryKey: ['lab-release-versions', selectedAgentId],
    enabled: Boolean(selectedAgentId),
    retry: false,
    queryFn: () => api(`/agent-lab/agents/${encodeURIComponent(selectedAgentId)}/versions`),
  });
  const rollback = useMutation({
    mutationFn: ({ agentId, versionId }: { agentId: string; versionId: string }) =>
      api(`/agent-lab/agents/${encodeURIComponent(agentId)}/versions/${encodeURIComponent(versionId)}/activate`, { method: 'POST' }),
    onSuccess: (activated: any) => {
      setConfirmVersionId('');
      setRollbackNotice(`已安全回滚当前生效版本至 ${activated?.version || '目标已发布版本'}（已写入审计记录，不调用模型）。`);
      void queryClient.invalidateQueries({ queryKey: ['lab-release-agents'] });
      void queryClient.invalidateQueries({ queryKey: ['lab-release-versions', selectedAgentId] });
      void queryClient.invalidateQueries({ queryKey: ['lab-agents'] });
    },
  });
  const activeAgent = agents.data?.find(a => a.id === selectedAgentId);
  const historicalPublished = (versions.data ?? []).filter(
    v => v.status === 'PUBLISHED' && v.id !== activeAgent?.currentVersionId && v.id !== activeAgent?.currentVersion?.id,
  );
  return <section className="lab-section" aria-label="已发布版本回滚">
    <div className="lab-section-head"><div><h2>已发布版本回滚（秒级止血）</h2><p>仅允许切换到历史上已通过门禁的 PUBLISHED 版本；立即更新消费端生效快照并留痕审计，不触发模型调用。</p></div></div>
    <label>选择 Agent<select value={selectedAgentId} onChange={event => { setSelectedAgentId(event.target.value); setConfirmVersionId(''); setRollbackNotice(''); rollback.reset(); }}><option value="">请选择需要检查回滚的 Agent</option>{agents.data?.map(agent => <option key={agent.id} value={agent.id}>{agent.name} · {agent.key}（当前：{agent.currentVersion?.version ?? '未发布'}）</option>)}</select></label>
    {agents.isError && <p role="alert">{diagnosticText(agents.error instanceof Error ? agents.error.message : '无法读取 Agent 列表')}</p>}
    {selectedAgentId && versions.isPending && <p role="status">正在读取历史发布版本…</p>}
    {selectedAgentId && versions.isError && <p role="alert">{diagnosticText(versions.error instanceof Error ? versions.error.message : '无法读取版本列表')}</p>}
    {selectedAgentId && !versions.isPending && !versions.isError && !historicalPublished.length && <p className="trace-muted">该 Agent 暂无其他可回滚的历史已发布版本。</p>}
    {historicalPublished.length > 0 && <div className="lab-list">{historicalPublished.map(ver => <article className="lab-row" key={ver.id}>
      <div><p>PUBLISHED · 历史可回滚版本</p><h3>{ver.version}</h3><p>发布时间：{ver.publishedAt ? new Date(ver.publishedAt).toLocaleString() : new Date(ver.createdAt).toLocaleString()}</p></div>
      <div>{confirmVersionId === ver.id
        ? <><button type="button" className="agent-command" disabled={rollback.isPending} onClick={() => rollback.mutate({ agentId: selectedAgentId, versionId: ver.id })}>{rollback.isPending ? '回滚中…' : '确认回滚'}</button><button type="button" disabled={rollback.isPending} onClick={() => setConfirmVersionId('')}>取消</button></>
        : <button type="button" disabled={rollback.isPending} onClick={() => { setConfirmVersionId(ver.id); setRollbackNotice(''); rollback.reset(); }}>回滚到此版本</button>}</div>
    </article>)}</div>}
    {rollback.isError && <p role="alert">{diagnosticText(rollback.error instanceof Error ? rollback.error.message : '回滚失败')}</p>}
    {rollbackNotice && <p role="status">{rollbackNotice}</p>}
  </section>;
}

function ReleaseWorkspace({ runs, decisions, recordDecision }: {
  runs: LabRun[];
  decisions: LabDashboard['decisions'];
  recordDecision: { isPending: boolean; variables?: { runId: string }; mutate: (input: { runId: string; decision: string; rationaleCode: string }) => void };
}) {
  return <div className="agent-page-grid">
    <PublishedVersionRollback />
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
    <div className="lab-pagination"><span>{data.total} 条</span><button className="icon-command" title="上一页" aria-label="上一页" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>‹</button><button className="icon-command" title="下一页" aria-label="下一页" disabled={!data.hasMore} onClick={() => onPage(data.page + 1)}>›</button></div>
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

function McpWorkspace({ data, health, toggle, checks, operationBusy }: {
  data: { servers: Server[]; runningCount: number; count: number };
  health: { isPending: boolean; variables?: string; mutate: (name: string) => void };
  toggle: { isPending: boolean; variables?: { toolName: string; enabled: boolean }; mutate: (input: { toolName: string; enabled: boolean }) => void };
  checks: Record<string, { ok: boolean; error?: string; latencyMs: number; at: string }>;
  operationBusy: boolean;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [confirmOff, setConfirmOff] = useState('');
  const busy = operationBusy || health.isPending || toggle.isPending;
  const visible = data.servers.filter(server => (!filter || (filter === 'enabled' ? server.enabled : !server.enabled)) && `${server.name} ${server.displayName ?? ''} ${server.description ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="mcp-workspace mcp-governance">
    <div className="mcp-overview"><div><p className="agent-eyebrow">当前 API 进程</p><h2>工具可用性与访问控制</h2><p>启用开关、执行器绑定与检查结果分别展示，便于定位工具不能调用的原因。</p></div><div className="mcp-count"><strong>{data.runningCount} / {data.count}</strong><span>已启用且执行绑定就绪</span></div></div>
    <details className="mcp-scope"><summary>操作范围与持久性</summary><p>开关仅作用于当前 API 进程，会影响该进程服务的所有组织；不会同步其他实例。重新加载配置保留当前开关，API 重启后恢复配置文件默认值。关闭会阻止后续工具调用，不会取消已经开始的调用。</p></details>
    <div className="mcp-filterbar"><label>查找工具<input value={search} onChange={e => setSearch(e.target.value)} placeholder="名称、key 或用途"/></label><label>启用状态<select value={filter} onChange={e => setFilter(e.target.value)}><option value="">全部工具</option><option value="enabled">已启用</option><option value="disabled">已关闭</option></select></label><span>{visible.length} 个匹配工具</span></div>
    <div className="mcp-card-grid">{visible.map(server => {
      const healthBusy = health.isPending && health.variables === server.name;
      const toggleBusy = toggle.isPending && toggle.variables?.toolName === server.name;
      const check = checks[server.name];
      return <article className="mcp-tool-card" key={server.name}>
        <div className="mcp-card-heading"><span className="mcp-tool-icon"><SlidersHorizontal size={19}/></span><div><h3>{server.displayName || server.name}</h3><code>{server.name}</code></div><span className={`mcp-enabled-label ${server.enabled ? 'is-enabled' : ''}`}>{server.enabled ? '已启用' : '已关闭'}</span></div>
        <p className="mcp-description">{server.description || '尚未填写用途'}</p>
        <dl className="mcp-properties"><div><dt>连接方式</dt><dd>{server.transport || '未记录'}</dd></div><div><dt>服务状态</dt><dd>{server.status}</dd></div><div><dt>执行器</dt><dd>{server.executable === true ? '已绑定' : server.executable === false ? '未绑定' : '未记录'}</dd></div><div><dt>最近检查</dt><dd>{check?.at || (server.lastHealthCheck ? new Date(server.lastHealthCheck).toLocaleString() : '尚未检查')}</dd></div></dl>
        {server.errorMessage && <p className="mcp-check-result is-error">{diagnosticText(server.errorMessage)}</p>}
        {check && <div role={check.ok ? 'status' : 'alert'} className={`mcp-check-result ${check.ok ? '' : 'is-error'}`}><strong>{check.ok ? '执行绑定检查通过' : '检查未通过'}</strong><span>{check.ok ? '依赖与实际业务调用仍需单独验证。' : diagnosticText(check.error || '尚未确认可调用性')}</span><small>{check.at} · {check.latencyMs} ms</small></div>}
        {confirmOff === server.name && <div className="mcp-disable-confirm" role="group" aria-label={`确认关闭工具：${server.displayName || server.name}`}><p>关闭会阻止当前进程所有组织后续调用此工具，已开始的调用不会撤回。</p><button type="button" disabled={busy} onClick={() => { setConfirmOff(''); toggle.mutate({ toolName: server.name, enabled: false }); }}>确认关闭</button><button type="button" disabled={busy} onClick={() => setConfirmOff('')}>取消</button></div>}
        <div className="mcp-actions"><button type="button" aria-label={`检查工具：${server.displayName || server.name}`} disabled={busy || !server.enabled} onClick={() => health.mutate(server.name)}><Activity size={15} className={healthBusy ? 'spin' : ''}/>{healthBusy ? '检查中…' : '检查连接'}</button><button type="button" disabled={busy} onClick={() => { if (server.enabled) setConfirmOff(server.name); else toggle.mutate({ toolName: server.name, enabled: true }); }}>{server.enabled ? <ToggleRight size={18}/> : <ToggleLeft size={18}/>} {toggleBusy ? '处理中' : server.enabled ? '本进程关闭' : '本进程启用'}</button></div>
      </article>;
    })}</div>
    {!visible.length && <div className="lab-empty"><Search size={22}/><h2>{data.servers.length ? '没有匹配的工具' : '当前没有工具配置'}</h2><p>{data.servers.length ? '调整名称或启用状态筛选。' : '请检查服务端 MCP 注册配置，再刷新本进程状态。'}</p></div>}
  </section>;
}

function AdminAccess({ expired = false }: { expired?: boolean }) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [error, setError] = useState(expired ? '登录已过期，请重新登录。' : '');
  const [notice, setNotice] = useState(() => {
    if (sessionStorage.getItem('ia-password-changed') !== '1') return '';
    sessionStorage.removeItem('ia-password-changed');
    return '密码已修改，请使用新密码登录。';
  });
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<'login' | 'register' | 'login-code' | 'claim' | 'claim-code' | 'forgot' | 'reset'>('login');
  const requestRegistrationCode = async () => {
    setPending(true); setError(''); setNotice('');
    try {
      const availability = await fetch(`/api/auth/check/${encodeURIComponent(userId)}`);
      const checked = await availability.json();
      if (!availability.ok || checked.available !== true) throw new Error(checked.reason || '用户名不可用，请使用已有账号登录或找回密码。');
      const response = await fetch('/api/auth/registration-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || '验证码发送失败');
      setChallengeId(data.challengeId); setNotice('如果邮箱可用于注册，验证码已发送，请查收邮箱。如已注册，请返回登录或找回密码。');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '验证码发送失败'); }
    finally { setPending(false); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(''); setNotice('');
    try {
      const path = mode === 'register' ? 'register' : mode === 'login' ? 'login' : mode === 'login-code' ? 'login/verify-email' : mode === 'claim' ? 'login/claim-email' : mode === 'claim-code' ? 'login/claim-email/verify' : mode === 'forgot' ? 'password-reset/request' : 'password-reset/complete';
      const body = mode === 'register' ? { userId, email, password, challengeId, code }
        : mode === 'login' ? { userId, password }
          : mode === 'login-code' ? { challengeId, code }
            : mode === 'claim' ? { userId, password, email }
              : mode === 'claim-code' ? { userId, email, challengeId, code }
                : mode === 'forgot' ? { email } : { email, challengeId, code, newPassword };
      const response = await fetch(`/api/auth/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || '认证失败');
      if (mode === 'register') {
        setMode('login'); setPassword(''); setCode(''); setChallengeId('');
        setNotice(data.role === 'ADMIN' ? '邮箱已验证，管理员账号已创建，请登录。' : '账号已创建但未获得管理员权限。');
        return;
      }
      if (mode === 'login' && data.requiresEmailClaim) { setMode('claim'); setNotice('这是旧账号，请用原密码绑定并验证可收信邮箱。'); return; }
      if (mode === 'login' && data.requiresEmailVerification) { setChallengeId(data.challengeId); setMode('login-code'); setNotice(`验证码已发送至 ${data.maskedEmail}。`); return; }
      if (mode === 'claim') { setChallengeId(data.challengeId); setMode('claim-code'); setNotice(`验证码已发送至 ${data.maskedEmail}。`); return; }
      if (mode === 'forgot') { setChallengeId(data.challengeId); setMode('reset'); setNotice('若该邮箱已注册且邮件服务正常，验证码会发送到该邮箱。'); return; }
      if (mode === 'reset') { setPassword(''); setNewPassword(''); setCode(''); setMode('login'); setNotice('密码已重置，请使用新密码登录。'); return; }
      if (data.role !== 'ADMIN') throw new Error('当前账号尚未获得 Agent Lab 管理员权限，请联系部署管理员。');
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
  const title = mode === 'register' ? '创建管理员账号' : mode === 'login-code' ? '验证登录邮箱' : mode === 'claim' || mode === 'claim-code' ? '绑定旧账号邮箱' : mode === 'forgot' || mode === 'reset' ? '找回密码' : '进入控制台';
  return <main className="agent-access"><section><div className="agent-access-mark"><Bot size={22}/></div><p className="agent-eyebrow">AGENT LAB / CONTROL PLANE</p><h1>{title}</h1><p>管理员账号由部署允许名单授予。注册时验证邮箱，之后使用用户名和密码登录。</p><form onSubmit={submit}>
    {mode !== 'login-code' && mode !== 'claim-code' && mode !== 'reset' && mode !== 'forgot' && <label>用户名<input value={userId} onChange={(event) => setUserId(event.target.value.toLowerCase())} autoComplete="username" required /></label>}
    {(mode === 'login' || mode === 'register' || mode === 'claim') && <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} maxLength={128} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required /></label>}
    {(mode === 'register' || mode === 'claim' || mode === 'claim-code' || mode === 'forgot') && <label>邮箱<input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setChallengeId(''); setCode(''); }} maxLength={254} autoComplete="email" required /></label>}
    {mode === 'register' && <><button type="button" className="text-command" onClick={requestRegistrationCode} disabled={pending || !email}>{pending ? '正在发送…' : challengeId ? '重新发送邮箱验证码' : '发送邮箱验证码'}</button>{challengeId && <label>邮箱验证码<input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required /></label>}</>}
    {(mode === 'login-code' || mode === 'claim-code' || mode === 'reset') && <label>邮箱验证码<input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required /></label>}
    {mode === 'reset' && <label>新密码<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={12} maxLength={128} autoComplete="new-password" required /></label>}
    {(mode === 'login-code' || mode === 'claim-code') && <button type="button" className="text-command" onClick={() => { setMode(mode === 'login-code' ? 'login' : 'claim'); setChallengeId(''); setCode(''); setError(''); setNotice('请再次提交账号密码以发送新验证码。'); }}>重新发送验证码</button>}
    {mode === 'reset' && <button type="button" className="text-command" onClick={() => { setMode('forgot'); setChallengeId(''); setCode(''); setNewPassword(''); setError(''); setNotice('请重新请求找回验证码。'); }}>重新发送验证码</button>}
    {notice && <p role="status">{notice}</p>}{error && <p className="agent-error" role="alert">{error}</p>}
    {(mode !== 'register' || challengeId) && <button disabled={pending}>{pending ? '处理中' : mode === 'register' ? '验证并创建账号' : mode === 'login' ? '登录' : mode === 'login-code' || mode === 'claim-code' ? '验证并登录' : mode === 'claim' ? '发送绑定验证码' : mode === 'forgot' ? '发送找回验证码' : '重置密码'}</button>}
    {mode === 'login' && <button type="button" className="text-command" onClick={() => { setMode('forgot'); setError(''); }}>忘记密码？</button>}
    {(mode === 'login' || mode === 'register') && <button type="button" className="text-command" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setNotice(''); setChallengeId(''); setCode(''); }}>{mode === 'register' ? '已有账号，返回登录' : '创建管理员账号'}</button>}
    {mode !== 'login' && mode !== 'register' && <button type="button" className="text-command" onClick={() => { setMode('login'); setError(''); setNotice(''); setChallengeId(''); setCode(''); }}>返回登录</button>}
  </form></section><aside><p>CONTROLLED OPERATIONS</p><strong>运行、MCP、评测与发布。</strong><span>未配置的控制面能力不会显示虚构运行数据。</span></aside></main>;
}

export function LabSessionGate() {
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
