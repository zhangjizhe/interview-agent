import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileText, Link2, Loader2, Upload, X } from 'lucide-react';
import { api } from './api';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED = /\.(pdf|md|txt)$/i;
export type ImportReceipt = { count: number; questionIds: string[]; mode?: string; indexStatus?: string };
export function importReceipt(value: any): ImportReceipt {
  if (value?.success !== true || !Number.isSafeInteger(value.count) || value.count < 0 || value.count > 20
    || !Array.isArray(value.questionIds) || value.questionIds.length !== value.count
    || value.questionIds.some((id: unknown) => typeof id !== 'string' || !id.trim())
    || new Set(value.questionIds).size !== value.count
    || (value.mode != null && value.mode !== 'CATALOG')
    || (value.mode === 'CATALOG' && (value.canonicalStatus !== 'SAVED' || !['READY', 'PENDING'].includes(value.indexStatus)))) {
    throw new Error('未收到完整的导入结果，请先核对题库，避免重复导入。');
  }
  return value;
}
const bytes = (text: string) => new TextEncoder().encode(text).length;

export function QuestionImportPanel({ onImported, onBusy, positions = [] }: {
  onImported: () => void; onBusy: (busy: boolean) => void; positions?: string[];
}) {
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const alive = useRef(true);
  const [method, setMethod] = useState<'file' | 'url'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [dragging, setDragging] = useState(false);
  const [metadata, setMetadata] = useState({ position: '', level: 'P5', category: '' });
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState('');
  const [pending, setPending] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [receipt, setReceipt] = useState<ImportReceipt | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending]);
  const chooseFile = (candidate?: File) => {
    if (submitting.current || !candidate) return;
    setReceipt(null); setConsent(false);
    if (!ACCEPTED.test(candidate.name)) { setFile(null); setError('请选择 PDF、Markdown（.md）或 TXT 文件；暂不支持 JSON、Word 和图片。'); return; }
    if (!candidate.size || candidate.size > MAX_FILE_SIZE) { setFile(null); setError('文件不能为空，且不能超过 10 MB。'); return; }
    setFile(candidate); setError('');
  };
  const drop = (event: DragEvent) => {
    event.preventDefault(); setDragging(false);
    if (event.dataTransfer.files.length !== 1) { if (!pending) setError('每次请选择一个文件。'); return; }
    chooseFile(event.dataTransfer.files[0]);
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current || unknown) return;
    const reject = (message: string, field: string) => { setError(message); setInvalid(field); (event.currentTarget.elements.namedItem(field) as HTMLElement | null)?.focus(); };
    setInvalid('');
    const position = metadata.position.trim(), category = metadata.category.trim();
    if (!position || bytes(position) > 100) { reject('请填写目标岗位，长度不超过 100 字节。', 'position'); return; }
    if (!category || bytes(category) > 100) { reject('请填写题目主题，长度不超过 100 字节。', 'category'); return; }
    if (method === 'file' && !file) { reject('请先选择要导入的文件。', 'fileChoice'); return; }
    if (method === 'url') {
      try { const parsed = new URL(url.trim()); if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || bytes(url.trim()) > 2000) throw new Error(); }
      catch { reject('请输入完整的 HTTP 或 HTTPS 网页地址，不要包含用户名或密码。', 'url'); return; }
    }
    if (!consent) { reject('请确认允许解析内容并生成题目后再开始。', 'consent'); return; }
    submitting.current = true; setPending(true); onBusy(true); setError(''); setReceipt(null);
    try {
      const data = { position, level: metadata.level, category };
      let body: FormData | string;
      if (method === 'file') { const form = new FormData(); form.append('file', file!); Object.entries(data).forEach(([key, value]) => form.append(key, value)); body = form; }
      else body = JSON.stringify({ ...data, url: url.trim() });
      const result = importReceipt(await api(`/interview/question-bank/import-${method}`, { method: 'POST', body, signal: AbortSignal.timeout(190000) }));
      void client.invalidateQueries({ queryKey: ['agent-lab-question-bank'] });
      void client.invalidateQueries({ queryKey: ['question-catalog-status'] });
      if (alive.current) { setReceipt(result); onImported(); }
    } catch (cause) {
      if (alive.current) {
        setError(cause instanceof Error ? cause.message : '导入结果未确认。');
        setUnknown(true);
      }
    } finally {
      submitting.current = false;
      if (alive.current) { setPending(false); onBusy(false); }
    }
  };
  return <section className="qb-import" aria-labelledby="qb-import-title" aria-busy={pending}>
    <header className="qb-section-head"><div><h2 id="qb-import-title">导入题目</h2><p>先选择来源并归类，再开始解析。生成的题目将保存到当前组织的业务题库。</p></div><span className="qb-step-label">来源 → 归类 → 确认导入</span></header>
    <div className="qb-methods" role="group" aria-label="导入来源">
      <button type="button" aria-pressed={method === 'file'} disabled={pending} onClick={() => { setMethod('file'); setError(''); setReceipt(null); }}><Upload size={16}/>本地文件</button>
      <button type="button" aria-pressed={method === 'url'} disabled={pending} onClick={() => { setMethod('url'); setError(''); setReceipt(null); }}><Link2 size={16}/>网页链接</button>
    </div>
    <form onSubmit={submit} noValidate>
      <fieldset disabled={pending}><legend className="qb-sr-only">导入资料和题目归类</legend>
        {method === 'file' ? <div className={`qb-dropzone${dragging ? ' is-dragging' : ''}`} onDragOver={event => { event.preventDefault(); if (!pending) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}>
          <Upload size={26} aria-hidden="true"/><strong>拖入文件，或手动选择</strong><p id="qb-file-help">PDF / Markdown / TXT · 每次一个文件 · 最大 10 MB</p>
          <input ref={input} id="qb-import-file" type="file" accept=".pdf,.md,.txt" aria-label="选择题库文件" aria-describedby="qb-file-help" onChange={event => { chooseFile(event.target.files?.[0]); event.target.value = ''; }} className="qb-file-input" />
          <button name="fileChoice" className="qb-button qb-secondary" type="button" onClick={() => input.current?.click()}>选择文件</button>
          {file && <div className="qb-file-receipt"><FileText size={18}/><span><strong>{file.name}</strong><small>{file.size < 1024 ? `${file.size} B` : `${(file.size / 1024).toFixed(1)} KB`} · 已选择，尚未上传</small></span><button type="button" className="qb-icon-button" aria-label="移除所选文件" onClick={() => { setFile(null); setReceipt(null); setConsent(false); }}><X size={16}/></button></div>}
        </div> : <label className="qb-field">网页地址<input name="url" aria-label="网页地址" aria-describedby="qb-url-help" aria-invalid={invalid === 'url'} type="url" value={url} placeholder="https://example.com/technical-article" onChange={event => { setUrl(event.target.value); setReceipt(null); }} /><small id="qb-url-help">仅支持可公开访问的 HTTP / HTTPS 网页。</small></label>}
        <div className="qb-metadata">
          <label className="qb-field"><span className="qb-field-title">目标岗位 <span className="qb-required">必填</span></span><input name="position" aria-label="目标岗位" aria-describedby="qb-position-help" aria-invalid={invalid === 'position'} value={metadata.position} list="qb-import-positions" placeholder="例如：前端开发工程师" onChange={event => setMetadata({ ...metadata, position: event.target.value })}/><small id="qb-position-help">用于面试选题，与知识资料主题分开。</small></label>
          <datalist id="qb-import-positions">{[...new Set([...positions, '前端开发工程师', '后端开发工程师', 'AI Agent 工程师'])].filter(Boolean).map(value => <option key={value} value={value}/>)}</datalist>
          <label className="qb-field"><span className="qb-field-title">题目主题 <span className="qb-required">必填</span></span><input name="category" aria-label="题目主题" aria-describedby="qb-category-help" aria-invalid={invalid === 'category'} value={metadata.category} placeholder="例如：React 状态管理" onChange={event => setMetadata({ ...metadata, category: event.target.value })}/><small id="qb-category-help">对应题目的分类，描述具体技术方向。</small></label>
          <label className="qb-field">目标职级<select aria-label="目标职级" aria-describedby="qb-level-help" value={metadata.level} onChange={event => setMetadata({ ...metadata, level: event.target.value })}>{['P4', 'P5', 'P6', 'P7'].map(value => <option key={value}>{value}</option>)}</select><small id="qb-level-help">职级参考，不是自动测得的难度。</small></label>
        </div>
        <p className="qb-notice">将调用模型解析、提取或生成题目并建立索引，会消耗额度。当前一次最多返回 20 题；长文仅处理前段内容，不保证覆盖全文。原文不会在此自动存为 RAG 文档。</p>
        <label className="qb-check"><input name="consent" aria-invalid={invalid === 'consent'} type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/>我已确认来源和归类，允许本次模型处理</label>
      </fieldset>
      {error && <div className="qb-feedback is-error" role="alert"><strong>{unknown ? '导入结果未确认' : '请检查导入内容'}</strong><p>{error}</p>{unknown && <><p>可能已产生费用或保存了部分题目。文件和输入已保留，请先核对题库，不要直接重复提交。</p><button type="button" className="qb-button qb-secondary" onClick={() => { setUnknown(false); setConsent(false); setError('请核对上次导入结果，再重新确认。重复导入可能产生重复题目和费用。'); }}>已核对，重新确认导入</button></>}</div>}
      {receipt && <div className={`qb-feedback${receipt.count ? ' is-success' : ''}`} role="status"><CheckCircle2 size={18}/><div><strong>{receipt.count ? `已确认保存 ${receipt.count} 道题目` : '本次没有生成可导入的题目'}</strong><p>{receipt.count ? receipt.indexStatus === 'PENDING' ? '题目已保存，检索索引待处理，无需重复导入。' : '可回到题目列表查看。请抽查题目内容与参考答案。' : '没有新增题目；模型处理仍可能产生费用。请检查资料是否包含题目或技术内容。'}</p><button type="button" className="qb-button qb-secondary" onClick={() => { setReceipt(null); setFile(null); setUrl(''); setConsent(false); }}>继续导入其他资料</button></div></div>}
      <footer className="qb-form-footer"><p>{pending ? '正在上传、解析并保存，请等待最终结果。' : '选择文件不会自动上传。提交后请等待结果再操作。'}</p><button className="qb-button qb-primary" type="submit" disabled={pending || unknown || receipt !== null}>{pending ? <Loader2 className="qb-spin" size={16}/> : <Upload size={16}/>} {pending ? '导入处理中…' : receipt ? '本次导入已结束' : '开始导入'}</button></footer>
    </form>
  </section>;
}
