import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Briefcase, Check, FileText, Loader2, Pencil, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { WorkflowDialog } from '../components/WorkflowDialog';
import { getSession } from '../utils/auth';
import { isTargetJob } from '../utils/preparation';
import { safeJson } from '../utils/safeJson';
import type { TargetJob } from '../utils/training';

interface JobForm { title: string; level: string; company: string; jobDescription: string }
const emptyForm: JobForm = { title: '', level: '', company: '', jobDescription: '' };
const toForm = (job: TargetJob): JobForm => ({ title: job.title, level: job.level || '', company: job.company || '', jobDescription: job.jobDescription || '' });

export function JobsPage() {
  const client = useQueryClient();
  const intentKey = `ia_job_write_unresolved:${getSession()?.userId || ''}`;
  const [editor, setEditor] = useState<{ job: TargetJob | null; initial: JobForm } | null>(null);
  const [form, setForm] = useState<JobForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState('');
  const [unresolved, setUnresolved] = useState(() => Boolean(sessionStorage.getItem(intentKey)));
  const [checked, setChecked] = useState(false);
  const pending = useRef(false);
  const [discard, setDiscard] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState<{ field: 'title' | 'jobDescription'; message: string } | null>(null);
  const [message, setMessage] = useState('');
  const titleInput = useRef<HTMLInputElement>(null);
  const createButton = useRef<HTMLButtonElement>(null);
  const restoreAfterRecovery = useRef(false);
  useEffect(() => {
    if (!unresolved && restoreAfterRecovery.current) {
      restoreAfterRecovery.current = false;
      (editor ? titleInput.current : createButton.current)?.focus();
    }
  }, [unresolved, editor]);
  const descriptionInput = useRef<HTMLTextAreaElement>(null);
  const jobHeadings = useRef<Record<string, HTMLHeadingElement | null>>({});
  const [focusJob, setFocusJob] = useState('');
  useEffect(() => { if (focusJob) jobHeadings.current[focusJob]?.focus(); }, [focusJob]);
  const jobsQuery = useQuery({ queryKey: ['target-jobs'], queryFn: async () => {
    const response = await fetch('/api/interview/target-jobs');
    const data = await safeJson(response);
    if (!response.ok || data?._error) throw new Error(data?.message || '无法读取岗位设置');
    if (!Array.isArray(data) || !data.every(isTargetJob)) throw new Error('岗位响应格式异常，请重新读取。');
    return data as TargetJob[];
  }});
  const jobs = jobsQuery.data || [];
  const dirty = Boolean(editor && JSON.stringify(form) !== JSON.stringify(editor.initial));
  useEffect(() => {
    if (!dirty && !saving && !activating) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, saving, activating]);
  const open = (job: TargetJob | null) => {
    if (pending.current || unresolved) return;
    const initial = job ? toForm(job) : { ...emptyForm };
    setForm(initial); setEditor({ job, initial }); setDiscard(false); setError(''); setFieldError(null); setMessage('');
  };
  const close = () => { if (pending.current) return; if (dirty) setDiscard(true); else setEditor(null); };
  const clearIntent = (intent: string) => {
    if (sessionStorage.getItem(intentKey) === intent) sessionStorage.removeItem(intentKey);
  };
  // A network failure or missing receipt is not evidence that the transaction
  // failed. Keep an account-local marker; refreshing only reads, never replays.
  const writeJob = async (path: string, init: RequestInit, valid: (value: unknown) => boolean) => {
    const intent = crypto.randomUUID();
    try { sessionStorage.setItem(intentKey, intent); }
    catch { throw new Error('浏览器无法记录操作状态，本次尚未提交。请检查浏览器存储设置后重试。'); }
    let rejected = false;
    try {
      const response = await fetch(path, { ...init, signal: AbortSignal.timeout(20_000) });
      const data = await safeJson(response);
      if (!response.ok || data?._error) {
        rejected = response.status >= 400 && response.status < 500 && response.status !== 408;
        throw new Error(data?.message || '岗位操作未确认');
      }
      if (!valid(data)) throw new Error('保存结果未确认，请重新读取岗位核对。');
      clearIntent(intent);
      return data as TargetJob;
    } catch (reason) {
      if (rejected) clearIntent(intent);
      else { setUnresolved(true); setChecked(false); }
      throw reason;
    }
  };
  const publishConfirmedJob = (saved: TargetJob) => {
    client.setQueryData<TargetJob[]>(['target-jobs'], current => {
      const rows = current || [];
      const next = rows.map(job => job.id === saved.id ? saved : saved.isActive ? { ...job, isActive: false } : job);
      return rows.some(job => job.id === saved.id) ? next : [...next, saved];
    });
    // A confirmed write must not leave controls/focus locked behind an
    // unbounded verification GET. Query failures remain visible on the page.
    void client.invalidateQueries({ queryKey: ['target-jobs'] });
    void client.invalidateQueries({ queryKey: ['readiness'] });
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current || unresolved || !editor) return;
    setFieldError(null);
    if (!form.title.trim()) {
      setFieldError({ field: 'title', message: '请填写岗位名称。' }); titleInput.current?.focus(); return;
    }
    if (form.jobDescription.trim() && form.jobDescription.trim().length < 20) {
      setFieldError({ field: 'jobDescription', message: '职位描述至少填写 20 个字符，或留空稍后补充。' }); descriptionInput.current?.focus(); return;
    }
    pending.current = true; setSaving(true); setError(''); setMessage('');
    try {
      const data = await writeJob(editor.job ? `/api/interview/target-jobs/${editor.job.id}` : '/api/interview/target-jobs', {
        method: editor.job ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title.trim(), level: form.level.trim(), company: form.company.trim(), jobDescription: form.jobDescription.trim() }),
      }, value => isTargetJob(value) && (editor.job ? value.id === editor.job.id : value.isActive));
      setMessage(editor.job
        ? data.isActive ? '当前岗位已更新，后续面试将使用更新后的信息。' : '已保存岗位修改。设为当前岗位后，可用于新的面试。'
        : '岗位已创建并设为当前岗位。下一步可以上传或检查简历。');
      setEditor(null);
      publishConfirmedJob(data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '岗位操作未确认，请先核对列表。'); }
    finally { pending.current = false; setSaving(false); }
  };
  const activate = async (job: TargetJob) => {
    if (pending.current || unresolved) return;
    pending.current = true; setActivating(job.id); setError(''); setMessage('');
    try {
      const data = await writeJob(`/api/interview/target-jobs/${job.id}/activate`, { method: 'POST' }, value => isTargetJob(value) && value.id === job.id && value.isActive);
      setMessage(`当前岗位已切换为${job.title}，历史面试记录保持原样。`);
      publishConfirmedJob(data); setFocusJob(data.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '切换岗位未确认，请先核对列表。'); }
    finally { pending.current = false; setActivating(''); }
  };
  const busy = saving || Boolean(activating);
  const recovery = unresolved && <section className="studio-notice warning" aria-label="待核对的岗位操作">
    <h3>先核对上一次操作</h3><p>未收到完整回执，岗位可能已经保存或切换。重新读取列表不会重复提交；确认结果后，再继续编辑或创建。</p>
    <div className="studio-action-row">
      <button type="button" className="studio-button secondary" disabled={jobsQuery.isFetching || busy} onClick={async () => { setChecked(false); const result = await jobsQuery.refetch(); setChecked(result.isSuccess); }}>重新读取岗位核对</button>
      <button type="button" className="studio-button subtle" disabled={!checked || jobsQuery.isFetching || busy} onClick={() => { sessionStorage.removeItem(intentKey); restoreAfterRecovery.current = true; setUnresolved(false); setChecked(false); setError(''); }}>已核对，允许继续操作</button>
    </div>
    {checked && <><p role="status">列表已重新读取。请核对当前岗位和已保存内容，再选择继续。</p>
      <div className="job-recovery-list" role="region" aria-label="重新读取的岗位内容" tabIndex={0}>
        {jobs.length ? jobs.map(job => <details key={job.id}><summary>{job.title} · {job.isActive ? '当前岗位' : '已保存'}</summary><p>公司：{job.company || '未指定'} · 职级：{job.level || '不限'}</p><p>{job.jobDescription || '未填写职位描述'}</p></details>) : <p>本次列表没有返回已保存岗位。</p>}
      </div>
    </>}
  </section>;
  return <div className="preparation-content">
    <div className="studio-section-heading"><div><h2>目标岗位</h2><p>当前岗位决定新面试的方向，切换不会覆盖历史面试。</p></div><button ref={createButton} className="studio-button primary" disabled={!jobsQuery.isSuccess || busy || unresolved} onClick={() => open(null)}><Plus size={17} aria-hidden="true"/>新建岗位</button></div>
    {message && <p className="studio-notice success" role="status">{message}</p>}
    {error && !editor && <p className="studio-notice danger" role="alert">{error}</p>}
    {!editor && recovery}
    {jobsQuery.isPending && <p className="studio-card studio-empty" role="status">正在读取岗位设置…</p>}
    {jobsQuery.isError && <div className="studio-notice danger" role="alert">岗位设置暂时无法加载。<button className="studio-button subtle" disabled={jobsQuery.isFetching} onClick={() => void jobsQuery.refetch()}>重新读取岗位</button></div>}
    {jobsQuery.isSuccess && !jobs.length && <section className="studio-card studio-empty"><span className="studio-icon"><Briefcase aria-hidden="true"/></span><h3>先确定一个想准备的岗位</h3><p>填写岗位名称即可开始。职级、公司和职位描述都可以稍后补充。</p><button className="studio-button primary" disabled={busy || unresolved} onClick={() => open(null)}>创建目标岗位<ArrowRight size={16} aria-hidden="true"/></button></section>}
    {jobs.length > 0 && <section aria-label="已保存岗位" className="job-grid">{jobs.map(job => <article className={`studio-card job-card ${job.isActive ? 'is-current' : ''}`} key={job.id}>
      <div className="job-card-top"><span className="studio-icon"><Briefcase size={20} aria-hidden="true"/></span><span className={`studio-badge ${job.isActive ? 'positive' : ''}`}>{job.isActive ? '当前岗位' : '已保存'}</span></div>
      <h3 ref={element => { jobHeadings.current[job.id] = element; }} tabIndex={-1}>{job.title}</h3><p className="job-meta">{[job.company || '未指定公司', job.level || '职级不限'].join(' · ')}</p>
      {job.jobDescription ? <details className="job-description"><summary><FileText size={15} aria-hidden="true"/>查看职位描述</summary><p tabIndex={0} aria-label={`${job.title}的职位描述`}>{job.jobDescription}</p></details> : <p className="job-description-hint">添加职位描述，让准备方向更具体。</p>}
      <footer><button className="studio-button secondary" disabled={busy || unresolved} onClick={() => open(job)} aria-label={`编辑${job.title}`}><Pencil size={15} aria-hidden="true"/>编辑岗位</button>{job.isActive ? <Link className="studio-button subtle" to="/prepare/resumes">检查简历<ArrowRight size={15} aria-hidden="true"/></Link> : <button className="studio-button subtle" disabled={busy || unresolved} onClick={() => void activate(job)}>{activating === job.id ? <Loader2 size={15} className="animate-spin"/> : <Check size={15} aria-hidden="true"/>}{activating === job.id ? '切换中…' : '设为当前'}</button>}</footer>
    </article>)}</section>}
    {editor && <WorkflowDialog labelledBy="job-editor-title" busy={saving} onClose={close}>
      <form className="job-editor" onSubmit={save} noValidate><div className="studio-section-heading"><div><p className="studio-eyebrow">目标岗位</p><h2 id="job-editor-title">{editor.job ? '编辑岗位' : '创建目标岗位'}</h2></div><button type="button" className="studio-icon-button" disabled={saving} onClick={close} aria-label="关闭岗位编辑"><X size={20}/></button></div>
        <p className="studio-helper">{editor.job ? '更新只影响后续面试，历史面试保留原有岗位版本。' : '新岗位保存后将设为当前岗位。只有岗位名称为必填。'}</p>
        <fieldset disabled={saving || unresolved}><label>岗位名称<span aria-hidden="true"> *</span><input ref={titleInput} required maxLength={120} aria-invalid={fieldError?.field === 'title' || undefined} aria-describedby={fieldError?.field === 'title' ? 'job-title-error' : undefined} placeholder="例如：前端开发工程师" value={form.title} onChange={event => { setForm({ ...form, title: event.target.value }); if (fieldError?.field === 'title') setFieldError(null); }}/></label>
          {fieldError?.field === 'title' && <p id="job-title-error" role="alert" className="studio-field-error">{fieldError.message}</p>}
          <div className="studio-field-row"><label>职级<input maxLength={32} placeholder="例如：P5 / 高级" value={form.level} onChange={event => setForm({ ...form, level: event.target.value })}/></label><label>公司（可选）<input maxLength={120} placeholder="目标公司" value={form.company} onChange={event => setForm({ ...form, company: event.target.value })}/></label></div>
          <label>职位描述（可选）<textarea ref={descriptionInput} rows={6} maxLength={12000} aria-invalid={fieldError?.field === 'jobDescription' || undefined} aria-describedby={`job-description-hint${fieldError?.field === 'jobDescription' ? ' job-description-error' : ''}`} placeholder="粘贴招聘岗位的职责与要求" value={form.jobDescription} onChange={event => { setForm({ ...form, jobDescription: event.target.value }); if (fieldError?.field === 'jobDescription') setFieldError(null); }}/></label>
          <small id="job-description-hint">选填，20–12,000 字 · {form.jobDescription.length.toLocaleString()} / 12,000</small>
          {fieldError?.field === 'jobDescription' && <p id="job-description-error" role="alert" className="studio-field-error">{fieldError.message}</p>}
        </fieldset>
        {error && <p role="alert" className="studio-notice danger">{error}</p>}
        {recovery}
        {discard && <div className="studio-notice warning" role="alert"><p>有尚未保存的修改，要放弃吗？</p><div className="studio-action-row"><button type="button" className="studio-button secondary" onClick={() => setDiscard(false)}>继续编辑</button><button type="button" className="studio-button danger" onClick={() => { setEditor(null); setDiscard(false); }}>放弃修改</button></div></div>}
        <div className="candidate-dialog-actions studio-action-row"><button type="button" disabled={saving} className="studio-button secondary" onClick={close}>取消</button><button disabled={saving || unresolved || !form.title.trim()} className="studio-button primary">{saving && <Loader2 size={16} className="animate-spin"/>}{saving ? '保存中…' : '保存岗位'}</button></div>
      </form>
    </WorkflowDialog>}
  </div>;
}
