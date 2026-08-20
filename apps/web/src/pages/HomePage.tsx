import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Briefcase, CheckCircle2, ChevronRight, FileUp, Loader2, Play, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { ChangeEvent, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { safeJson } from '../utils/safeJson';
import { confidenceLabel, getInterviewAction, readinessLabel, type InterviewRecord, type ReadinessSummary, type TargetJob, type UsageSummary } from '../utils/training';
import { getSession } from '../utils/auth';

interface ResumeSummary {
  id?: string;
  name?: string | null;
  createdAt?: string;
}

interface EmptyRoom {
  id: string;
  position: string;
  level: string | null;
  startedAt: string;
  idleMinutes: number;
}

export function HomePage({ view = 'overview' }: { view?: 'overview' | 'interviews' }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const userId = getSession()?.userId || '';
  const [showStart, setShowStart] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [interviewMode, setInterviewMode] = useState<'FULL_SIMULATION' | 'SKILL_PRACTICE'>('FULL_SIMULATION');
  const [practiceSkillId, setPracticeSkillId] = useState('');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const jobsQuery = useQuery({
    queryKey: ['target-jobs'],
    queryFn: async () => {
      const response = await fetch('/api/interview/target-jobs');
      const data = await safeJson(response);
      if (!response.ok || data?._error) throw new Error(data?.message || '无法读取目标岗位');
      return Array.isArray(data) ? data as TargetJob[] : [];
    },
  });
  const activeJob = jobsQuery.data?.find((job) => job.isActive);

  const readinessQuery = useQuery({
    queryKey: ['readiness', activeJob?.id],
    enabled: Boolean(activeJob),
    queryFn: async () => {
      const response = await fetch(`/api/interview/target-jobs/${activeJob!.id}/readiness`);
      const data = await safeJson(response);
      if (!response.ok || data?._error) throw new Error(data?.message || '无法读取准备度');
      return data as ReadinessSummary;
    },
  });

  const resumesQuery = useQuery({
    queryKey: ['resumes', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const response = await fetch(`/api/interview/resumes/${encodeURIComponent(userId)}`);
      const data = await safeJson(response);
      if (!response.ok || data?._error) throw new Error(data?.message || '无法读取简历');
      return Array.isArray(data?.resumes) ? data.resumes as ResumeSummary[] : [];
    },
  });

  const interviewsQuery = useQuery({
    queryKey: ['interviews'],
    queryFn: async () => {
      const response = await fetch('/api/interview/list');
      const data = await safeJson(response);
      if (!response.ok || data?._error) throw new Error(data?.message || '无法读取面试记录');
      return Array.isArray(data) ? data as InterviewRecord[] : [];
    },
  });

  const emptyRoomsQuery = useQuery({
    queryKey: ['empty-rooms'],
    queryFn: async () => {
      const response = await fetch('/api/interview/empty-rooms?idleMinutes=30');
      const data = await safeJson(response);
      return Array.isArray(data?.emptyRooms) ? data.emptyRooms as EmptyRoom[] : [];
    },
  });
  const usageQuery = useQuery({
    queryKey: ['usage-summary'],
    queryFn: async () => {
      const response = await fetch('/api/usage/summary');
      const data = await safeJson(response);
      if (!response.ok || data?._error) throw new Error(data?.message || '无法读取使用量');
      return data as UsageSummary;
    },
  });

  const hasResume = (resumesQuery.data?.length || 0) > 0;
  const interviews = interviewsQuery.data || [];
  const readiness = readinessQuery.data;
  const practiceSkills = readiness?.targetJob?.skillRequirements || [];

  const uploadResume = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !activeJob) return;
    setUploading(true);
    setError('');
    setMessage('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('position', activeJob.title);
      const response = await fetch('/api/interview/upload-resume', { method: 'POST', body });
      const data = await safeJson(response);
      if (!response.ok || data?._error) throw new Error(data?.message || '简历上传失败');
      await queryClient.invalidateQueries({ queryKey: ['resumes'] });
      await queryClient.invalidateQueries({ queryKey: ['readiness'] });
      setMessage('简历已更新，可以开始对应岗位的模拟面试。');
    } catch (err: any) {
      setError(err.message || '简历上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const startInterview = async () => {
    if (!activeJob) {
      navigate('/settings');
      return;
    }
    if (!hasResume) {
      fileInputRef.current?.click();
      return;
    }
    setStarting(true);
    setError('');
    try {
      const response = await fetch('/api/interview/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position: activeJob.title,
          level: activeJob.level || undefined,
          targetJobId: activeJob.id,
          mode: interviewMode,
          practiceSkillId: interviewMode === 'SKILL_PRACTICE' ? practiceSkillId : undefined,
        }),
      });
      const data = await safeJson(response);
      if (!response.ok || data?._error || !data?.interviewId) throw new Error(data?.message || '无法开始面试');
      navigate(`/interview/${data.interviewId}`);
    } catch (err: any) {
      setError(err.message || '无法开始面试');
    } finally {
      setStarting(false);
    }
  };

  const retryEvaluation = async (interview: InterviewRecord) => {
    setRetryingId(interview.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/interview/${interview.id}/end`, { method: 'POST' });
      const data = await safeJson(response);
      if (!response.ok || data?._error || !data?.report) {
        throw new Error(data?.message || '评价仍未生成，请稍后再试。');
      }
      await queryClient.invalidateQueries({ queryKey: ['interviews'] });
      await queryClient.invalidateQueries({ queryKey: ['readiness'] });
      setMessage('评价已重新生成。');
    } catch (err: any) {
      setError(err.message || '评价重试失败');
    } finally {
      setRetryingId(null);
    }
  };

  const deleteEmptyRoom = async (id: string) => {
    setDeletingId(id);
    setError('');
    try {
      const response = await fetch(`/api/interview/${id}`, { method: 'DELETE' });
      const data = await safeJson(response);
      if (!response.ok || data?._error) throw new Error(data?.message || '无法删除空面试');
      await queryClient.invalidateQueries({ queryKey: ['empty-rooms'] });
      await queryClient.invalidateQueries({ queryKey: ['interviews'] });
    } catch (err: any) {
      setError(err.message || '无法删除空面试');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-10">
      <input ref={fileInputRef} type="file" accept=".pdf,.md,.txt" className="hidden" onChange={uploadResume} />

      {message && <p role="status" className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}
      {error && <p role="alert" className="mb-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {view === 'overview' ? (
        <>
          <section className="mb-8 border-b border-slate-200 pb-8">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <p className="text-sm font-medium text-blue-700">面试训练</p>
                <h1 className="mt-1 text-2xl font-semibold">为目标岗位做准备</h1>
                {activeJob ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                    <Briefcase className="h-4 w-4 text-slate-500" aria-hidden="true" />
                    <span className="font-medium text-slate-900">{activeJob.title}</span>
                    {activeJob.level && <span>{activeJob.level}</span>}
                    {activeJob.company && <span>{activeJob.company}</span>}
                    <Link to="/settings" className="ml-1 font-medium text-blue-700 hover:text-blue-800">编辑岗位</Link>
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-slate-600">先设置目标岗位，再开始一场有针对性的模拟面试。</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => activeJob ? setShowStart(true) : navigate('/settings')}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                开始模拟面试
              </button>
            </div>
          </section>

          {!activeJob ? (
            <section className="border border-slate-200 bg-white p-6 md:p-8">
              <Briefcase className="h-6 w-6 text-blue-600" aria-hidden="true" />
              <h2 className="mt-4 text-lg font-semibold">设置第一个目标岗位</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">添加岗位、职级和可选职位描述，后续面试和准备度都会以此为上下文。</p>
              <Link to="/settings" className="mt-5 inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
                设置岗位
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </section>
          ) : (
            <DashboardReadiness readiness={readiness} loading={readinessQuery.isLoading} failed={readinessQuery.isError} onStart={() => setShowStart(true)} onUpload={() => fileInputRef.current?.click()} hasResume={hasResume} />
          )}

          <section className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold">最近面试</h2>
                <Link to="/interviews" className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-800">
                  查看全部
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
              <InterviewList interviews={interviews.slice(0, 5)} onRetry={retryEvaluation} retryingId={retryingId} />
            </div>
            <NextStep hasResume={hasResume} activeJob={activeJob} usage={usageQuery.data} onUpload={() => fileInputRef.current?.click()} onStart={() => setShowStart(true)} />
          </section>
        </>
      ) : (
        <section>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-blue-700">训练记录</p>
              <h1 className="mt-1 text-2xl font-semibold">面试记录</h1>
              <p className="mt-2 text-sm text-slate-600">继续未完成的面试、打开已生成的评价，或在评价失败时重试。</p>
            </div>
            <button type="button" onClick={() => activeJob ? setShowStart(true) : navigate('/settings')} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
              <Play className="h-4 w-4" aria-hidden="true" />
              开始模拟面试
            </button>
          </div>
          <InterviewList interviews={interviews} onRetry={retryEvaluation} retryingId={retryingId} />
        </section>
      )}

      {emptyRoomsQuery.data && emptyRoomsQuery.data.length > 0 && (
        <section className="mt-8 border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-amber-900">待处理的空面试</h2>
              <p className="mt-1 text-sm text-amber-800">这些面试开始后超过 30 分钟仍未有对话，可清理以保持记录准确。</p>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {emptyRoomsQuery.data.map((room) => (
              <div key={room.id} className="flex flex-wrap items-center justify-between gap-3 border border-amber-200 bg-white px-3 py-2">
                <span className="text-sm text-slate-700">{room.position}{room.level ? ` · ${room.level}` : ''}</span>
                <button type="button" disabled={deletingId === room.id} onClick={() => deleteEmptyRoom(room.id)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
                  {deletingId === room.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                  删除
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {showStart && activeJob && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 p-0 md:items-center md:justify-center md:p-4" role="dialog" aria-modal="true" aria-labelledby="start-interview-title">
          <div className="w-full border border-slate-200 bg-white p-5 shadow-xl md:max-w-md">
            <h2 id="start-interview-title" className="text-lg font-semibold">开始模拟面试</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">本场面试将围绕 <span className="font-medium text-slate-900">{activeJob.title}</span>{activeJob.level ? ` · ${activeJob.level}` : ''} 进行。</p>
            <div className="mt-5 grid grid-cols-2 border border-slate-200 p-1">
              <button
                type="button"
                onClick={() => setInterviewMode('FULL_SIMULATION')}
                className={`px-3 py-2 text-sm font-medium ${interviewMode === 'FULL_SIMULATION' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
              >
                完整模拟
              </button>
              <button
                type="button"
                onClick={() => setInterviewMode('SKILL_PRACTICE')}
                className={`px-3 py-2 text-sm font-medium ${interviewMode === 'SKILL_PRACTICE' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
              >
                单技能练习
              </button>
            </div>
            {interviewMode === 'SKILL_PRACTICE' && (
              <label className="mt-4 block text-sm font-medium text-slate-700">
                练习技能
                <select
                  value={practiceSkillId}
                  onChange={(event) => setPracticeSkillId(event.target.value)}
                  className="mt-1.5 h-10 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">选择一项岗位技能</option>
                  {practiceSkills.map((requirement) => (
                    <option key={requirement.skill.id} value={requirement.skill.id}>
                      {requirement.skill.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="mt-5 border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-start gap-2">
                <FileUp className="mt-0.5 h-4 w-4 text-slate-600" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium">{hasResume ? '已找到可用简历' : '需要上传简历'}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{hasResume ? '可直接开始，系统会基于简历和当前岗位提问。' : '上传简历后才能开始个性化模拟。'}</p>
                </div>
              </div>
              {!hasResume && (
                <button type="button" disabled={uploading} onClick={() => fileInputRef.current?.click()} className="mt-3 inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileUp className="h-4 w-4" aria-hidden="true" />}
                  {uploading ? '上传中' : '上传简历'}
                </button>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowStart(false)} className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">取消</button>
              <button type="button" disabled={!hasResume || starting || (interviewMode === 'SKILL_PRACTICE' && !practiceSkillId)} onClick={startInterview} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300">
                {starting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                开始面试
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardReadiness({ readiness, loading, failed, hasResume, onUpload, onStart }: {
  readiness: ReadinessSummary | undefined;
  loading: boolean;
  failed: boolean;
  hasResume: boolean;
  onUpload: () => void;
  onStart: () => void;
}) {
  if (loading) return <section className="border border-slate-200 bg-white p-6 text-sm text-slate-600">正在加载准备度...</section>;
  if (failed || !readiness) return <section className="border border-red-200 bg-red-50 p-6 text-sm text-red-800">准备度暂时无法加载，不会显示估计分数。</section>;

  const components = [
    { label: '简历证据', complete: readiness.components.resumeEvidence.status === 'AVAILABLE', detail: readiness.components.resumeEvidence.evidenceCount ? `已找到 ${readiness.components.resumeEvidence.evidenceCount} 条简历证据` : '尚未找到简历证据' },
    { label: '正式评价', complete: readiness.components.interviewPerformance.status === 'AVAILABLE', detail: readiness.components.interviewPerformance.evidenceCount ? `基于 ${readiness.components.interviewPerformance.evidenceCount} 条评价证据` : '尚未完成正式评价' },
    { label: '岗位技能', complete: readiness.components.skillCoverage.status === 'AVAILABLE', detail: `${readiness.components.skillCoverage.assessedSkillCount || 0} / ${readiness.components.skillCoverage.requiredSkillCount || 0} 项已评估` },
  ];

  return (
    <section className="grid border border-slate-200 bg-white lg:grid-cols-[260px_1fr]">
      <div className="border-b border-slate-200 p-5 lg:border-b-0 lg:border-r">
        <p className="text-sm font-medium text-slate-600">准备度</p>
        <p className={`mt-3 text-3xl font-semibold ${readiness.available ? 'text-slate-900' : 'text-amber-800'}`}>{readinessLabel(readiness)}</p>
        <p className="mt-2 text-sm text-slate-600">证据置信度：{confidenceLabel(readiness.confidence)}</p>
        {readiness.available && <p className="mt-3 text-xs leading-5 text-slate-500">{readiness.disclaimer}</p>}
      </div>
      <div className="p-5">
        {readiness.available ? (
          <div>
            <h2 className="text-base font-semibold">当前评估基础</h2>
            <p className="mt-1 text-sm text-slate-600">分数仅基于当前岗位下的简历、正式面试和技能证据。</p>
          </div>
        ) : (
          <div>
            <h2 className="text-base font-semibold">还不能估计准备度</h2>
            <p className="mt-1 text-sm text-slate-600">完成以下证据后，系统才会显示准备度分数。</p>
          </div>
        )}
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {components.map((component) => (
            <div key={component.label} className="border border-slate-200 p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className={`h-4 w-4 ${component.complete ? 'text-emerald-600' : 'text-slate-300'}`} aria-hidden="true" />
                <span className="text-sm font-medium">{component.label}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600">{component.detail}</p>
            </div>
          ))}
        </div>
        {!readiness.available && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <ul className="flex-1 space-y-1 text-sm text-amber-800">
              {readiness.missingReasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
            <button type="button" onClick={hasResume ? onStart : onUpload} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
              {hasResume ? '开始首次面试' : '上传简历'}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function NextStep({ activeJob, hasResume, usage, onUpload, onStart }: { activeJob?: TargetJob; hasResume: boolean; usage?: UsageSummary; onUpload: () => void; onStart: () => void }) {
  if (!activeJob) return null;
  return (
    <aside className="border border-slate-200 bg-white p-5">
      <Sparkles className="h-5 w-5 text-blue-600" aria-hidden="true" />
      <h2 className="mt-3 text-base font-semibold">下一步</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{hasResume ? '进行一次完整模拟面试，建立当前岗位的正式评价证据。' : '先上传简历，让后续提问与当前岗位建立关联。'}</p>
      <button type="button" onClick={hasResume ? onStart : onUpload} className="mt-4 inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
        {hasResume ? '开始模拟面试' : '上传简历'}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
      {usage && (
        <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
          本月已开始 {usage.interviewsUsed} 场面试{usage.interviewsRemaining === null ? '' : `，剩余 ${usage.interviewsRemaining} 场`}。
        </p>
      )}
    </aside>
  );
}

function InterviewList({ interviews, onRetry, retryingId }: { interviews: InterviewRecord[]; onRetry: (interview: InterviewRecord) => void; retryingId: string | null }) {
  const navigate = useNavigate();
  if (interviews.length === 0) {
    return <div className="border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">还没有面试记录。</div>;
  }

  return (
    <div className="border border-slate-200 bg-white">
      {interviews.map((interview, index) => {
        const action = getInterviewAction(interview);
        const actionLabel = action === 'CONTINUE' ? '继续面试' : action === 'OPEN_REPORT' ? '打开评价' : '重试评价';
        const status = action === 'CONTINUE'
          ? { label: '进行中', className: 'bg-blue-50 text-blue-700' }
          : action === 'OPEN_REPORT'
            ? { label: '已完成', className: 'bg-emerald-50 text-emerald-700' }
            : { label: '评价未生成', className: 'bg-amber-50 text-amber-800' };
        return (
          <article key={interview.id} className={`flex flex-wrap items-center justify-between gap-4 p-4 ${index ? 'border-t border-slate-200' : ''}`}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium">{interview.position}{interview.level ? ` · ${interview.level}` : ''}</h3>
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${status.className}`}>{status.label}</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{new Date(interview.startedAt).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })}{interview.report ? ` · 评价 ${interview.report.overallScore} 分` : action === 'RETRY_EVALUATION' ? ' · 未显示分数' : ''}</p>
            </div>
            {action === 'RETRY_EVALUATION' ? (
              <button type="button" disabled={retryingId === interview.id} onClick={() => onRetry(interview)} className="inline-flex items-center gap-2 rounded-md border border-amber-300 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50">
                {retryingId === interview.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
                {retryingId === interview.id ? '重试中' : actionLabel}
              </button>
            ) : (
              <button type="button" onClick={() => navigate(`/interview/${interview.id}`)} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                {actionLabel}
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </article>
        );
      })}
    </div>
  );
}
