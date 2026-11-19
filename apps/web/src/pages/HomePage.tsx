import { WorkflowDialog } from '../components/WorkflowDialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Briefcase, CheckCircle2, ChevronRight, FileUp, Loader2, Play, RotateCcw, Sparkles, Trash2, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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

export function HomePage({ view = 'overview' }: { view?: 'overview' | 'interviews' | 'practice' }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userId = getSession()?.userId || '';
  const [starting, setStarting] = useState(false);
  const [interviewMode, setInterviewMode] = useState<'FULL_SIMULATION' | 'SKILL_PRACTICE'>('FULL_SIMULATION');
  const [practiceSkillId, setPracticeSkillId] = useState('');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const startPending = useRef(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleteCandidate, setDeleteCandidate] = useState<EmptyRoom | null>(null);
  const [retryCandidate, setRetryCandidate] = useState<InterviewRecord | null>(null);
  const deletePending = useRef(false);
  const retryPending = useRef(false);
  const startIntentKey = `ia_interview_start_unresolved:${userId}`;
  const [startUnresolved, setStartUnresolved] = useState(() => Boolean(sessionStorage.getItem(startIntentKey)));
  const startController = useRef<AbortController | null>(null);
  const viewScope = useRef<object>({});
  useEffect(() => {
    viewScope.current = {};
    setError(''); setMessage(''); setStarting(false); startPending.current = false;
    setStartUnresolved(Boolean(sessionStorage.getItem(startIntentKey)));
    return () => { viewScope.current = {}; startController.current?.abort(); };
  }, [view, startIntentKey]);

  const jobsQuery = useQuery({
    queryKey: ['target-jobs'],
    queryFn: async () => {
      const response = await fetch('/api/interview/target-jobs');
      const data = await safeJson(response);
      if (!response.ok || data?._error) throw new Error(data?.message || '无法读取目标岗位');
      if (!Array.isArray(data)) throw new Error('岗位响应异常，请重新读取。');
      return data as TargetJob[];
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
      if (!Array.isArray(data?.resumes)) throw new Error('简历响应异常，请重新读取。');
      return data.resumes as ResumeSummary[];
    },
  });

  const interviewsQuery = useQuery({
    queryKey: ['interviews'],
    enabled: view !== 'practice',
    queryFn: async () => {
      const response = await fetch('/api/interview/list');
      const data = await safeJson(response);
      if (!response.ok || data?._error) throw new Error(data?.message || '无法读取面试记录');
      if (!Array.isArray(data)) throw new Error('面试记录响应异常，请重新读取。');
      return data as InterviewRecord[];
    },
  });

  const emptyRoomsQuery = useQuery({
    queryKey: ['empty-rooms'],
    enabled: view !== 'practice',
    queryFn: async () => {
      const response = await fetch('/api/interview/empty-rooms?idleMinutes=30');
      const data = await safeJson(response);
      if (!response.ok || data?._error || !Array.isArray(data?.emptyRooms)) throw new Error('空面试列表读取失败');
      return data.emptyRooms as EmptyRoom[];
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
  useEffect(() => { setPracticeSkillId(''); }, [activeJob?.id, activeJob?.profileVersion]);

  const startInterview = async () => {
    if (startPending.current || startUnresolved || !jobsQuery.isSuccess || !resumesQuery.isSuccess) return;
    if (!activeJob) {
      navigate('/prepare/jobs');
      return;
    }
    if (!hasResume) {
      navigate('/prepare/resumes');
      return;
    }
    if (interviewMode === 'SKILL_PRACTICE' && (!readinessQuery.isSuccess || !practiceSkills.some(item => item.skill.id === practiceSkillId))) return;
    const scope = viewScope.current;
    startPending.current = true;
    setStarting(true);
    setError('');
    sessionStorage.setItem(startIntentKey, 'pending');
    const controller = new AbortController(); startController.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await fetch('/api/interview/start', {
        method: 'POST', signal: controller.signal,
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
      if (viewScope.current !== scope) return;
      if (!response.ok || data?._error || typeof data?.interviewId !== 'string' || !data.interviewId.trim()) throw new Error(data?.message || '无法开始面试');
      sessionStorage.removeItem(startIntentKey);
      navigate(`/interview/${encodeURIComponent(data.interviewId)}`);
    } catch (err: any) {
      if (viewScope.current !== scope) return;
      setStartUnresolved(true);
      setError(err?.name === 'AbortError' ? '等待创建结果结束，服务可能仍在处理。请先查看面试记录核对。' : `${err.message || '无法确认创建结果'}。请先查看面试记录核对，避免重复创建。`);
    } finally {
      window.clearTimeout(timer); if (startController.current === controller) startController.current = null;
      if (viewScope.current === scope) { startPending.current = false; setStarting(false); }
    }
  };

  const retryEvaluation = async (interview: InterviewRecord) => {
    if (retryPending.current) return;
    retryPending.current = true;
    setRetryingId(interview.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/interview/${interview.id}/end`, { method: 'POST' });
      const data = await safeJson(response);
      if (!response.ok || data?._error || typeof data?.report?.id !== 'string' || !data.report.id.trim() || data.report.interviewId !== interview.id) {
        throw new Error(data?.message || '评价仍未生成，请稍后再试。');
      }
      await queryClient.invalidateQueries({ queryKey: ['interviews'] });
      await queryClient.invalidateQueries({ queryKey: ['readiness'] });
      setRetryCandidate(null); setMessage('评价已重新生成。');
    } catch (err: any) {
      setError(err.message || '评价重试失败');
    } finally {
      retryPending.current = false; setRetryingId(null);
    }
  };

  const deleteEmptyRoom = async (id: string) => {
    if (deletePending.current) return;
    deletePending.current = true;
    setDeletingId(id);
    setError('');
    try {
      const response = await fetch(`/api/interview/${id}`, { method: 'DELETE' });
      const data = await safeJson(response);
      if (!response.ok || data?._error || data?.deleted !== true) throw new Error(data?.message || '删除结果尚未确认，请重读记录核验。');
      setDeleteCandidate(null);
      setMessage('面试记录已删除。');
      await queryClient.invalidateQueries({ queryKey: ['empty-rooms'] });
      await queryClient.invalidateQueries({ queryKey: ['interviews'] });
    } catch (err: any) {
      setError(err.message || '无法删除空面试');
    } finally {
      deletePending.current = false; setDeletingId(null);
    }
  };

  const visibleInterviews = interviews.filter(interview => {
    const matches = `${interview.position} ${interview.level || ''}`.toLowerCase().includes(search.trim().toLowerCase());
    const action = getInterviewAction(interview);
    return matches && (statusFilter === 'all' || statusFilter === action);
  });
  const practiceContent = <div className="practice-page studio-page">
    <header className="studio-page-heading"><p className="studio-eyebrow">PRACTICE / 模拟练习</p><h1>选择这次练习的方向</h1><p>确认当前岗位和简历，再选择完整模拟或单技能练习。点击开始前不会创建面试。</p></header>
    <section className="practice-prerequisites" aria-label="练习准备检查">
      <Link to="/prepare/jobs" className="studio-card"><span className="studio-icon"><Briefcase size={19}/></span><div><h2>目标岗位</h2><p>{jobsQuery.isError ? '读取失败，请重试' : jobsQuery.isPending ? '正在读取…' : activeJob ? [activeJob.title,activeJob.level].filter(Boolean).join(' · ') : '请先设置目标岗位'}</p></div><span>{activeJob ? '管理' : '去设置'} →</span></Link>
      <Link to="/prepare/resumes" className="studio-card"><span className="studio-icon"><FileUp size={19}/></span><div><h2>个人简历</h2><p>{resumesQuery.isError ? '读取失败，请重试' : resumesQuery.isPending ? '正在读取…' : hasResume ? '已读取到保存的简历，本场仍需确认' : '请先上传一份简历'}</p></div><span>{hasResume ? '检查' : '去上传'} →</span></Link>
    </section>
    {activeJob && <section className="studio-card practice-settings" aria-labelledby="start-interview-title" aria-busy={starting}>            <h2 id="start-interview-title" className="text-lg font-semibold">面试设置</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">本场面试将围绕 <span className="font-medium text-slate-900">{activeJob.title}</span>{activeJob.level ? ` · ${activeJob.level}` : ''} 进行。</p>
            <fieldset disabled={starting}><div className="mt-5 grid grid-cols-2 border border-slate-200 p-1">
              <button
                type="button"
                aria-pressed={interviewMode === 'FULL_SIMULATION'} onClick={() => setInterviewMode('FULL_SIMULATION')}
                className={`px-3 py-2 text-sm font-medium ${interviewMode === 'FULL_SIMULATION' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
              >
                完整模拟
              </button>
              <button
                type="button"
                aria-pressed={interviewMode === 'SKILL_PRACTICE'} onClick={() => setInterviewMode('SKILL_PRACTICE')}
                className={`px-3 py-2 text-sm font-medium ${interviewMode === 'SKILL_PRACTICE' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
              >
                单技能练习
              </button>
            </div>
            <p className="studio-helper">{interviewMode === 'FULL_SIMULATION' ? '围绕当前岗位开展综合问答，进入房间后先确认本场简历。' : '聚焦一项岗位技能练习，需要先选择该岗位已有的技能。'}</p>
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
            {interviewMode === 'SKILL_PRACTICE' && (readinessQuery.isPending ? <p role="status" className="studio-helper">正在读取岗位技能…</p> : readinessQuery.isError ? <p role="alert" className="studio-notice warning">岗位技能读取失败。<button type="button" className="studio-button subtle" onClick={() => void readinessQuery.refetch()} disabled={readinessQuery.isFetching}>重新读取技能</button></p> : !practiceSkills.length ? <p className="studio-helper">当前岗位尚无可选技能，可补充职位描述，或切回完整模拟。<Link to="/prepare/jobs" className="studio-text-button">编辑岗位</Link></p> : null)}
            <div className="mt-5 border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-start gap-2">
                <FileUp className="mt-0.5 h-4 w-4 text-slate-600" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium">{hasResume ? '已找到可用简历' : '需要上传简历'}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{hasResume ? '可直接开始，系统会基于简历和当前岗位提问。' : '上传简历后才能开始个性化模拟。'}</p><p className="mt-1 text-xs text-slate-500">支持 PDF / Markdown / TXT，最大 10 MB。</p>
                </div>
              </div>
              {!hasResume && <Link to="/prepare/resumes" className="studio-button secondary mt-3">上传简历<ArrowRight size={16} aria-hidden="true"/></Link>}
            </div>
            </fieldset>{!starting && <Link to="/prepare/resumes" className="studio-text-button mt-3 inline-flex">查看简历库 / 上传新简历</Link>}
            {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            {(starting) && <p role="status" className="mt-4 text-sm text-slate-600">正在处理，请等待结果，勿重复提交。</p>}
            {startUnresolved && <div className="studio-notice warning"><p>本次创建结果需要核对。先检查面试记录；重新读取资料不会再次创建面试。</p><Link to="/interviews" className="studio-button secondary">查看面试记录</Link><button type="button" className="studio-button subtle" onClick={() => { sessionStorage.removeItem(startIntentKey); setStartUnresolved(false); setError(''); }}>已核对，允许再次创建</button></div>}
            <p className="studio-helper">开始会创建新面试并使用面试额度；后续回答与报告可能产生模型费用。</p>
            <div className="studio-action-row mt-5">
              {!starting && <Link to="/" className="studio-button secondary">返回首页</Link>}
              <button type="button" disabled={!hasResume || starting || startUnresolved || !jobsQuery.isSuccess || !resumesQuery.isSuccess || (interviewMode === 'SKILL_PRACTICE' && (!readinessQuery.isSuccess || !practiceSkills.some(item => item.skill.id === practiceSkillId)))} onClick={startInterview} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300">
                {starting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                开始面试
              </button>
            </div>
</section>}
    {jobsQuery.isSuccess && !activeJob && <section className="studio-card studio-empty"><Briefcase size={26} aria-hidden="true"/><h2>先确定练习的目标</h2><p>设置岗位后，这里会提供对应的练习模式。简历可以先上传，资料会保留在个人简历库。</p><Link to="/prepare/jobs" className="studio-button primary">设置目标岗位<ArrowRight size={16} aria-hidden="true"/></Link></section>}
  </div>;

  return (
    <div className={view === 'practice' ? '' : 'mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-10'}>

      {jobsQuery.isError && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">目标岗位暂时无法读取。<button type="button" className="ml-2 underline" disabled={jobsQuery.isFetching} onClick={() => void jobsQuery.refetch()}>重新读取岗位</button></p>}
      {resumesQuery.isError && <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">简历状态暂时无法确认。<button type="button" className="ml-2 underline" disabled={resumesQuery.isFetching} onClick={() => void resumesQuery.refetch()}>重新读取简历</button></p>}
      {view !== 'practice' && interviewsQuery.isError && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">面试记录暂时无法读取。<button type="button" className="ml-2 underline" disabled={interviewsQuery.isFetching} onClick={() => void interviewsQuery.refetch()}>重新读取面试记录</button></p>}
      {message && <p role="status" className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}
      {error && !deleteCandidate && !retryCandidate && view !== 'practice' && <p role="alert" className="mb-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {view === 'practice' ? practiceContent : view === 'overview' ? (
        <>
          <section className="studio-dashboard-hero">
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
                    <Link to="/prepare/jobs" className="ml-1 font-medium text-blue-700 hover:text-blue-800">编辑岗位</Link>
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-slate-600">先设置目标岗位，再开始一场有针对性的模拟面试。</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => navigate('/practice')}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                开始模拟面试
              </button>
            </div>
          </section>

          <section className="dashboard-preparation" aria-label="面试准备资料">
            <Link to="/prepare/resumes" className="studio-card preparation-shortcut"><span className="studio-icon"><FileUp size={21} aria-hidden="true"/></span><div><h2>我的简历</h2><p>{resumesQuery.isError ? '状态读取失败，点击检查' : resumesQuery.isPending ? '正在读取…' : hasResume ? '查看解析摘要，或上传新简历' : '上传经历与技能，开启个性化面试'}</p></div><span className="studio-badge">{resumesQuery.isError ? '待核对' : hasResume ? '已保存' : '待上传'}</span><ChevronRight size={18} aria-hidden="true"/></Link>
            <Link to="/prepare/jobs" className="studio-card preparation-shortcut"><span className="studio-icon"><Briefcase size={21} aria-hidden="true"/></span><div><h2>目标岗位</h2><p>{activeJob ? [activeJob.title, activeJob.level].filter(Boolean).join(' · ') : jobsQuery.isError ? '状态读取失败，点击检查' : '设置岗位与职位描述，明确练习方向'}</p></div><ChevronRight size={18} aria-hidden="true"/></Link>
          </section>
          <CandidateJourney activeJob={activeJob} hasResume={hasResume} readiness={readiness} />

          {jobsQuery.isPending ? <p role="status" className="studio-card studio-empty">正在读取准备资料…</p> : jobsQuery.isError ? null : !activeJob ? (
            <section className="border border-slate-200 bg-white p-6 md:p-8">
              <Briefcase className="h-6 w-6 text-blue-600" aria-hidden="true" />
              <h2 className="mt-4 text-lg font-semibold">设置第一个目标岗位</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">添加岗位、职级和可选职位描述，后续面试和准备度都会以此为上下文。</p>
              <Link to="/prepare/jobs" className="mt-5 inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
                设置岗位
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </section>
          ) : (
            <DashboardReadiness readiness={readiness} loading={readinessQuery.isLoading} failed={readinessQuery.isError} onStart={() => navigate('/practice')} onUpload={() => navigate('/prepare/resumes')} hasResume={hasResume} />
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
              {interviewsQuery.isPending ? <p role="status" className="studio-card studio-empty">正在读取面试记录…</p> : interviewsQuery.isSuccess ? <InterviewList interviews={interviews.slice(0, 5)} onRetry={interview => { setError(''); setRetryCandidate(interview); }} retryingId={retryingId} /> : null}
            </div>
            <NextStep hasResume={hasResume} activeJob={activeJob} usage={usageQuery.data} onUpload={() => navigate('/prepare/resumes')} onStart={() => navigate('/practice')} />
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
            <button type="button" onClick={() => navigate('/practice')} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
              <Play className="h-4 w-4" aria-hidden="true" />
              开始模拟面试
            </button>
          </div>
          {interviewsQuery.isPending ? <p role="status" className="studio-card studio-empty">正在读取面试记录…</p> : interviewsQuery.isSuccess && <>
            <div className="records-toolbar"><label><Search size={17} aria-hidden="true"/><input type="search" aria-label="搜索面试记录" placeholder="搜索岗位或职级" value={search} onChange={event => setSearch(event.target.value)}/></label><select aria-label="筛选面试状态" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">全部状态</option><option value="CONTINUE">进行中</option><option value="OPEN_REPORT">已有评价</option><option value="RETRY_EVALUATION">评价待恢复</option></select><span>{visibleInterviews.length} / {interviews.length} 条已读取记录</span></div>
            {!visibleInterviews.length && interviews.length ? <div className="studio-card studio-empty"><p>没有匹配的面试记录。</p><button className="studio-button secondary" onClick={() => { setSearch(''); setStatusFilter('all'); }}>清除筛选</button></div> : <InterviewList interviews={visibleInterviews} onRetry={interview => { setError(''); setRetryCandidate(interview); }} retryingId={retryingId} />}
          </>}
        </section>
      )}

      {view !== 'practice' && emptyRoomsQuery.data && emptyRoomsQuery.data.length > 0 && (
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
                <button type="button" disabled={deletingId === room.id} onClick={() => { setError(''); setDeleteCandidate(room); }} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
                  {deletingId === room.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                  删除
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {retryCandidate && <WorkflowDialog labelledBy="retry-evaluation-title" busy={Boolean(retryingId)} onClose={() => { if (!retryingId) setRetryCandidate(null); }}>
        <h2 id="retry-evaluation-title" className="text-lg font-semibold">再次尝试生成评价？</h2><p className="studio-helper">将基于这场面试的已有回答生成评价，可能产生模型费用。若上次结果未确认，建议先重新读取记录。</p>
        {error && <p role="alert" className="studio-notice danger">{error}</p>}
        <div className="studio-action-row"><button className="studio-button secondary" disabled={Boolean(retryingId)} onClick={() => setRetryCandidate(null)}>暂不生成</button><button className="studio-button primary" disabled={Boolean(retryingId)} onClick={() => void retryEvaluation(retryCandidate)}>{retryingId ? '正在生成…' : '确认生成评价'}</button></div>
      </WorkflowDialog>}
      {deleteCandidate && <WorkflowDialog labelledBy="delete-interview-title" busy={Boolean(deletingId)} onClose={() => { if (!deletingId) setDeleteCandidate(null); }}>
        <h2 id="delete-interview-title" className="text-lg font-semibold">删除这场面试？</h2><p className="studio-helper">{deleteCandidate.position} · 此操作不可撤销，会移除这场面试记录。请先确认它尚未作答。</p>
        {error && <p role="alert" className="studio-notice danger">{error}</p>}
        <div className="studio-action-row"><button className="studio-button secondary" disabled={Boolean(deletingId)} onClick={() => setDeleteCandidate(null)}>保留记录</button><button className="studio-button danger" disabled={Boolean(deletingId)} onClick={() => void deleteEmptyRoom(deleteCandidate.id)}>{deletingId ? '正在删除…' : '确认删除'}</button></div>
      </WorkflowDialog>}
    </div>
  );
}

function CandidateJourney({ activeJob, hasResume, readiness }: { activeJob?: TargetJob; hasResume: boolean; readiness?: ReadinessSummary }) {
  const steps = [
    { label: '目标岗位', complete: Boolean(activeJob) },
    { label: '简历', complete: hasResume },
    { label: '模拟面试', complete: Boolean(readiness?.components.interviewPerformance.evidenceCount) },
    { label: '训练复测', complete: Boolean(readiness?.available) },
  ];
  return (
    <section className="mb-8 border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold">当前训练路径</h2>
        <span className="text-xs text-slate-500">仅在真实证据完成后更新</span>
      </div>
      <ol className="grid divide-y divide-slate-100 md:grid-cols-4 md:divide-x md:divide-y-0">
        {steps.map((step, index) => (
          <li key={step.label} className="flex items-center gap-3 px-5 py-4">
            <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${step.complete ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{step.complete ? '✓' : index + 1}</span>
            <span className={`text-sm font-medium ${step.complete ? 'text-slate-900' : 'text-slate-500'}`}>{step.label}</span>
          </li>
        ))}
      </ol>
    </section>
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

function NextStep({ activeJob, hasResume, usage }: { activeJob?: TargetJob; hasResume: boolean; usage?: UsageSummary; onUpload: () => void; onStart: () => void }) {
  if (!activeJob) return null;
  return <aside className="studio-card p-5"><Sparkles className="h-5 w-5 text-blue-600" aria-hidden="true"/><h2 className="mt-3 text-base font-semibold">准备与积累</h2><p className="mt-2 text-sm leading-6 text-slate-600">{hasResume ? '面试结束后，在报告中查看评价依据，再进入定向训练。' : '先保存一份简历，让后续提问与个人经历建立关联。'}</p><Link to={hasResume ? '/training' : '/prepare/resumes'} className="studio-button subtle mt-3">{hasResume ? '查看训练建议' : '上传简历'}<ArrowRight size={15} aria-hidden="true"/></Link>{usage && <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">本月已开始 {usage.interviewsUsed} 场面试{usage.interviewsRemaining === null ? '' : `，剩余 ${usage.interviewsRemaining} 场`}。</p>}</aside>;
}

function InterviewList({ interviews, onRetry, retryingId }: { interviews: InterviewRecord[]; onRetry: (interview: InterviewRecord) => void; retryingId: string | null }) {
  const navigate = useNavigate();
  if (interviews.length === 0) {
    return <div className="studio-card studio-empty"><p>还没有面试记录。</p><Link to="/practice" className="studio-button secondary">开始第一次模拟</Link></div>;
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
              <button type="button" onClick={() => navigate(action === 'OPEN_REPORT' ? `/reports/${encodeURIComponent(interview.id)}` : `/interview/${encodeURIComponent(interview.id)}`)} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
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
