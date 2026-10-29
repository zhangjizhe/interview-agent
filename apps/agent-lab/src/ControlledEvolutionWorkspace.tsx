import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import './controlled-evolution.css';
import { api } from './api';
import { acquireEvaluationRequest, confirmEvaluationRequest, requireEvaluationReceipt } from './evaluation-receipt';

type AgentVersion = {
  id: string;
  version: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
};

type Agent = {
  id: string;
  key: string;
  name: string;
  currentVersion?: AgentVersion | null;
};

type QualityEvidence = {
  kind?: string;
  scope?: string;
  contractHash?: string;
  notAssessed?: string[];
  assertionCount?: number;
  passed?: number;
  failed?: number;
  unavailable?: number;
  semanticQuality?: string;
};

const BUSINESS_CONTRACT_VERSION = 'business-assertions/v1';
const BUSINESS_CASE_EXAMPLE = JSON.stringify({
  contractVersion: BUSINESS_CONTRACT_VERSION,
  assertions: [
    { id: 'score-range', source: 'response-json', op: 'number-range', path: ['score'], minimum: 0, maximum: 1 },
    { id: 'decision', source: 'response-json', op: 'equals', path: ['decision'], expected: 'FOLLOW_UP' },
  ],
}, null, 2);

function parseCaseContract(text: string): Record<string, unknown> {
  if (text.length > 32768) throw new Error('业务断言 JSON 不能超过 32768 个字符。');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('业务断言 JSON 格式无效，请检查引号、逗号和括号。'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('业务断言 JSON 必须是对象。');
  const contract = value as Record<string, unknown>;
  if (contract.contractVersion !== BUSINESS_CONTRACT_VERSION || !Array.isArray(contract.assertions) || contract.assertions.length === 0) {
    throw new Error('业务断言需要 contractVersion: business-assertions/v1 和非空 assertions 数组。');
  }
  return contract;
}

function QualityEvidenceSummary({ evidence }: { evidence?: QualityEvidence }) {
  return <div className="evolution-quality-evidence">
    <p>{evidence?.kind === 'deterministic-business-contract' ? '确定性业务合同证据' : evidence?.kind === 'contract-smoke' ? '冒烟检查证据' : '证据范围未记录'}</p>
    <p>语义质量未评估；这些断言不能证明题目、追问或评分的语义正确性。</p>
    {evidence?.scope && <p>检查范围：{evidence.scope}</p>}
    {evidence?.contractHash && <p>合同指纹：{evidence.contractHash}</p>}
    {typeof evidence?.assertionCount === 'number' && <p>断言 {evidence.assertionCount} · 通过 {evidence.passed ?? '未记录'} · 失败 {evidence.failed ?? '未记录'} · 不可评测 {evidence.unavailable ?? '未记录'}</p>}
  </div>;
}

type AssertionResult = { id: string; passed: boolean; reason: string; evidence?: { runId?: string; seq?: number; eventType?: string; path?: string[]; actual?: unknown } };

type Evaluation = {
  id: string;
  status: string;
  score: number | null;
  failedCases: number;
  datasetId?: string;
  evaluatorId?: string;
  agentVersion: AgentVersion;
  dataset: { id: string; name: string; version: string };
  evaluator: { id: string; name: string; type: string };
  requestKey?: string | null;
  totalCases: number;
  completedSamples: number;
  cancelRequestedAt?: string | null;
  completedCases: number;
  createdAt: string;
  completedAt?: string;
  error?: string;
  metrics?: { repeatCount?: number; totalSamples?: number; cachePolicy?: string;
    budget?: { completedSamples?: number; spentCny?: number; costEvidenceStatus?: string }; qualityEvidence?: QualityEvidence };
  results?: Array<{ id: string; passed: boolean; failureMessage?: string; datasetCase?: { key: string }; metrics?: unknown; evidence?: { samples?: Array<{ assertions?: AssertionResult[] }> } }>;
};

export function ControlledEvolutionWorkspace() {
  const queryClient = useQueryClient();
  const [agentId, setAgentId] = useState('');
  const [sourceEvaluationId, setSourceEvaluationId] = useState('');
  const [candidateVersionId, setCandidateVersionId] = useState('');
  const [datasetId, setDatasetId] = useState('');
  const [evaluatorId, setEvaluatorId] = useState('');
  const [comparison, setComparison] = useState<any>(null);
  const [firstReleaseGate, setFirstReleaseGate] = useState<any>(null);
  const [feedback, setFeedback] = useState('');
  const [datasetKey, setDatasetKey] = useState('interview-regression');
  const [datasetName, setDatasetName] = useState('Interview 回归集');
  const [evaluatorKey, setEvaluatorKey] = useState('interview-business-contract');
  const [evaluatorName, setEvaluatorName] = useState('Interview 确定性业务合同');
  const [evaluatorType, setEvaluatorType] = useState<'BUSINESS_ASSERTIONS' | 'KEYWORD'>('BUSINESS_ASSERTIONS');
  const [caseContract, setCaseContract] = useState(BUSINESS_CASE_EXAMPLE);
  const [selectedEvaluationId, setSelectedEvaluationId] = useState('');
  const [caseType, setCaseType] = useState<'BUSINESS_ASSERTIONS' | 'KEYWORD'>('BUSINESS_ASSERTIONS');
  const [caseKey, setCaseKey] = useState('output-decision-contract');
  const [caseMessage, setCaseMessage] = useState('请严格返回 JSON {"score":0.5,"decision":"FOLLOW_UP"}，不添加其他文字。');
  const [caseKeywords, setCaseKeywords] = useState('问题');
  const [caseOwner, setCaseOwner] = useState('');
  const [casePrivacyConfirmed, setCasePrivacyConfirmed] = useState(false);
  const [caseJobFamily, setCaseJobFamily] = useState('ai-agent-engineer');
  const [caseSkill, setCaseSkill] = useState('agent-evaluation');
  const [caseDifficulty, setCaseDifficulty] = useState('intermediate');
  const [repeatCount, setRepeatCount] = useState(3);
  const [maxEstimatedCostCny, setMaxEstimatedCostCny] = useState(3);

  const agents = useQuery<Agent[]>({
    queryKey: ['registry-agents'],
    queryFn: () => api('/agent-lab/agents'),
  });
  useEffect(() => {
    if (!agentId && agents.data?.[0]) setAgentId(agents.data[0].id);
  }, [agentId, agents.data]);

  const versions = useQuery<AgentVersion[]>({
    queryKey: ['registry-versions', agentId],
    queryFn: () => api(`/agent-lab/agents/${agentId}/versions`),
    enabled: Boolean(agentId),
  });
  const evaluations = useQuery<Evaluation[]>({
    queryKey: ['registry-evaluations', agentId],
    refetchInterval: (query) => query.state.data?.some(item => item.status === 'PENDING' || item.status === 'RUNNING') ? 2000 : false,
    queryFn: () => api(`/agent-lab/agents/${agentId}/evaluations`),
    enabled: Boolean(agentId),
  });
  const evaluationDetails = useQuery<Evaluation>({
    queryKey: ['registry-evaluation-detail', selectedEvaluationId],
    queryFn: () => api(`/agent-lab/evaluations/${selectedEvaluationId}`),
    enabled: Boolean(selectedEvaluationId),
    refetchInterval: (query) => ['PENDING', 'RUNNING'].includes(query.state.data?.status || '') ? 2000 : false,
  });
  useEffect(() => { setSelectedEvaluationId(''); }, [agentId]);
  const datasets = useQuery<any[]>({
    queryKey: ['registry-datasets'],
    queryFn: () => api('/agent-lab/datasets'),
  });
  const datasetDetails = useQuery<any>({
    queryKey: ['registry-dataset', datasetId],
    queryFn: () => api(`/agent-lab/datasets/${datasetId}`),
    enabled: Boolean(datasetId),
  });
  const evaluators = useQuery<any[]>({
    queryKey: ['registry-evaluators'],
    queryFn: () => api('/agent-lab/evaluators'),
  });

  const selectedAgent = agents.data?.find((agent) => agent.id === agentId);
  const failedEvaluations = useMemo(
    () => (evaluations.data || []).filter((item) => item.status === 'COMPLETED' && item.failedCases > 0),
    [evaluations.data],
  );
  const draftVersions = (versions.data || []).filter((item) => item.status === 'DRAFT');
  const selectedDataset = datasets.data?.find((item) => item.id === datasetId);
  const releaseEvidenceReady = Boolean(
    selectedDataset?.frozenAt
    && selectedDataset?.contentHash
    && selectedDataset?._count?.cases >= 10
    && selectedDataset?.metadata?.review?.status === 'APPROVED'
  );

  useEffect(() => {
    if (!sourceEvaluationId && failedEvaluations[0]) setSourceEvaluationId(failedEvaluations[0].id);
    if (!candidateVersionId && draftVersions[0]) setCandidateVersionId(draftVersions[0].id);
    if (!datasetId && datasets.data?.[0]) setDatasetId(datasets.data[0].id);
    if (!evaluatorId && evaluators.data?.[0]) setEvaluatorId(evaluators.data[0].id);
  }, [candidateVersionId, datasetId, draftVersions, evaluatorId, evaluators.data, failedEvaluations, sourceEvaluationId, datasets.data]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['registry-agents'] }),
      queryClient.invalidateQueries({ queryKey: ['registry-versions', agentId] }),
      queryClient.invalidateQueries({ queryKey: ['registry-evaluations', agentId] }),
    ]);
  };

  const bootstrap = useMutation({
    mutationFn: () => api('/agent-lab/bootstrap/interview-agent', { method: 'POST' }),
    onSuccess: async () => {
      setFeedback('Interview Agent 已注册。');
      await refresh();
    },
    onError: (error: Error) => setFeedback(error.message),
  });
  const createDataset = useMutation({
    mutationFn: () => api('/agent-lab/datasets', {
      method: 'POST',
      body: JSON.stringify({ key: datasetKey, name: datasetName, version: '1.0.0' }),
    }),
    onSuccess: async (result) => {
      setDatasetId(result.id);
      setFeedback('Dataset 已创建，请添加至少一个评测 Case。');
      await queryClient.invalidateQueries({ queryKey: ['registry-datasets'] });
    },
    onError: (error: Error) => setFeedback(error.message),
  });
  const bootstrapReleaseDataset = useMutation({
    mutationFn: () => api('/agent-lab/datasets/bootstrap/interview-release-v1', { method: 'POST' }),
    onSuccess: async (result) => {
      setDatasetId(result.dataset.id);
      setEvaluatorId(result.evaluator.id);
      setFeedback(`内置发布集已就绪：${result.releaseRunPlan.cases} Cases；请逐条审查后批准。`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['registry-datasets'] }),
        queryClient.invalidateQueries({ queryKey: ['registry-evaluators'] }),
        queryClient.invalidateQueries({ queryKey: ['registry-dataset', result.dataset.id] }),
      ]);
    },
    onError: (error: Error) => setFeedback(error.message),
  });
  const createEvaluator = useMutation({
    mutationFn: () => api('/agent-lab/evaluators', {
      method: 'POST',
      body: JSON.stringify({
        key: evaluatorKey,
        name: evaluatorName,
        type: evaluatorType,
        config: evaluatorType === 'BUSINESS_ASSERTIONS' ? { contractVersion: BUSINESS_CONTRACT_VERSION } : { minScore: 100 },
      }),
    }),
    onSuccess: async (result) => {
      setEvaluatorId(result.id);
      setFeedback('Evaluator 已创建。');
      await queryClient.invalidateQueries({ queryKey: ['registry-evaluators'] });
    },
    onError: (error: Error) => setFeedback(error.message),
  });
  const addCase = useMutation({
    mutationFn: () => api(`/agent-lab/datasets/${datasetId}/cases`, {
      method: 'POST',
      body: JSON.stringify({
        key: caseKey,
        input: { message: caseMessage },
        expectedOutput: caseType === 'BUSINESS_ASSERTIONS' ? parseCaseContract(caseContract) : {
          keywords: caseKeywords.split(',').map((item) => item.trim()).filter(Boolean),
        },
        metadata: {
          provenance: { sourceType: 'maintainer-authored-synthetic', owner: caseOwner.trim(), allowedUse: 'agent-release-evaluation', containsCandidateData: false, containsPersonalData: false },
          segments: {
            jobFamily: caseJobFamily,
            skill: caseSkill,
            difficulty: caseDifficulty,
          },
        },
      }),
    }),
    onSuccess: async () => {
      setFeedback('评测 Case 已加入 Dataset。');
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['registry-datasets'] }), queryClient.invalidateQueries({ queryKey: ['registry-dataset', datasetId] })]);
    },
    onError: (error: Error) => setFeedback(error.message),
  });
  const freezeDataset = useMutation({
    mutationFn: () => api(`/agent-lab/datasets/${datasetId}/freeze`, { method: 'POST' }),
    onSuccess: async (result) => {
      setFeedback(`Dataset 已冻结，指纹 ${result.contentHash}。`);
      await queryClient.invalidateQueries({ queryKey: ['registry-datasets'] });
    },
    onError: (error: Error) => setFeedback(error.message),
  });
  const approveDataset = useMutation({
    mutationFn: () => api(`/agent-lab/datasets/${datasetId}/review`, { method: 'POST' }),
    onSuccess: async () => {
      setFeedback('Dataset 审查已由当前管理员批准，可执行有界发布评测。');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['registry-datasets'] }),
        queryClient.invalidateQueries({ queryKey: ['registry-dataset', datasetId] }),
      ]);
    },
    onError: (error: Error) => setFeedback(error.message),
  });
  const generate = useMutation({
    mutationFn: () => api(`/agent-lab/agents/${agentId}/evolution/candidates`, {
      method: 'POST',
      body: JSON.stringify({ sourceEvaluationId }),
    }),
    onSuccess: async (result) => {
      setCandidateVersionId(result.candidate.id);
      setComparison(null);
      setFeedback(`已生成草稿 ${result.candidate.version}，尚未发布。`);
      await refresh();
    },
    onError: (error: Error) => setFeedback(error.message),
  });
  const runEvaluation = useMutation({
    mutationFn: async (versionId: string) => {
      const payload = { agentVersionId: versionId, datasetId, evaluatorId, repeatCount, maxEstimatedCostCny };
      const request = acquireEvaluationRequest({ agentId, ...payload });
      const result = await api(`/agent-lab/agents/${agentId}/evaluations`, {
        method: 'POST', body: JSON.stringify({ ...payload, requestKey: request.requestKey }),
      });
      const receipt = requireEvaluationReceipt(result);
      confirmEvaluationRequest(request);
      return receipt;
    },
    onMutate: () => setComparison(null),
    onSuccess: async (result) => {
      setFeedback(`任务 ${result.id} 已${result.reused ? '复用' : '提交'}；状态 ${result.status}，可在任务列表查看真实进度。`);
      await refresh();
    },
    onError: async (error: Error) => { setFeedback(error.message); setComparison(null); await refresh(); },
  });
  const compare = useMutation({
    mutationFn: async () => {
      const query = new URLSearchParams({ datasetId, evaluatorId });
      const result = await api(`/agent-lab/agents/${agentId}/evolution/candidates/${candidateVersionId}/comparison?${query}`);
      if (result.datasetId !== datasetId || result.evaluatorId !== evaluatorId) throw new Error('比较结果与当前资产不一致，请重新比较。');
      return result;
    },
    onMutate: () => setComparison(null),
    onSuccess: (result) => { setComparison(result); setFeedback(`对比完成：${result.releaseRecommendation}。`); },
    onError: (error: Error) => { setFeedback(error.message); setComparison(null); },
  });
  const cancelEvaluation = useMutation({
    mutationFn: (id: string) => api(`/agent-lab/evaluations/${id}/cancel`, { method: 'POST' }),
    onSuccess: async () => { setFeedback('取消已受理；在途调用可能仍产生费用，等待样本边界结算。'); await refresh(); },
    onError: (error: Error) => setFeedback(error.message),
  });
  const checkFirstRelease = useMutation({
    mutationFn: async () => {
      const gate = await api(`/agent-lab/agents/${agentId}/versions/${candidateVersionId}/release-gate`);
      if (gate.expectedCurrentVersionId !== null) throw new Error('基线已改变，请刷新后执行同集对比。');
      return { gate, agentId, versionId: candidateVersionId };
    },
    onMutate: () => setFirstReleaseGate(null),
    onSuccess: result => { setFirstReleaseGate(result); setFeedback(`首次发布门禁：${result.gate.outcome.reason}`); },
    onError: (error: Error) => { setFirstReleaseGate(null); setFeedback(error.message); },
  });
  const publish = useMutation({
    mutationFn: () => api(`/agent-lab/agents/${agentId}/versions/${candidateVersionId}/publish`, { method: 'POST' }),
    onSuccess: async () => {
      setFeedback('管理员发布完成，该版本已成为当前正式版本。');
      setFirstReleaseGate(null);
      setComparison(null);
      await refresh();
    },
    onError: (error: Error) => { setFeedback(error.message); setFirstReleaseGate(null); setComparison(null); },
  });

  const activeEvaluation = evaluations.data?.some(item => item.status === 'PENDING' || item.status === 'RUNNING');
  useEffect(() => { setComparison(null); setFirstReleaseGate(null); }, [agentId, candidateVersionId, datasetId, evaluatorId, repeatCount, maxEstimatedCostCny, selectedAgent?.currentVersion?.id, activeEvaluation]);

  const busy = Boolean(activeEvaluation) || bootstrap.isPending || bootstrapReleaseDataset.isPending || createDataset.isPending || createEvaluator.isPending || addCase.isPending || freezeDataset.isPending || approveDataset.isPending || generate.isPending || runEvaluation.isPending || compare.isPending || checkFirstRelease.isPending || publish.isPending;

  return <section className="lab-panel">
    <div className="lab-section-head">
      <div><p className="agent-eyebrow">CONTROLLED EVOLUTION</p><h2>受控自进化</h2><p>失败证据生成草稿，同集评测确认无回归，管理员发布后才成为所选 Agent 的正式版本。首次发布核验单版本门禁，更新版本须同集对比。</p></div>
      <button onClick={() => bootstrap.mutate()} disabled={busy}>注册 Interview Agent</button>
    </div>

    <section className="lab-thresholds">
      <span>数据集冻结</span><span>业务切片覆盖</span><span>成对 95% 非劣效</span><span>资源回归 ≤20%</span><span>人工发布</span>
    </section>

    <details className="evolution-assets">
      <summary>配置评测资产</summary>
      <p>创建 Dataset、确定性业务合同或术语冒烟 Evaluator 和 Case。这里仅保存评测资产，不调用模型。</p>
      <div className="lab-actions">
        <button onClick={() => bootstrapReleaseDataset.mutate()} disabled={busy}>导入内置发布回归集 v1</button>
      </div>
      <div className="lab-form-grid">
        <label>Dataset key<input value={datasetKey} onChange={(event) => setDatasetKey(event.target.value)} /></label>
        <label>Dataset 名称<input value={datasetName} onChange={(event) => setDatasetName(event.target.value)} /></label>
        <button onClick={() => createDataset.mutate()} disabled={busy || !datasetKey || !datasetName}>创建 Dataset</button>
      </div>
      <div className="lab-form-grid">
        <label>Evaluator key<input value={evaluatorKey} onChange={(event) => setEvaluatorKey(event.target.value)} /></label>
        <label>Evaluator 名称<input value={evaluatorName} onChange={(event) => setEvaluatorName(event.target.value)} /></label>
        <label>评测规则<select value={evaluatorType} disabled={busy} onChange={event => setEvaluatorType(event.target.value as 'BUSINESS_ASSERTIONS' | 'KEYWORD')}><option value="BUSINESS_ASSERTIONS">确定性业务合同</option><option value="KEYWORD">关键词冒烟检查</option></select></label>
        <button onClick={() => createEvaluator.mutate()} disabled={busy || !evaluatorKey || !evaluatorName}>创建 Evaluator</button>
      </div>
      <div className="lab-form-grid">
        <label>Case 期望格式<select value={caseType} disabled={busy} onChange={event => setCaseType(event.target.value as 'BUSINESS_ASSERTIONS' | 'KEYWORD')}><option value="BUSINESS_ASSERTIONS">确定性业务合同</option><option value="KEYWORD">关键词冒烟检查</option></select></label>
        <label>Case key<input value={caseKey} onChange={(event) => setCaseKey(event.target.value)} /></label>
        <label>输入消息<input value={caseMessage} onChange={(event) => setCaseMessage(event.target.value)} /></label>
        {caseType === 'KEYWORD' && <label>必含关键词（逗号分隔）<input value={caseKeywords} onChange={(event) => setCaseKeywords(event.target.value)} /></label>}
        <label>岗位族标签<input value={caseJobFamily} onChange={(event) => setCaseJobFamily(event.target.value)} placeholder="ai-agent-engineer" /></label>
        <label>技能标签<input value={caseSkill} onChange={(event) => setCaseSkill(event.target.value)} placeholder="agent-evaluation" /></label>
        <label>难度标签<input value={caseDifficulty} onChange={(event) => setCaseDifficulty(event.target.value)} placeholder="intermediate" /></label>
      </div>
      {caseType === 'BUSINESS_ASSERTIONS' && <div>
        <label>业务断言 JSON<textarea rows={12} maxLength={32768} value={caseContract} onChange={event => setCaseContract(event.target.value)} /></label>
        <p>范例用于检查结构化输出合同，不代表真实面试质量样本。Case 期望格式须与执行时选择的 Evaluator 一致。范例检查 response 中 JSON 的 score 范围和 decision 值；请按输入任务修改期望。逐项断言必须全部通过，不支持任意代码或正则。服务端在运行前核验合同。</p>
        <button disabled={busy} onClick={() => setCaseContract(BUSINESS_CASE_EXAMPLE)}>恢复业务断言范例</button>
      </div>}
      <label>Case 责任人<input maxLength={120} value={caseOwner} onChange={event => setCaseOwner(event.target.value)} /></label>
      <label className="evolution-confirm"><input type="checkbox" checked={casePrivacyConfirmed} onChange={event => setCasePrivacyConfirmed(event.target.checked)} />我确认该 Case 为自编合成样本，不含候选人或个人数据，允许用于发布评测。</label>
      <div className="lab-actions">
        <button onClick={() => addCase.mutate()} disabled={busy || !datasetId || selectedDataset?.frozenAt || !caseKey || !caseMessage || !caseOwner.trim() || !casePrivacyConfirmed || (caseType === 'KEYWORD' ? !caseKeywords : !caseContract.trim()) || !caseJobFamily || !caseSkill || !caseDifficulty}>添加 Case 到当前 Dataset</button>
        <button onClick={() => freezeDataset.mutate()} disabled={busy || !datasetId || selectedDataset?.frozenAt}>冻结当前 Dataset</button>
      </div>
      {datasetDetails.data && <details className="evolution-assets">
        <summary>审查当前 Dataset · {datasetDetails.data.cases?.length || 0} Cases · {datasetDetails.data.metadata?.review?.status || 'PENDING'}</summary>
        <p>批准表示当前管理员已核对输入、期望断言、业务切片、来源与无个人数据声明。批准记录不修改冻结内容指纹。</p>
        {datasetDetails.data.cases?.map((item: any) => <article className="lab-row" key={item.id}>
          <div><h3>{item.key}</h3><p>{item.input?.message}</p></div>
          <div className="lab-row-metrics">
            <span>来源 {item.metadata?.provenance?.sourceType || '未声明'}</span>{item.expectedOutput?.contractVersion === BUSINESS_CONTRACT_VERSION ? <details><summary>业务断言合同</summary><pre>{JSON.stringify(item.expectedOutput, null, 2)}</pre></details> : <span>关键词 {(item.expectedOutput?.keywords || []).join('、')}</span>}
            <span>{item.metadata?.segments?.skill}</span>
            <span>{item.metadata?.segments?.difficulty}</span>
            <span>{item.metadata?.provenance?.containsPersonalData === false ? '无个人数据（声明）' : item.metadata?.provenance?.containsPersonalData === true ? '含个人数据' : '隐私未声明'}</span>
          </div>
        </article>)}
        <button onClick={() => approveDataset.mutate()} disabled={busy || !datasetId || !selectedDataset?.frozenAt || selectedDataset?.metadata?.review?.status === 'APPROVED'}>管理员批准当前 Dataset</button>
      </details>}
    </details>

    <div className="lab-form-grid">
      <label>Agent<select value={agentId} disabled={busy} onChange={(event) => { setAgentId(event.target.value); setCandidateVersionId(''); setSourceEvaluationId(''); setComparison(null); }}><option value="">选择 Agent</option>{agents.data?.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.currentVersion?.version || '无当前版本'}</option>)}</select></label>
      <label>失败评测<select value={sourceEvaluationId} onChange={(event) => setSourceEvaluationId(event.target.value)}><option value="">选择失败评测</option>{failedEvaluations.map((item) => <option key={item.id} value={item.id}>{item.agentVersion.version} · {item.dataset.name} · 失败 {item.failedCases}</option>)}</select></label>
      <button onClick={() => generate.mutate()} disabled={busy || !agentId || !sourceEvaluationId}>生成草稿候选</button>
    </div>

    <div className="lab-form-grid">
      <label>候选版本<select value={candidateVersionId} disabled={busy} onChange={(event) => { setCandidateVersionId(event.target.value); setComparison(null); }}><option value="">选择草稿</option>{draftVersions.map((version) => <option key={version.id} value={version.id}>{version.version}</option>)}</select></label>
      <label>Dataset<select value={datasetId} disabled={busy} onChange={(event) => setDatasetId(event.target.value)}><option value="">选择 Dataset</option>{datasets.data?.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.version} · {item.frozenAt ? '已冻结' : '可编辑'}</option>)}</select></label>
      <label>Evaluator<select value={evaluatorId} disabled={busy} onChange={(event) => setEvaluatorId(event.target.value)}><option value="">选择 Evaluator</option>{evaluators.data?.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.type}</option>)}</select></label>
      <label>重复次数<select value={repeatCount} disabled={busy} onChange={(event) => setRepeatCount(Number(event.target.value))}><option value={3}>3 次</option><option value={4}>4 次</option><option value={5}>5 次</option></select></label>
      <label>成本停止阈值（CNY）<input type="number" min="0.01" max="100" step="0.01" value={maxEstimatedCostCny} disabled={busy} onChange={(event) => setMaxEstimatedCostCny(Number(event.target.value))} /></label>
    </div>

    {selectedDataset && <p>计划样本：{selectedDataset._count?.cases || 0} Cases × {repeatCount} 次 = {(selectedDataset._count?.cases || 0) * repeatCount} 个样本/版本；单版本达到 ¥{maxEstimatedCostCny.toFixed(2)} 时停止后续样本；在途样本可能超出阈值。</p>}

    <div className="lab-actions">
      <button onClick={() => selectedAgent?.currentVersion && runEvaluation.mutate(selectedAgent.currentVersion.id)} disabled={busy || !selectedAgent?.currentVersion || !datasetId || !evaluatorId || !releaseEvidenceReady}>评测当前基线</button>
      <button onClick={() => runEvaluation.mutate(candidateVersionId)} disabled={busy || !candidateVersionId || !datasetId || !evaluatorId || !releaseEvidenceReady}>评测候选</button>
      <button onClick={() => compare.mutate()} disabled={busy || !selectedAgent?.currentVersion || !candidateVersionId || !datasetId || !evaluatorId}>同集对比</button>
      {selectedAgent && !selectedAgent.currentVersion && <button onClick={() => checkFirstRelease.mutate()} disabled={busy || !candidateVersionId}>核验首次发布门禁</button>}
      <button onClick={() => publish.mutate()} disabled={busy || (selectedAgent?.currentVersion ? comparison?.releaseRecommendation !== 'APPROVE' : !(firstReleaseGate?.agentId === agentId && firstReleaseGate?.versionId === candidateVersionId && firstReleaseGate?.gate.outcome.allowed === true))}>管理员发布</button>
    </div>

    {selectedDataset && !releaseEvidenceReady && <p className="lab-feedback">发布评测要求 Dataset 已冻结、至少 10 个带完整业务切片的 Case，并由管理员逐条审查批准。</p>}

    {firstReleaseGate && <p>发布范围：{firstReleaseGate.gate.outcome.acceptanceScope || '未记录'}；语义质量未评估。</p>}
    {comparison && <article className="lab-row">
      <div><p className={`decision-${comparison.releaseRecommendation.toLowerCase()}`}>{comparison.releaseRecommendation}</p><h2>同集评测结果</h2><p>Dataset {comparison.datasetId} · Evaluator {comparison.evaluatorId}</p></div>
      <div>{comparison.reasons?.map((reason: string) => <p className="evolution-rejection" key={reason}>{reason}</p>)}<p>以下是所选规则的原始分数；发布门拒绝时不能作为有效发布依据。语义质量未评估。</p></div>
      <div className="lab-row-metrics"><span>基线 {comparison.baseline.score}</span><span>候选 {comparison.candidate.score}</span><span>变化 {comparison.scoreDelta >= 0 ? '+' : ''}{comparison.scoreDelta}</span><span>发布证据 {comparison.releaseGate.ruleSetVersion}</span><span>发布范围 {comparison.releaseGate.outcome?.acceptanceScope || '未记录'}</span>{comparison.releaseGate.evidence?.statisticalComparison && <span>95% 下界 {comparison.releaseGate.evidence.statisticalComparison.lowerConfidenceBoundPoints ?? '不可用'} · 配对 {comparison.releaseGate.evidence.statisticalComparison.pairedCaseCount}</span>}</div>
    </article>}
    <section className="evolution-jobs" aria-label="评测任务与证据">
      <div><p className="agent-eyebrow">EVALUATION EVIDENCE</p><h3>评测任务与证据</h3><p>来自当前工作区的持久化运行；确定性业务合同检查字段与必要事件；术语冒烟仅检查关键词。语义质量未评估。</p></div>
      {evaluations.isError && <p role="alert">评测记录暂不可用，请刷新；不会展示伪造进度。</p>}
      {evaluations.data?.length === 0 && <p>尚无评测记录。提交有界任务后，进度与证据会在这里更新。</p>}
      {evaluations.data?.slice(0, 6).map(item => {
        const samples = item.requestKey ? item.completedSamples : item.metrics?.budget?.completedSamples ?? (item.status === 'COMPLETED' ? item.metrics?.totalSamples : null);
        const total = item.metrics?.totalSamples ?? (item.metrics?.repeatCount ? item.totalCases * item.metrics.repeatCount : null);
        const completed = samples ?? 0;
        return <article key={item.id} className="evolution-job">
          <div className="evolution-job-head"><strong>{item.agentVersion.version} · {item.dataset.name}</strong><span className={`evolution-status status-${item.status.toLowerCase()}`}>{item.status}</span></div>
          <p>{item.id} · {item.evaluator.name}</p>
          <div className="evolution-job-metrics"><span>样本 {samples ?? '未记录'}/{total ?? '总数未记录'}</span><span>得分 {item.score == null ? '—' : item.score.toFixed(1)}</span><span>费用小计 {typeof item.metrics?.budget?.spentCny === 'number' ? `¥${item.metrics.budget.spentCny.toFixed(6)}` : '未核验'}</span></div>
          <QualityEvidenceSummary evidence={item.metrics?.qualityEvidence} />
          <button onClick={() => setSelectedEvaluationId(item.id)}>查看 {item.id} 的逐项证据</button>
          <progress aria-label="已完成样本" max={Math.max(total ?? completed, 1)} value={total == null || samples == null ? undefined : completed} />
          {(item.status === 'PENDING' || item.status === 'RUNNING') && <button disabled={Boolean(item.cancelRequestedAt) || cancelEvaluation.isPending} onClick={() => cancelEvaluation.mutate(item.id)}>{item.cancelRequestedAt ? '等待停止与结算' : '取消后续样本'}</button>}
          {item.error && <p className="evolution-rejection">{item.error}</p>}
          {item.metrics?.budget?.costEvidenceStatus === 'unavailable' && <p className="evolution-rejection">中断费用未知；以上仅为已核验样本小计。</p>}
          {item.status === 'COMPLETED' && item.metrics?.cachePolicy !== 'semantic-cache-bypass/v1' && <p>旧运行缺少答案缓存隔离证据，不能作为发布质量依据。</p>}
          <time dateTime={item.createdAt}>提交于 {new Date(item.createdAt).toLocaleString('zh-CN')}</time>
        </article>;
      })}
    </section>
    {selectedEvaluationId && <section aria-label="逐项断言证据" className="evolution-job">
      <h3>逐项断言证据 · {selectedEvaluationId}</h3>
      {evaluationDetails.isLoading && <p>正在读取持久化证据…</p>}
      {evaluationDetails.isError && <p role="alert">{evaluationDetails.error.message}</p>}
      {evaluationDetails.data && <>
        <QualityEvidenceSummary evidence={evaluationDetails.data.metrics?.qualityEvidence} />
        {!evaluationDetails.data.results?.length && <p>尚无逐项结果；不表示断言已通过。</p>}
        {evaluationDetails.data.results?.map(result => <article key={result.id}>
          <h4>{result.datasetCase?.key || result.id} · {result.passed ? '通过' : '未通过'}</h4>
          {result.failureMessage && <p className="evolution-rejection">{result.failureMessage}</p>}
          {result.evidence?.samples?.map((sample, index) => <section key={index} aria-label={`样本 ${index + 1} 断言`}>
            <h5>样本 {index + 1}</h5>
            {!sample.assertions?.length && <p>该样本未记录业务断言，不表示通过。</p>}
            <ul>{sample.assertions?.map(assertion => <li key={assertion.id}>
              <strong>{assertion.id} · {assertion.passed ? '通过' : '未通过'}</strong>：{assertion.reason}
              {assertion.evidence?.runId && <p>Trace 引用：{assertion.evidence.runId}{assertion.evidence.seq == null ? '' : ` #${assertion.evidence.seq}`}{assertion.evidence.eventType ? ` · ${assertion.evidence.eventType}` : ''}</p>}
            </li>)}</ul>
          </section>)}
          <details><summary>原始断言证据</summary><pre>{JSON.stringify({ metrics: result.metrics, evidence: result.evidence }, null, 2)}</pre></details>
        </article>)}
      </>}
    </section>}
    {feedback && <p role="status" className="lab-feedback">{feedback}</p>}
  </section>;
}
