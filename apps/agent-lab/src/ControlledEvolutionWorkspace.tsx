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
      }),
    }),
    onSuccess: () => setFeedback('评测 Case 已加入 Dataset。'),
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
      body: JSON.stringify({ agentVersionId: versionId, datasetId, evaluatorId }),
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

  const busy = bootstrap.isPending || createDataset.isPending || createEvaluator.isPending || addCase.isPending || generate.isPending || runEvaluation.isPending || compare.isPending || publish.isPending;

  return <section className="lab-panel">
    <div className="lab-section-head">
      <div><p className="agent-eyebrow">CONTROLLED EVOLUTION</p><h2>受控自进化</h2><p>失败证据生成草稿，同集评测确认无回归，管理员发布后才作用于 Interview。</p></div>
      <button onClick={() => bootstrap.mutate()} disabled={busy}>注册 Interview Agent</button>
    </div>

    <section className="lab-thresholds">
      <span>候选自动生成</span><span>草稿隔离评测</span><span>最低 90 分</span><span>人工发布</span>
    </section>

    <details className="evolution-assets">
      <summary>配置评测资产</summary>
      <p>创建 Dataset、关键词 Evaluator 和 Case。这里仅写入测试资产，不调用模型。</p>
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
      </div>
      <button onClick={() => addCase.mutate()} disabled={busy || !datasetId || !caseKey || !caseMessage || !caseKeywords}>添加 Case 到当前 Dataset</button>
    </details>

    <div className="lab-form-grid">
      <label>Agent<select value={agentId} onChange={(event) => { setAgentId(event.target.value); setCandidateVersionId(''); setSourceEvaluationId(''); setComparison(null); }}><option value="">选择 Agent</option>{agents.data?.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.currentVersion?.version || '无当前版本'}</option>)}</select></label>
      <label>失败评测<select value={sourceEvaluationId} onChange={(event) => setSourceEvaluationId(event.target.value)}><option value="">选择失败评测</option>{failedEvaluations.map((item) => <option key={item.id} value={item.id}>{item.agentVersion.version} · {item.dataset.name} · 失败 {item.failedCases}</option>)}</select></label>
      <button onClick={() => generate.mutate()} disabled={busy || !agentId || !sourceEvaluationId}>生成草稿候选</button>
    </div>

    <div className="lab-form-grid">
      <label>候选版本<select value={candidateVersionId} onChange={(event) => { setCandidateVersionId(event.target.value); setComparison(null); }}><option value="">选择草稿</option>{draftVersions.map((version) => <option key={version.id} value={version.id}>{version.version}</option>)}</select></label>
      <label>Dataset<select value={datasetId} onChange={(event) => setDatasetId(event.target.value)}><option value="">选择 Dataset</option>{datasets.data?.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.version}</option>)}</select></label>
      <label>Evaluator<select value={evaluatorId} onChange={(event) => setEvaluatorId(event.target.value)}><option value="">选择 Evaluator</option>{evaluators.data?.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.type}</option>)}</select></label>
    </div>

    <div className="lab-actions">
      <button onClick={() => selectedAgent?.currentVersion && runEvaluation.mutate(selectedAgent.currentVersion.id)} disabled={busy || !selectedAgent?.currentVersion || !datasetId || !evaluatorId}>评测当前基线</button>
      <button onClick={() => runEvaluation.mutate(candidateVersionId)} disabled={busy || !candidateVersionId || !datasetId || !evaluatorId}>评测候选</button>
      <button onClick={() => compare.mutate()} disabled={busy || !candidateVersionId}>同集对比</button>
      <button onClick={() => publish.mutate()} disabled={busy || comparison?.releaseRecommendation !== 'APPROVE'}>管理员发布</button>
    </div>

    {comparison && <article className="lab-row">
      <div><p className={`decision-${comparison.releaseRecommendation.toLowerCase()}`}>{comparison.releaseRecommendation}</p><h2>同集评测结果</h2><p>Dataset {comparison.datasetId} · Evaluator {comparison.evaluatorId}</p></div>
      <div className="lab-row-metrics"><span>基线 {comparison.baseline.score}</span><span>候选 {comparison.candidate.score}</span><span>变化 {comparison.scoreDelta >= 0 ? '+' : ''}{comparison.scoreDelta}</span></div>
    </article>}
    {feedback && <p className="lab-feedback">{feedback}</p>}
  </section>;
}
