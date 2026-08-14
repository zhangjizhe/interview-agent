import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Check, Loader2, Pencil, Plus, Save } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { safeJson } from '../utils/safeJson';
import type { TargetJob } from '../utils/training';

interface JobForm {
  title: string;
  level: string;
  company: string;
  jobDescription: string;
}

const emptyForm: JobForm = { title: '', level: '', company: '', jobDescription: '' };

function toForm(job: TargetJob): JobForm {
  return {
    title: job.title,
    level: job.level || '',
    company: job.company || '',
    jobDescription: job.jobDescription || '',
  };
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<TargetJob | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState<JobForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const jobsQuery = useQuery({
    queryKey: ['target-jobs'],
    queryFn: async () => {
      const response = await fetch('/api/interview/target-jobs');
      const data = await safeJson(response);
      if (!response.ok || data?._error) throw new Error(data?.message || '无法读取岗位设置');
      return Array.isArray(data) ? data as TargetJob[] : [];
    },
  });

  useEffect(() => {
    if (editing) setForm(toForm(editing));
  }, [editing]);

  const resetEditor = () => {
    setEditing(null);
    setShowCreateForm(false);
    setForm(emptyForm);
    setError('');
  };

  const saveJob = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        title: form.title.trim(),
        level: form.level.trim() || undefined,
        company: form.company.trim() || undefined,
        jobDescription: form.jobDescription.trim() || undefined,
      };
      const endpoint = editing?.id
        ? `/api/interview/target-jobs/${editing.id}`
        : '/api/interview/target-jobs';
      const response = await fetch(endpoint, {
        method: editing?.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await safeJson(response);
      if (!response.ok || data?._error) throw new Error(data?.message || '岗位保存失败');
      await queryClient.invalidateQueries({ queryKey: ['target-jobs'] });
      setMessage(editing?.id ? '岗位已更新' : '岗位已创建并设为当前岗位');
      resetEditor();
    } catch (err: any) {
      setError(err.message || '岗位保存失败');
    } finally {
      setSaving(false);
    }
  };

  const activateJob = async (job: TargetJob) => {
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/interview/target-jobs/${job.id}/activate`, { method: 'POST' });
      const data = await safeJson(response);
      if (!response.ok || data?._error) throw new Error(data?.message || '切换岗位失败');
      await queryClient.invalidateQueries({ queryKey: ['target-jobs'] });
      await queryClient.invalidateQueries({ queryKey: ['readiness'] });
      setMessage(`当前岗位已切换为${job.title}`);
    } catch (err: any) {
      setError(err.message || '切换岗位失败');
    }
  };

  const jobs = jobsQuery.data || [];
  const showEditor = editing !== null || showCreateForm || jobs.length === 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-blue-700">训练上下文</p>
          <h1 className="mt-1 text-2xl font-semibold">岗位设置</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            当前岗位会用于后续面试和准备度评估。职位描述仅保存在你的岗位设置中。
          </p>
        </div>
        {!showEditor && (
          <button
            type="button"
            onClick={() => { resetEditor(); setForm(emptyForm); setShowCreateForm(true); }}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            新建岗位
          </button>
        )}
      </div>

      {message && <p role="status" className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}
      {error && <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {jobsQuery.isError && <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">岗位设置暂时无法加载。</p>}

      {showEditor && (
        <form onSubmit={saveJob} className="mb-6 border border-slate-200 bg-white p-4 md:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">{editing?.id ? '编辑岗位' : '创建目标岗位'}</h2>
            {jobs.length > 0 && (
              <button type="button" onClick={resetEditor} className="text-sm text-slate-600 hover:text-slate-900">
                取消
              </button>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              岗位名称
              <input
                required
                maxLength={120}
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="例如：前端开发工程师"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              职级
              <input
                maxLength={32}
                value={form.level}
                onChange={(event) => setForm((current) => ({ ...current, level: event.target.value }))}
                className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="例如：P5"
              />
            </label>
            <label className="text-sm font-medium text-slate-700 md:col-span-2">
              公司（可选）
              <input
                maxLength={120}
                value={form.company}
                onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))}
                className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="例如：目标公司名称"
              />
            </label>
            <label className="text-sm font-medium text-slate-700 md:col-span-2">
              职位描述（可选）
              <textarea
                maxLength={12000}
                rows={7}
                value={form.jobDescription}
                onChange={(event) => setForm((current) => ({ ...current, jobDescription: event.target.value }))}
                className="mt-1.5 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="粘贴职位描述，系统将提取岗位相关技能要求。"
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">{form.jobDescription.length} / 12,000</span>
            </label>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="mt-5 inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            {saving ? '保存中' : '保存岗位'}
          </button>
        </form>
      )}

      {!jobsQuery.isLoading && jobs.length > 0 && (
        <section aria-labelledby="saved-jobs-title">
          <h2 id="saved-jobs-title" className="mb-3 text-base font-semibold">已保存岗位</h2>
          <div className="space-y-2">
            {jobs.map((job) => (
              <article key={job.id} className="flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-white p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Briefcase className="h-4 w-4 text-slate-500" aria-hidden="true" />
                    <h3 className="font-medium">{job.title}</h3>
                    {job.level && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{job.level}</span>}
                    {job.isActive && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">当前岗位</span>}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{job.company || '未指定公司'}{job.jobDescription ? ' · 已添加职位描述' : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!job.isActive && (
                    <button type="button" onClick={() => activateJob(job)} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      <Check className="h-4 w-4" aria-hidden="true" />
                      设为当前
                    </button>
                  )}
                  <button type="button" onClick={() => setEditing(job)} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100" title={`编辑${job.title}`} aria-label={`编辑${job.title}`}>
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
