import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleDot, Play, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
  const refreshRecommendations = useMutation({
    mutationFn: async () => requireJson(
      await fetch(`/api/interview/target-jobs/${activeJob!.id}/training-recommendations/refresh`, { method: 'POST' }),
      '无法更新训练建议',
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['training-recommendations', activeJob?.id] });
    },
  });

  const complete = async (recommendation: TrainingRecommendation) => {
    await requireJson(
      await fetch(`/api/interview/training-recommendations/${recommendation.id}/complete`, { method: 'POST' }),
      '无法记录训练完成',
    );
    await queryClient.invalidateQueries({ queryKey: ['training-recommendations', activeJob?.id] });
  };

  const startRetest = async (recommendation: TrainingRecommendation) => {
    const data = await requireJson(
      await fetch('/api/interview/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetJobId: recommendation.targetJobId,
          mode: 'SKILL_PRACTICE',
          practiceSkillId: recommendation.skillId,
          trainingRecommendationId: recommendation.id,
        }),
      }),
      '无法开始复测',
    );
    navigate(`/interview/${data.interviewId}`);
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
        <button type="button" onClick={() => refreshRecommendations.mutate()} disabled={refreshRecommendations.isPending} className="inline-flex h-10 items-center gap-2 border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400">
          <RefreshCw className={`h-4 w-4 ${refreshRecommendations.isPending ? 'animate-spin' : ''}`} aria-hidden="true" />
          {refreshRecommendations.isPending ? '更新中' : '更新建议'}
        </button>
      </header>
      {refreshRecommendations.isError && <p role="alert" className="mb-5 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">暂时无法更新训练建议，请稍后重试。</p>}

      {recommendations.length === 0 ? (
        <section className="border border-slate-200 bg-white p-6">
          <CircleDot className="h-5 w-5 text-slate-400" aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold">还没有可开始的训练</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">当前没有可追溯的训练建议。完成带技能证据的正式面试后，更新建议以查看下一步。</p>
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
                    <button type="button" onClick={() => complete(recommendation)} className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      完成训练
                    </button>
                  )}
                  {recommendation.status === 'COMPLETED' && (
                    <button type="button" onClick={() => startRetest(recommendation)} className="inline-flex items-center gap-2 bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
                      <Play className="h-4 w-4" aria-hidden="true" />
                      开始复测
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
