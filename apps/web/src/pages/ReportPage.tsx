import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ClipboardCheck, Play, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { safeJson } from '../utils/safeJson';

interface InterviewReport {
  overallScore: number;
  scores: Record<string, number>;
  strengths: string;
  weaknesses: string;
  suggestions: string;
}

interface InterviewDetail {
  id: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  position: string;
  level: string | null;
  targetJobId: string | null;
  report: InterviewReport | null;
}

interface AssessmentEvidence {
  id: string;
  reason: string | null;
  missingEvidence: string[] | null;
  recommendation: string | null;
  question: { question: string; category: string; difficulty: string; parentQuestionId: string | null };
  answer: { content: string; createdAt: string };
}

function reportLines(value: string) {
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

export function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const detailQuery = useQuery({
    queryKey: ['interview-report', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const response = await fetch(`/api/interview/${id}`);
      const data = await safeJson(response);
      if (!response.ok || data?._error) throw new Error(data?.message || '无法读取面试报告');
      return data as InterviewDetail;
    },
  });

  const detail = detailQuery.data;
  const evidenceQuery = useQuery({
    queryKey: ['interview-report-evidence', id],
    enabled: Boolean(id && detail?.status === 'COMPLETED'),
    queryFn: async () => {
      const response = await fetch(`/api/interview/${id}/evidence`);
      const data = await safeJson(response);
      if (!response.ok || data?._error) throw new Error(data?.message || '无法读取评价证据');
      return Array.isArray(data) ? data as AssessmentEvidence[] : [];
    },
  });
  useEffect(() => {
    if (detail?.status === 'IN_PROGRESS' && id) navigate(`/interview/${id}`, { replace: true });
  }, [detail?.status, id, navigate]);

  const startNewAttempt = async () => {
    if (!detail) return;
    setStarting(true);
    try {
      const response = await fetch('/api/interview/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position: detail.position,
          level: detail.level || undefined,
          targetJobId: detail.targetJobId || undefined,
          mode: 'FULL_SIMULATION',
        }),
      });
      const data = await safeJson(response);
      if (!response.ok || data?._error || !data?.interviewId) throw new Error(data?.message || '无法开始新的模拟面试');
      navigate(`/interview/${data.interviewId}`);
    } catch {
      setStarting(false);
    }
  };

  if (detailQuery.isLoading) return <main className="mx-auto max-w-5xl px-4 py-16 text-sm text-slate-600">正在加载评价报告...</main>;
  if (detailQuery.isError || !detail) return <main className="mx-auto max-w-5xl px-4 py-16"><section className="border border-red-200 bg-red-50 p-6 text-sm text-red-800">评价报告暂时无法加载。<Link to="/interviews" className="ml-2 font-medium underline">返回面试记录</Link></section></main>;
  if (detail.status === 'IN_PROGRESS') return null;
  if (!detail.report) {
    return <main className="mx-auto max-w-5xl px-4 py-16"><section className="border border-amber-200 bg-amber-50 p-6"><ClipboardCheck className="h-5 w-5 text-amber-700" aria-hidden="true" /><h1 className="mt-3 text-lg font-semibold text-amber-900">评价尚未生成</h1><p className="mt-2 text-sm leading-6 text-amber-800">本场面试已结束，但当前没有可展示的正式评价。可以在面试记录中稍后重试。</p><Link to="/interviews" className="mt-4 inline-flex h-10 items-center gap-2 border border-amber-300 px-3 text-sm font-medium text-amber-900 hover:bg-amber-100"><RefreshCw className="h-4 w-4" aria-hidden="true" />返回面试记录</Link></section></main>;
  }

  const report = detail.report;
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
        <div><p className="text-sm font-medium text-blue-700">正式评价</p><h1 className="mt-1 text-2xl font-semibold">{detail.position}{detail.level ? ` · ${detail.level}` : ''}</h1><p className="mt-2 text-sm text-slate-600">仅基于本场已完成面试的正式评价与证据。</p></div>
        <Link to="/interviews" className="inline-flex h-10 items-center gap-2 border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" aria-hidden="true" />面试记录</Link>
      </header>
      <section className="mt-6 grid border border-slate-200 bg-white md:grid-cols-[220px_1fr]">
        <div className="border-b border-slate-200 p-5 md:border-b-0 md:border-r"><p className="text-sm font-medium text-slate-600">总体评价</p><p className="mt-3 font-mono text-4xl font-semibold text-slate-900">{report.overallScore}<span className="text-lg text-slate-400"> / 100</span></p><p className="mt-3 text-xs leading-5 text-slate-500">分数不代表 Offer 预测，仅描述当前岗位和本场证据范围。</p></div>
        <div className="grid gap-px bg-slate-200 sm:grid-cols-2">{Object.entries(report.scores || {}).map(([key, value]) => <div key={key} className="bg-white p-5"><p className="text-sm text-slate-600">{key}</p><p className="mt-2 font-mono text-2xl font-semibold text-slate-900">{Math.round(Number(value))}</p></div>)}</div>
      </section>
      <section className="mt-6 grid gap-4 lg:grid-cols-3"><ReportSection title="表现较好" lines={reportLines(report.strengths)} tone="success" /><ReportSection title="需要补充" lines={reportLines(report.weaknesses)} tone="warning" /><ReportSection title="下一步建议" lines={reportLines(report.suggestions)} tone="neutral" /></section>
      <section className="mt-6 border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4"><p className="text-sm font-medium text-blue-700">证据回放</p><h2 className="mt-1 text-base font-semibold">问题、回答与评价依据</h2></div>
        {evidenceQuery.isLoading ? <p className="px-5 py-6 text-sm text-slate-600">正在加载正式评价证据...</p> : evidenceQuery.isError ? <p className="px-5 py-6 text-sm text-amber-800">证据暂时无法展示，但不影响当前正式评价。</p> : evidenceQuery.data?.length ? <div className="divide-y divide-slate-200">{evidenceQuery.data.map((evidence, index) => <article key={evidence.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><div><p className="text-xs font-medium text-slate-500">{evidence.question.parentQuestionId ? '追问' : `问题 ${index + 1}`} · {evidence.question.category} · {evidence.question.difficulty}</p><h3 className="mt-2 text-sm font-semibold leading-6 text-slate-900">{evidence.question.question}</h3><p className="mt-3 border-l-2 border-slate-200 pl-3 text-sm leading-6 text-slate-700">{evidence.answer.content}</p></div><div className="border-t border-slate-100 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0"><p className="text-xs font-medium text-slate-500">评价依据</p><p className="mt-2 text-sm leading-6 text-slate-700">{evidence.reason || '本条未生成额外评价说明。'}</p>{evidence.missingEvidence?.length ? <p className="mt-3 text-sm text-amber-800">待补充：{evidence.missingEvidence.join('、')}</p> : null}{evidence.recommendation ? <p className="mt-3 text-sm text-slate-600">建议：{evidence.recommendation}</p> : null}</div></article>)}</div> : <p className="px-5 py-6 text-sm text-slate-600">本场尚无可回放的正式证据。</p>}
      </section>
      <section className="mt-6 flex flex-wrap items-center justify-between gap-4 border border-slate-200 bg-white p-5"><div><h2 className="text-base font-semibold">继续训练</h2><p className="mt-1 text-sm text-slate-600">训练建议会基于正式证据生成；完成训练本身不会改变技能分数。</p></div><div className="flex flex-wrap gap-2"><Link to="/training" className="inline-flex h-10 items-center gap-2 border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">查看训练</Link><button type="button" onClick={startNewAttempt} disabled={starting} className="inline-flex h-10 items-center gap-2 bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-300"><Play className="h-4 w-4" aria-hidden="true" />{starting ? '创建中' : '开始新的模拟'}</button></div></section>
    </main>
  );
}

function ReportSection({ title, lines, tone }: { title: string; lines: string[]; tone: 'success' | 'warning' | 'neutral' }) {
  const colors = tone === 'success' ? 'border-emerald-200 bg-emerald-50' : tone === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white';
  return <section className={`border p-5 ${colors}`}><h2 className="text-base font-semibold">{title}</h2>{lines.length ? <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">{lines.map((line) => <li key={line}>{line}</li>)}</ul> : <p className="mt-3 text-sm text-slate-600">本场未生成可展示的条目。</p>}</section>;
}
