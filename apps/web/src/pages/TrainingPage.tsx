import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleDot, Play, RefreshCw } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { safeJson } from '../utils/safeJson';
import type { TargetJob } from '../utils/training';

interface TrainingRecommendation {
  id: string;
  targetJobId: string;
  targetJobProfileVersion: number;
  skillId: string;
  objective: string;
  prompts: string[];
  expectedEvidence: string[];
  status: 'READY' | 'COMPLETED' | 'RETEST_STARTED';
  skill: { id: string; name: string; slug: string };
  targetJob: { id: string; title: string; level: string | null; profileVersion: number };
  sourceEvidence: {
    reason: string | null;
    missingEvidence: string[] | null;
    recommendation: string | null;
  };
  attempts: Array<{ id: string; completedAt: string; retestInterviewId: string | null }>;
}

async function requireJson(response: Response, fallback: string) {
  const data = await safeJson(response);
  if (!response.ok || data?._error) throw new Error(data?.message || fallback);
  return data;
}

export function TrainingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const jobsQuery = useQuery({
    queryKey: ['target-jobs'],
    queryFn: async () => {
      const response = await fetch('/api/interview/target-jobs');
      const data = await requireJson(response, '无法读取目标岗位');
      return Array.isArray(data) ? data as TargetJob[] : [];
    },
  });
  const activeJob = jobsQuery.data?.find((job) => job.isActive);
  const recommendationsQuery = useQuery({
    queryKey: ['training-recommendations', activeJob?.id],
    enabled: Boolean(activeJob),
    queryFn: async () => {
      const response = await fetch(`/api/interview/training-recommendations?targetJobId=${encodeURIComponent(activeJob!.id)}`);
      const data = await requireJson(response, '无法读取训练建议');
      return Array.isArray(data) ? data as TrainingRecommendation[] : [];
    },
  });
  const [pendingAction, setPendingAction] = useState<{ id: string; kind: 'complete' | 'retest' } | null>(null);
  const [actionError, setActionError] = useState('');
  const actionBusy = useRef(false);
  const actionScope = useRef<object>({});
  useEffect(() => {
    actionScope.current = {};
    actionBusy.current = false;
    setPendingAction(null);
    setActionError('');
    return () => { actionScope.current = {}; actionBusy.current = false; };
  }, [activeJob?.id, activeJob?.profileVersion]);

  const refreshRecommendations = useMutation({
    mutationFn: async ({ jobId }: { jobId: string; scope: object }) => requireJson(
      await fetch(`/api/interview/target-jobs/${encodeURIComponent(jobId)}/training-recommendations/refresh`, { method: 'POST' }),
      '无法更新训练建议',
    ),
    onSuccess: async (_data, { jobId }) => {
      await queryClient.invalidateQueries({ queryKey: ['training-recommendations', jobId] });
    },
    onSettled: (_data, _error, { scope }) => {
      if (actionScope.current === scope) actionBusy.current = false;
    },
  });
  const refreshPending = refreshRecommendations.isPending && refreshRecommendations.variables?.scope === actionScope.current;
  const refresh = () => {
    if (actionBusy.current || !activeJob) return;
    actionBusy.current = true;
    setActionError('');
    refreshRecommendations.mutate({ jobId: activeJob.id, scope: actionScope.current });
  };

  const performAction = async (kind: 'complete' | 'retest', recommendation: TrainingRecommendation) => {
    if (actionBusy.current || refreshPending) return;
    const scope = actionScope.current;
    actionBusy.current = true;
    setPendingAction({ id: recommendation.id, kind });
    setActionError('');
    try {
      if (activeJob?.id !== recommendation.targetJobId || activeJob.profileVersion !== recommendation.targetJobProfileVersion) throw new Error('当前岗位已变化，请更新建议后核验。');
      const data = await requireJson(await fetch(
        kind === 'complete' ? `/api/interview/training-recommendations/${recommendation.id}/complete` : '/api/interview/start',
        kind === 'complete' ? { method: 'POST' } : {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetJobId: recommendation.targetJobId, mode: 'SKILL_PRACTICE', practiceSkillId: recommendation.skillId, trainingRecommendationId: recommendation.id }),
        },
      ), '训练操作失败，请更新建议后核验。');
      if (actionScope.current !== scope) return;
      const valid = kind === 'complete'
        ? typeof data?.id === 'string' && Boolean(data.id.trim()) && data.recommendationId === recommendation.id
        : typeof data?.interviewId === 'string' && Boolean(data.interviewId.trim())
          && data.interview?.id === data.interviewId && data.interview.targetJobId === recommendation.targetJobId
          && data.interview.practiceSkillId === recommendation.skillId && data.interview.mode === 'SKILL_PRACTICE';
      if (!valid) throw new Error('训练操作结果未确认，请更新建议后核验。');
      await queryClient.invalidateQueries({ queryKey: ['training-recommendations', recommendation.targetJobId] });
      if (actionScope.current === scope && kind === 'retest') navigate(`/interview/${encodeURIComponent(data.interviewId)}`);
    } catch (error) {
      if (actionScope.current === scope) setActionError(error instanceof Error ? error.message : '训练操作失败，请更新建议后核验。');
    } finally {
      if (actionScope.current === scope) { actionBusy.current = false; setPendingAction(null); }
    }
  };

  if (jobsQuery.isLoading || recommendationsQuery.isLoading) {
    return <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-slate-600">正在加载训练建议...</div>;
  }
  if (!activeJob) {
    return <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-slate-600">请先设置当前目标岗位。</div>;
  }
  if (jobsQuery.isError || recommendationsQuery.isError) {
    return <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-red-700">训练建议暂时无法加载。</div>;
  }

  const recommendations = recommendationsQuery.data || [];
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-10">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-sm font-medium text-blue-700">定向训练</p>
          <h1 className="mt-1 text-2xl font-semibold">训练建议</h1>
          <p className="mt-2 text-sm text-slate-600">{activeJob.title}{activeJob.level ? ` · ${activeJob.level}` : ''}</p>
        </div>
        <button type="button" onClick={refresh} disabled={refreshPending || pendingAction !== null} className="inline-flex h-10 items-center gap-2 border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400">
          <RefreshCw className={`h-4 w-4 ${refreshPending ? 'animate-spin' : ''}`} aria-hidden="true" />
          {refreshPending ? '更新中' : '更新建议'}
        </button>
      </header>
      {refreshRecommendations.isError && refreshRecommendations.variables?.scope === actionScope.current && <p role="alert" className="mb-5 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">暂时无法更新训练建议，请稍后重试。</p>}

      {actionError && <p role="alert" className="mb-5 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{actionError}</p>}

      {recommendations.length === 0 ? (
        <section className="border border-slate-200 bg-white p-6">
          <CircleDot className="h-5 w-5 text-slate-400" aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold">还没有可开始的训练</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">当前没有可追溯的训练建议。完成带技能证据的正式面试后，更新建议以查看下一步。</p>
          <Link to="/practice" className="mt-4 inline-flex h-10 items-center gap-2 bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"><Play className="h-4 w-4" aria-hidden="true" />开始完整模拟</Link>
        </section>
      ) : (
        <div className="space-y-3">
          {recommendations.map((recommendation) => (
            <article key={recommendation.id} className="border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    {recommendation.status === 'READY' ? <CircleDot className="h-4 w-4 text-amber-600" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />}
                    <h2 className="text-base font-semibold">{recommendation.skill.name}</h2>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{recommendation.objective}</p>
                  {recommendation.sourceEvidence.reason && <p className="mt-2 text-sm text-slate-600">{recommendation.sourceEvidence.reason}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {recommendation.status === 'READY' && (
                    <button type="button" onClick={() => void performAction('complete', recommendation)} disabled={pendingAction !== null || refreshPending} aria-busy={pendingAction?.id === recommendation.id} className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      {pendingAction?.id === recommendation.id && pendingAction.kind === 'complete' ? '正在记录' : '完成训练'}
                    </button>
                  )}
                  {recommendation.status === 'COMPLETED' && (
                    <button type="button" onClick={() => void performAction('retest', recommendation)} disabled={pendingAction !== null || refreshPending} aria-busy={pendingAction?.id === recommendation.id} className="inline-flex items-center gap-2 bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
                      <Play className="h-4 w-4" aria-hidden="true" />
                      {pendingAction?.id === recommendation.id && pendingAction.kind === 'retest' ? '正在创建复测' : '开始复测'}
                    </button>
                  )}
                  {recommendation.status === 'RETEST_STARTED' && (
                    <span className="inline-flex items-center gap-2 border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800">
                      <RefreshCw className="h-4 w-4" aria-hidden="true" />
                      复测进行中
                    </span>
                  )}
                </div>
              </div>
              {recommendation.prompts.length > 0 && (
                <ul className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm text-slate-600">
                  {recommendation.prompts.map((prompt) => <li key={prompt}>{prompt}</li>)}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
