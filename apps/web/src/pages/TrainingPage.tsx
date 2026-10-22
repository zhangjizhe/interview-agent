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

// A query owns the full response lifetime, including body consumption. Racing the
// signal also protects against transports that do not reject on cancellation.
async function readTrainingArray<T>(url: string, signal: AbortSignal, fallback: string): Promise<T[]> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) controller.abort();
  const timer = setTimeout(abort, 60_000);
  let rejectWait!: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectWait = () => reject(new Error('读取等待超时或已取消，请重新加载。'));
    controller.signal.addEventListener('abort', rejectWait, { once: true });
    if (controller.signal.aborted) rejectWait();
  });
  try {
    return await Promise.race([
      fetch(url, { signal: controller.signal }).then(async response => {
        const data = await requireJson(response, fallback);
        if (!Array.isArray(data)) throw new Error(fallback);
        return data as T[];
      }),
      aborted,
    ]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', rejectWait);
  }
}

export function TrainingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const jobsQuery = useQuery({
    queryKey: ['target-jobs', 'training'],
    retry: false,
    queryFn: ({ signal }) => readTrainingArray<TargetJob>('/api/interview/target-jobs', signal, '无法读取目标岗位'),
  });
  const activeJob = jobsQuery.data?.find((job) => job.isActive);
  const recommendationsQuery = useQuery({
    queryKey: ['training-recommendations', activeJob?.id, activeJob?.profileVersion],
    enabled: Boolean(activeJob),
    retry: false,
    queryFn: ({ signal }) => readTrainingArray<TrainingRecommendation>(
      `/api/interview/training-recommendations?targetJobId=${encodeURIComponent(activeJob!.id)}`, signal, '无法读取训练建议',
    ),
  });
  const [pendingAction, setPendingAction] = useState<{ id: string; kind: 'complete' | 'retest' } | null>(null);
  const [actionError, setActionError] = useState('');
  const actionBusy = useRef(false);
  const actionScope = useRef<object>({});
  const actionRequests = useRef(new Map<AbortController, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    actionScope.current = {};
    actionBusy.current = false;
    setPendingAction(null);
    setActionError('');
    return () => {
      actionScope.current = {};
      actionBusy.current = false;
      for (const [controller, timer] of actionRequests.current) { clearTimeout(timer); controller.abort(); }
      actionRequests.current.clear();
    };
  }, [activeJob?.id, activeJob?.profileVersion]);

  const requestAction = async (url: string, init: RequestInit, fallback: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    actionRequests.current.set(controller, timer);
    let rejectWait!: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectWait = () => {
        const error = new Error('训练请求等待超时（60 秒），结果尚未确认。请更新建议后核验。');
        error.name = 'TrainingActionTimeoutError';
        reject(error);
      };
      controller.signal.addEventListener('abort', rejectWait, { once: true });
    });
    try {
      return await Promise.race([
        fetch(url, { ...init, signal: controller.signal }).then(response => requireJson(response, fallback)),
        aborted,
      ]);
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', rejectWait);
      actionRequests.current.delete(controller);
    }
  };

  const refreshRecommendations = useMutation({
    mutationFn: async ({ jobId }: { jobId: string; scope: object }) => requestAction(
      `/api/interview/target-jobs/${encodeURIComponent(jobId)}/training-recommendations/refresh`, { method: 'POST' },
      '无法更新训练建议',
    ),
    onSuccess: async (_data, { jobId }) => {
      await queryClient.invalidateQueries({ queryKey: ['training-recommendations', jobId] });
    },
    onSettled: (_data, _error, { scope }) => {
      if (actionScope.current === scope) actionBusy.current = false;
    },
  });
  const refreshError = refreshRecommendations.error instanceof Error && refreshRecommendations.error.name === 'TrainingActionTimeoutError'
    ? refreshRecommendations.error.message : '暂时无法更新训练建议，请稍后重试。';
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
      const data = await requestAction(
        kind === 'complete' ? `/api/interview/training-recommendations/${recommendation.id}/complete` : '/api/interview/start',
        kind === 'complete' ? { method: 'POST' } : {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetJobId: recommendation.targetJobId, mode: 'SKILL_PRACTICE', practiceSkillId: recommendation.skillId, trainingRecommendationId: recommendation.id }),
        },
        '训练操作失败，请更新建议后核验。',
      );
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
  if (jobsQuery.isError || recommendationsQuery.isError) {
    const failedQuery = jobsQuery.isError ? jobsQuery : recommendationsQuery;
    return <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-red-700">
      <p role="alert">训练建议暂时无法加载。请重新加载核验最新状态。</p>
      <button type="button" disabled={failedQuery.isFetching} onClick={() => void failedQuery.refetch()} className="mt-3 border border-slate-300 px-3 py-2 disabled:opacity-50">
        {failedQuery.isFetching ? '正在重新加载' : '重新加载'}
      </button>
    </div>;
  }
  if (!activeJob) {
    return <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-slate-600">请先设置当前目标岗位。</div>;
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
      {refreshRecommendations.isError && refreshRecommendations.variables?.scope === actionScope.current && <p role="alert" className="mb-5 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{refreshError}</p>}

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
