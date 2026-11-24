import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, FileText, Loader2, RefreshCw, Search, UploadCloud, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { safeJson } from '../utils/safeJson';
import { getSession } from '../utils/auth';
import { resumeFileError } from '../utils/resumeFile';
import type { TargetJob } from '../utils/training';
import { isResumeRecord, isTargetJob, type ResumeRecord } from '../utils/preparation';

const when = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) : '保存时间未提供';

export function ResumesPage() {
  const client = useQueryClient();
  const userId = getSession()?.userId || '';
  const intentKey = `ia_resume_upload_unresolved:${userId}`;
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState('');
  const [filter, setFilter] = useState('');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [unresolved, setUnresolved] = useState(() => Boolean(sessionStorage.getItem(intentKey)));
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const chooseButton = useRef<HTMLButtonElement>(null);
  const restoreAfterRecovery = useRef(false);
  useEffect(() => {
    if (!unresolved && restoreAfterRecovery.current) {
      restoreAfterRecovery.current = false; chooseButton.current?.focus();
    }
  }, [unresolved]);
  useEffect(() => { if (error || message) feedback.current?.focus(); }, [error, message]);
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!uploading) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [uploading]);
  const resumes = useQuery({ queryKey: ['resumes', userId], enabled: Boolean(userId), queryFn: async () => {
    const response = await fetch(`/api/interview/resumes/${encodeURIComponent(userId)}`);
    const data = await safeJson(response);
    if (!response.ok || data?._error) throw new Error(data?.message || '无法读取简历库');
    if (!Array.isArray(data?.resumes) || !data.resumes.every(isResumeRecord)) throw new Error('简历列表响应异常，请重新读取。');
    return data.resumes as ResumeRecord[];
  }});
  const jobs = useQuery({ queryKey: ['target-jobs'], queryFn: async () => {
    const response = await fetch('/api/interview/target-jobs'); const data = await safeJson(response);
    if (!response.ok || data?._error || !Array.isArray(data) || !data.every(isTargetJob)) throw new Error('暂时无法读取岗位');
    return data as TargetJob[];
  }});
  const activeJob = jobs.data?.find(job => job.isActive);
  const selected = target === '' ? activeJob?.title || '通用岗位' : target === 'general' ? '通用岗位' : jobs.data?.find(job => job.id === target)?.title || '通用岗位';
  const pick = (files: FileList | File[] | null) => {
    if (pending.current || unresolved) return;
    setError(''); setMessage('');
    if (!files?.length) return;
    if (files.length !== 1) { setFile(null); setError('请每次选择一份简历。'); return; }
    const next = files[0]; const invalid = resumeFileError(next);
    if (invalid) { setFile(null); setError(invalid); return; }
    setFile(next);
  };
  const upload = async () => {
    if (!file || pending.current || unresolved || jobs.isPending) return;
    pending.current = true; setUploading(true); setError(''); setMessage('');
    let sent = false;
    const abort = new AbortController(); controller.current = abort;
    const timer = window.setTimeout(() => abort.abort(), 90_000);
    try {
      try { sessionStorage.setItem(intentKey, 'pending'); }
      catch { throw new Error('浏览器无法记录上传状态，本次尚未提交。请检查浏览器存储设置后重试。'); }
      const body = new FormData(); body.append('file', file); body.append('position', selected);
      sent = true;
      const response = await fetch('/api/interview/upload-resume', { method: 'POST', body, signal: abort.signal });
      const data = await safeJson(response);
      if (!response.ok || data?._error) throw new Error(data?.message || '上传未完成');
      if (data?.ragIngested !== true) throw new Error('服务器未确认保存结果。');
      sessionStorage.removeItem(intentKey); setUnresolved(false); setFile(null);
      if (input.current) input.current.value = '';
      setMessage('简历已解析并保存到个人简历库。列表会重新读取；如暂未更新，可刷新核对摘要与技能。');
      void client.invalidateQueries({ queryKey: ['resumes', userId] });
      void client.invalidateQueries({ queryKey: ['readiness'] });
    } catch (reason) {
      if (sent) { setUnresolved(true); setChecked(false); }
      const detail = reason instanceof Error && reason.name !== 'AbortError' ? reason.message : '等待响应结束，服务器可能仍在处理。';
      setError(sent ? `${detail} 请先重新读取简历核对，避免重复上传和计费。` : detail);
    } finally { window.clearTimeout(timer); pending.current = false; setUploading(false); controller.current = null; }
  };
  const rows = (resumes.data || []).filter(row => `${row.name || ''} ${row.position || ''} ${row.skills || ''} ${row.summary || ''}`.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()));
  return <div className="preparation-content">
    <div className="studio-section-heading"><div><h2>我的简历</h2><p>随时上传、检查已解析的经历与技能，为个性化提问提供依据。</p></div><a href="#resume-library-title" className="studio-button subtle">查看已保存{resumes.data ? `（${resumes.data.length}）` : ''}<ArrowRight size={15} aria-hidden="true"/></a></div>
    <div className="resume-workspace">
      <section className="studio-card resume-upload" aria-labelledby="upload-title"><div className="studio-section-heading"><h3 id="upload-title">上传简历</h3><span className="studio-badge">PDF / MD / TXT</span></div>
        <div className={`resume-dropzone ${dragging ? 'is-dragging' : ''}`} onDragOver={event => { event.preventDefault(); if (!uploading && !unresolved) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); pick(event.dataTransfer.files); }}>
          <span className="studio-icon"><UploadCloud size={26} aria-hidden="true"/></span><h4>{file ? '文件已就绪' : '把简历拖到这里'}</h4><p>支持 PDF、Markdown、TXT，单个文件不超过 10 MB。</p>
          <button ref={chooseButton} type="button" className="studio-button secondary" disabled={uploading || unresolved} onClick={() => input.current?.click()}>{file ? '重新选择文件' : '选择简历文件'}</button>
          <input ref={input} type="file" aria-label="选择简历文件" accept=".pdf,.md,.txt" className="hidden" disabled={uploading || unresolved} onChange={event => { pick(event.target.files); event.target.value = ''; }}/>
        </div>
        {file && <div className="selected-resume" role="status" aria-label="所选简历"><FileText size={20} aria-hidden="true"/><div><strong>{file.name}</strong><small>{Math.max(1, Math.ceil(file.size / 1024)).toLocaleString()} KB · {uploading ? '已发送，正在等待解析与保存回执' : unresolved ? '已提交，保存结果待核对' : '仅选择文件，尚未上传'}</small></div><button type="button" aria-label="移除所选文件" disabled={uploading || unresolved} className="studio-icon-button" onClick={() => setFile(null)}><X size={18}/></button></div>}
        <label className="studio-field">解析参考岗位<select value={target} disabled={uploading || unresolved || jobs.isPending} onChange={event => setTarget(event.target.value)}><option value="">{jobs.isPending ? '正在读取参考岗位…' : activeJob ? `当前岗位 · ${activeJob.title}` : '通用岗位（可稍后设置目标岗位）'}</option>{activeJob && <option value="general">通用岗位</option>}{jobs.data?.filter(job => !job.isActive).map(job => <option key={job.id} value={job.id}>{job.title}</option>)}</select><small>用于本次解析，不会切换当前目标岗位。</small></label>
        {jobs.isError && <p className="studio-helper">岗位暂时无法读取，仍可按通用岗位上传。<button className="studio-text-button" disabled={jobs.isFetching} onClick={() => void jobs.refetch()}>重读岗位</button></p>}
        <p className="studio-helper">确认上传后将进行 AI 解析和存储，可能产生模型费用。建议先移除身份证号等与面试无关的敏感信息。</p>
        <div ref={feedback} tabIndex={-1} className="resume-feedback" role="group" aria-label="上传反馈">
          {message && <p className="studio-notice success" role="status"><CheckCircle2 size={18} aria-hidden="true"/>{message}</p>}
          {error && <p className="studio-notice danger" role="alert">{error}</p>}
        </div>
        <button className="studio-button primary upload-submit" disabled={!file || uploading || unresolved || jobs.isPending} onClick={() => void upload()}>{uploading ? <Loader2 size={17} className="animate-spin"/> : <UploadCloud size={17} aria-hidden="true"/>}{uploading ? '正在解析并保存…' : '上传并解析'}</button>
        {uploading && <p role="status" className="studio-helper">处理中，请保留此页。文件解析和保存可能需要一些时间，不要重复提交。</p>}
      </section>
      <aside className="resume-guide"><p className="studio-eyebrow">资料如何用于面试</p><ol><li><span>1</span><div><h3>提取经历与技能</h3><p>检查解析摘要，确认项目和技术方向是否完整。</p></div></li><li><span>2</span><div><h3>保存到个人简历库</h3><p>后续面试可读取你的已保存简历上下文。</p></div></li><li><span>3</span><div><h3>进入面试前再次确认</h3><p>在面试房间检查本场实际读取的简历，再开始答题。</p></div></li></ol><Link className="studio-button secondary" to="/prepare/jobs">设置目标岗位<ArrowRight size={16} aria-hidden="true"/></Link></aside>
    </div>
    {unresolved && <section className="studio-notice warning" aria-label="待核对的上传"><h3>有一笔上传尚未核对</h3><p>网络中断不代表保存失败。先展开下方简历核对；重新读取不会再次触发解析。确认需要重传后再解除锁定。</p><div className="studio-action-row"><button className="studio-button secondary" disabled={resumes.isFetching || uploading} onClick={async () => { setChecked(false); const result = await resumes.refetch(); setChecked(result.isSuccess); }}>重新读取简历</button><button className="studio-button subtle" disabled={uploading || resumes.isFetching || !checked} onClick={() => { sessionStorage.removeItem(intentKey); restoreAfterRecovery.current = true; setUnresolved(false); setChecked(false); setError(''); }}>已核对，允许再次上传</button></div></section>}
    <section className="resume-library" aria-labelledby="resume-library-title"><div className="studio-section-heading"><div><h2 id="resume-library-title" tabIndex={-1}>已保存的简历</h2><p>当前显示最多 10 份已保存摘要，可能不包含全部历史。进入面试后，请核对本场使用的内容。</p></div><button className="studio-button secondary" disabled={resumes.isFetching || uploading} onClick={() => void resumes.refetch()}><RefreshCw size={15} className={resumes.isFetching ? 'animate-spin' : ''} aria-hidden="true"/>刷新列表</button></div>
      {resumes.isPending && <p role="status" className="studio-card studio-empty">正在读取个人简历库…</p>}
      {resumes.isError && <p role="alert" className="studio-notice danger">简历库读取失败，无法确认已保存的资料。请刷新列表重试；读取失败不代表资料已丢失。</p>}
      {resumes.isSuccess && <><label className="resume-search"><Search size={17} aria-hidden="true"/><input aria-label="搜索已读取简历" type="search" placeholder="搜索姓名、岗位或技能" value={filter} onChange={event => setFilter(event.target.value)}/><span>{rows.length} / {resumes.data.length}</span></label>
        {!resumes.data.length ? <div className="studio-card studio-empty"><FileText size={28} aria-hidden="true"/><h3>还没有读取到已保存简历</h3><p>从上方上传一份简历。保存成功后，会在这里展示解析摘要。</p></div> : !rows.length ? <p className="studio-card studio-empty">当前已读取条目中没有匹配结果。<button className="studio-text-button" onClick={() => setFilter('')}>清除搜索</button></p> : <div className="resume-records">{rows.map((row, index) => <details className="studio-card resume-record" key={`${row.createdAt}-${row.name}-${index}`}><summary><span className="studio-icon"><FileText size={20} aria-hidden="true"/></span><span><strong>{row.name || '未命名简历'}</strong><small>{row.position || '岗位未提供'} · {when(row.createdAt)}</small></span><span className="studio-badge positive">已保存</span><span className="resume-expand">查看摘要</span></summary><div className="resume-record-content"><h3>解析摘要</h3><p>{row.summary || '此条目没有返回摘要。'}</p><h3>已提取技能</h3><div className="resume-skills">{row.skills ? row.skills.split(/[、,，;；]+/).filter(Boolean).map((skill, i) => <span key={i}>{skill.trim()}</span>) : <p>此条目没有返回技能。</p>}</div><p className="studio-helper">这是已存储的解析摘要，原始文件下载、版本选择与删除暂未提供。</p></div></details>)}</div>}
      </>}
    </section>
  </div>;
}
