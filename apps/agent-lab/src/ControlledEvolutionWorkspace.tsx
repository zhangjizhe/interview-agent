import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import './controlled-evolution.css';

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
};

const token = () => localStorage.getItem('ia_access_token');

async function api(path: string, init?: RequestInit) {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
      Authorization: `Bearer ${token() || ''}`,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `HTTP ${response.status}`);
  return body;
}

export function ControlledEvolutionWorkspace() {
  const queryClient = useQueryClient();
  const [agentId, setAgentId] = useState('');
  const [sourceEvaluationId, setSourceEvaluationId] = useState('');
  const [candidateVersionId, setCandidateVersionId] = useState('');
  const [datasetId, setDatasetId] = useState('');
  const [evaluatorId, setEvaluatorId] = useState('');
  const [comparison, setComparison] = useState<any>(null);
  const [feedback, setFeedback] = useState('');
  const [datasetKey, setDatasetKey] = useState('interview-regression');
  const [datasetName, setDatasetName] = useState('Interview 回归集');
  const [evaluatorKey, setEvaluatorKey] = useState('interview-keywords');
  const [evaluatorName, setEvaluatorName] = useState('Interview 关键词检查');
  const [caseKey, setCaseKey] = useState('job-relevance');
  const [caseMessage, setCaseMessage] = useState('请提出一道与当前岗位直接相关的面试题。');
  const [caseKeywords, setCaseKeywords] = useState('问题');
  const [caseJobFamily, setCaseJobFamily] = useState('ai-agent-engineer');
  const [caseSkill, setCaseSkill] = useState('agent-evaluation');
  const [caseDifficulty, setCaseDifficulty] = useState('intermediate');
  const [repeatCount, setRepeatCount] = useState(3);
  const [maxEstimatedCostCny, setMaxEstimatedCostCny] = useState(5);

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
    queryFn: () => api(`/agent-lab/agents/${agentId}/evaluations`),
    enabled: Boolean(agentId),
  });
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
        type: 'KEYWORD',
        config: { minScore: 100 },
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
        expectedOutput: {
          keywords: caseKeywords.split(',').map((item) => item.trim()).filter(Boolean),
        },
        metadata: {
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
      await queryClient.invalidateQueries({ queryKey: ['registry-datasets'] });
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
    mutationFn: (versionId: string) => api(`/agent-lab/agents/${agentId}/evaluations`, {
      method: 'POST',
      body: JSON.stringify({
        agentVersionId: versionId,
        datasetId,
        evaluatorId,
        repeatCount,
        maxEstimatedCostCny,
      }),
    }),
    onSuccess: async (result) => {
      setFeedback(`评测完成：${result.score?.toFixed?.(1) ?? result.score ?? 0} 分。`);
      setComparison(null);
      await refresh();
    },
    onError: (error: Error) => setFeedback(error.message),
  });
  const compare = useMutation({
    mutationFn: () => api(`/agent-lab/agents/${agentId}/evolution/candidates/${candidateVersionId}/comparison`),
    onSuccess: (result) => {
      setComparison(result);
      setFeedback(`对比完成：${result.releaseRecommendation}。`);
    },
    onError: (error: Error) => setFeedback(error.message),
  });
  const publish = useMutation({
    mutationFn: () => api(`/agent-lab/agents/${agentId}/versions/${candidateVersionId}/publish`, { method: 'POST' }),
    onSuccess: async () => {
      setFeedback('管理员发布完成，Interview 将从下一回合使用该版本。');
      setComparison(null);
      await refresh();
    },
    onError: (error: Error) => setFeedback(error.message),
  });

  const busy = bootstrap.isPending || bootstrapReleaseDataset.isPending || createDataset.isPending || createEvaluator.isPending || addCase.isPending || freezeDataset.isPending || approveDataset.isPending || generate.isPending || runEvaluation.isPending || compare.isPending || publish.isPending;

  return <section className="lab-panel">
    <div className="lab-section-head">
      <div><p className="agent-eyebrow">CONTROLLED EVOLUTION</p><h2>受控自进化</h2><p>失败证据生成草稿，同集评测确认无回归，管理员发布后才作用于 Interview。</p></div>
      <button onClick={() => bootstrap.mutate()} disabled={busy}>注册 Interview Agent</button>
    </div>

    <section className="lab-thresholds">
      <span>数据集冻结</span><span>业务切片覆盖</span><span>成对 95% 非劣效</span><span>资源回归 ≤20%</span><span>人工发布</span>
    </section>

    <details className="evolution-assets">
      <summary>配置评测资产</summary>
      <p>创建 Dataset、关键词 Evaluator 和 Case。这里仅写入测试资产，不调用模型。</p>
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
        <button onClick={() => createEvaluator.mutate()} disabled={busy || !evaluatorKey || !evaluatorName}>创建 Evaluator</button>
      </div>
      <div className="lab-form-grid">
        <label>Case key<input value={caseKey} onChange={(event) => setCaseKey(event.target.value)} /></label>
        <label>输入消息<input value={caseMessage} onChange={(event) => setCaseMessage(event.target.value)} /></label>
        <label>必含关键词（逗号分隔）<input value={caseKeywords} onChange={(event) => setCaseKeywords(event.target.value)} /></label>
        <label>岗位族标签<input value={caseJobFamily} onChange={(event) => setCaseJobFamily(event.target.value)} placeholder="ai-agent-engineer" /></label>
        <label>技能标签<input value={caseSkill} onChange={(event) => setCaseSkill(event.target.value)} placeholder="agent-evaluation" /></label>
        <label>难度标签<input value={caseDifficulty} onChange={(event) => setCaseDifficulty(event.target.value)} placeholder="intermediate" /></label>
      </div>
      <div className="lab-actions">
        <button onClick={() => addCase.mutate()} disabled={busy || !datasetId || selectedDataset?.frozenAt || !caseKey || !caseMessage || !caseKeywords || !caseJobFamily || !caseSkill || !caseDifficulty}>添加 Case 到当前 Dataset</button>
        <button onClick={() => freezeDataset.mutate()} disabled={busy || !datasetId || selectedDataset?.frozenAt}>冻结当前 Dataset</button>
      </div>
      {datasetDetails.data && <details className="evolution-assets">
        <summary>审查当前 Dataset · {datasetDetails.data.cases?.length || 0} Cases · {datasetDetails.data.metadata?.review?.status || 'PENDING'}</summary>
        <p>批准表示当前管理员已核对输入、期望关键词、业务切片、来源与无个人数据声明。批准记录不修改冻结内容指纹。</p>
        {datasetDetails.data.cases?.map((item: any) => <article className="lab-row" key={item.id}>
          <div><h3>{item.key}</h3><p>{item.input?.message}</p></div>
          <div className="lab-row-metrics">
            <span>关键词 {(item.expectedOutput?.keywords || []).join('、')}</span>
            <span>{item.metadata?.segments?.skill}</span>
            <span>{item.metadata?.segments?.difficulty}</span>
            <span>{item.metadata?.provenance?.containsPersonalData ? '含个人数据' : '无个人数据'}</span>
          </div>
        </article>)}
        <button onClick={() => approveDataset.mutate()} disabled={busy || !datasetId || !selectedDataset?.frozenAt || selectedDataset?.metadata?.review?.status === 'APPROVED'}>管理员批准当前 Dataset</button>
      </details>}
    </details>

    <div className="lab-form-grid">
      <label>Agent<select value={agentId} onChange={(event) => { setAgentId(event.target.value); setCandidateVersionId(''); setSourceEvaluationId(''); setComparison(null); }}><option value="">选择 Agent</option>{agents.data?.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.currentVersion?.version || '无当前版本'}</option>)}</select></label>
      <label>失败评测<select value={sourceEvaluationId} onChange={(event) => setSourceEvaluationId(event.target.value)}><option value="">选择失败评测</option>{failedEvaluations.map((item) => <option key={item.id} value={item.id}>{item.agentVersion.version} · {item.dataset.name} · 失败 {item.failedCases}</option>)}</select></label>
      <button onClick={() => generate.mutate()} disabled={busy || !agentId || !sourceEvaluationId}>生成草稿候选</button>
    </div>

    <div className="lab-form-grid">
      <label>候选版本<select value={candidateVersionId} onChange={(event) => { setCandidateVersionId(event.target.value); setComparison(null); }}><option value="">选择草稿</option>{draftVersions.map((version) => <option key={version.id} value={version.id}>{version.version}</option>)}</select></label>
      <label>Dataset<select value={datasetId} onChange={(event) => setDatasetId(event.target.value)}><option value="">选择 Dataset</option>{datasets.data?.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.version} · {item.frozenAt ? '已冻结' : '可编辑'}</option>)}</select></label>
      <label>Evaluator<select value={evaluatorId} onChange={(event) => setEvaluatorId(event.target.value)}><option value="">选择 Evaluator</option>{evaluators.data?.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.type}</option>)}</select></label>
      <label>重复次数<select value={repeatCount} onChange={(event) => setRepeatCount(Number(event.target.value))}><option value={3}>3 次</option><option value={4}>4 次</option><option value={5}>5 次</option></select></label>
      <label>成本停止阈值（CNY）<input type="number" min="0.01" max="100" step="0.01" value={maxEstimatedCostCny} onChange={(event) => setMaxEstimatedCostCny(Number(event.target.value))} /></label>
    </div>

    {selectedDataset && <p>计划调用：{selectedDataset._count?.cases || 0} Cases × {repeatCount} 次 = {(selectedDataset._count?.cases || 0) * repeatCount} 个样本/版本；单版本达到 ¥{maxEstimatedCostCny.toFixed(2)} 时停止后续调用。</p>}

    <div className="lab-actions">
      <button onClick={() => selectedAgent?.currentVersion && runEvaluation.mutate(selectedAgent.currentVersion.id)} disabled={busy || !selectedAgent?.currentVersion || !datasetId || !evaluatorId || !releaseEvidenceReady}>评测当前基线</button>
      <button onClick={() => runEvaluation.mutate(candidateVersionId)} disabled={busy || !candidateVersionId || !datasetId || !evaluatorId || !releaseEvidenceReady}>评测候选</button>
      <button onClick={() => compare.mutate()} disabled={busy || !candidateVersionId}>同集对比</button>
      <button onClick={() => publish.mutate()} disabled={busy || comparison?.releaseRecommendation !== 'APPROVE'}>管理员发布</button>
    </div>

    {selectedDataset && !releaseEvidenceReady && <p className="lab-feedback">发布评测要求 Dataset 已冻结、至少 10 个带完整业务切片的 Case，并由管理员逐条审查批准。</p>}

    {comparison && <article className="lab-row">
      <div><p className={`decision-${comparison.releaseRecommendation.toLowerCase()}`}>{comparison.releaseRecommendation}</p><h2>同集评测结果</h2><p>Dataset {comparison.datasetId} · Evaluator {comparison.evaluatorId}</p></div>
      <div className="lab-row-metrics"><span>基线 {comparison.baseline.score}</span><span>候选 {comparison.candidate.score}</span><span>变化 {comparison.scoreDelta >= 0 ? '+' : ''}{comparison.scoreDelta}</span><span>发布证据 {comparison.releaseGate.ruleSetVersion}</span>{comparison.releaseGate.evidence?.statisticalComparison && <span>95% 下界 {comparison.releaseGate.evidence.statisticalComparison.lowerConfidenceBoundPoints ?? '不可用'} · 配对 {comparison.releaseGate.evidence.statisticalComparison.pairedCaseCount}</span>}</div>
    </article>}
    {feedback && <p className="lab-feedback">{feedback}</p>}
  </section>;
}
