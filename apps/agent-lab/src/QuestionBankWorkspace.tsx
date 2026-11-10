import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Trash2, Upload, BookOpen, Loader2 } from 'lucide-react';
import { api } from './api';
import { QuestionImportPanel } from './QuestionImportPanel';
import './question-workspace.css';

export type QuestionBankItem = {
  id: string;
  questionId?: string;
  position: string;
  level: string;
  category: string;
  question: string;
  answer: string;
  tags: string[] | string;
  difficulty?: string;
  source: string;
  version?: number;
  indexStatus?: string;
};

export function QuestionBankWorkspace({
  questions,
  query,
  position,
  searchResults,
  message,
  loading = false,
  searching = false,
  listError = false,
  retrying = false,
  onRetryList,
  onQuery,
  onPosition,
  onSearch,
  onClearSearch,
  onBusyChange,
}: {
  questions: QuestionBankItem[];
  query: string;
  position: string;
  searchResults: QuestionBankItem[] | null;
  message: string;
  loading?: boolean;
  searching?: boolean;
  listError?: boolean;
  retrying?: boolean;
  onRetryList?: () => void;
  onQuery: (value: string) => void;
  onPosition: (value: string) => void;
  onSearch: () => void;
  onClearSearch: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importPending, setImportPending] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [form, setForm] = useState({ position: 'AI Agent 工程师', level: 'P5', category: '通用', question: '', answer: '', tags: '' });
  const createQuestion = useMutation({
    mutationFn: async () => {
      const result = await api('/interview/question-bank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, tags: form.tags.split(/[,，、\s]+/).filter(Boolean) }),
      });
      if (result?.success !== true || typeof result.questionId !== 'string' || !result.questionId.trim()) {
        throw new Error('题目保存未确认，请先刷新核验。');
      }
      return result;
    },
    onSuccess: (result) => {
      setSaveMessage(result.mode === 'CATALOG' && result.indexStatus === 'PENDING'
        ? '题目已保存到主数据，检索索引尚未就绪。请在上方处理待索引题目，无需重复新增。'
        : '题目保存已确认。');
      setShowCreate(false);
      setForm({ position: 'AI Agent 工程师', level: 'P5', category: '通用', question: '', answer: '', tags: '' });
      queryClient.invalidateQueries({ queryKey: ['agent-lab-question-bank'] });
      queryClient.invalidateQueries({ queryKey: ['question-catalog-status'] });
      onClearSearch();
    },
  });
  const deleteQuestion = useMutation({
    mutationFn: async (questionId: string) => {
      const result = await api(`/interview/question-bank/${encodeURIComponent(questionId)}`, { method: 'DELETE' });
      if (result.deleted !== true) throw new Error('删除未确认，请刷新后核验。');
      return result;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['agent-lab-question-bank'] }); queryClient.invalidateQueries({ queryKey: ['question-catalog-status'] }); onClearSearch(); },
  });
  const visibleQuestions = searchResults ?? questions;

  const busy = createQuestion.isPending || importPending;
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  const positionOptions = [...new Set(questions.map(item => item.position).filter(Boolean))];
  return <div className="agent-page-grid qb-workspace">
    <section className="qb-toolbar">
      <header className="qb-section-head"><div><h2>业务题库</h2><p>按岗位与技术主题维护题目，参考答案默认收起。</p></div><div className="qb-header-actions">
        <button className="qb-button qb-secondary" type="button" disabled={busy} onClick={() => { setShowImport(false); setShowCreate(value => !value); createQuestion.reset(); }}><Plus size={16}/>{showCreate ? '关闭新增' : '新增题目'}</button>
        <button className="qb-button qb-primary" type="button" aria-expanded={showImport} disabled={busy} onClick={() => { setShowCreate(false); setShowImport(value => !value); }}><Upload size={16}/>{showImport ? '收起导入' : '导入题目'}</button>
      </div></header>
      <form className="qb-filterbar" onSubmit={event => { event.preventDefault(); if (!searching && query.trim()) onSearch(); }}>
        <label className="qb-field">岗位<input value={position} list="qb-filter-positions" onChange={event => onPosition(event.target.value)} placeholder="全部岗位 / 输入岗位" /></label>
        <datalist id="qb-filter-positions">{positionOptions.map(value => <option key={value} value={value}/>)}</datalist>
        <label className="qb-field qb-search-field">搜索题目<input value={query} onChange={event => onQuery(event.target.value)} placeholder="输入问题，进行语义搜索" /></label>
        <button className="qb-button qb-secondary" type="submit" disabled={!query.trim() || searching}>{searching ? <Loader2 className="qb-spin" size={16}/> : <Search size={16}/>} {searching ? '搜索中' : '搜索'}</button>
        {searchResults && <button className="qb-button qb-quiet" type="button" onClick={onClearSearch}>清除</button>}
        {(listError || retrying) && onRetryList && <button className="qb-button qb-secondary" type="button" disabled={retrying} onClick={onRetryList}>{retrying ? '读取中' : '重试读取题库'}</button>}
      </form>
      <p className="qb-help">语义搜索和新增会消耗模型额度；查看列表、展开答案和删除不调用模型。</p>
    </section>
    <div hidden={!showImport}><QuestionImportPanel positions={positionOptions} onBusy={setImportPending} onImported={onClearSearch}/></div>
    {message && <p className="qb-feedback is-error" role="alert">{message}</p>}
    {saveMessage && <p className="qb-feedback is-success" role="status">{saveMessage}</p>}
    {createQuestion.isError && <p className="qb-feedback is-error" role="alert">{createQuestion.error instanceof Error ? createQuestion.error.message : '题目保存失败'}。若结果未知，请先刷新核验，避免重复调用模型。</p>}
    {deleteQuestion.isError && <p className="agent-error" role="alert">题目删除失败，请刷新核验后重试。</p>}
    {showCreate && <form className="lab-command-form question-bank-create qb-create" onSubmit={(event) => { event.preventDefault(); if (!createQuestion.isPending) createQuestion.mutate(); }}>
      <header className="qb-section-head question-bank-wide"><div><h2>新增题目</h2><p>填写归类与参考答案。关闭表单会保留未保存的草稿。</p></div></header>
      <label>岗位<input required disabled={createQuestion.isPending} value={form.position} onChange={(event) => setForm({ ...form, position: event.target.value })} /></label>
      <label>职级<input disabled={createQuestion.isPending} value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })} /></label>
      <label>分类<input aria-label="分类" aria-describedby="qb-create-category-hint" disabled={createQuestion.isPending} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="例如：React 状态管理" /><small id="qb-create-category-hint">题目主题，与岗位、职级分开填写</small></label>
      <label className="question-bank-wide">题目<textarea required rows={3} disabled={createQuestion.isPending} value={form.question} onChange={(event) => setForm({ ...form, question: event.target.value })} /></label>
      <label className="question-bank-wide">参考答案<textarea required rows={4} disabled={createQuestion.isPending} value={form.answer} onChange={(event) => setForm({ ...form, answer: event.target.value })} /></label>
      <label>标签<input disabled={createQuestion.isPending} value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="架构,性能" /></label>
      <button className="qb-button qb-primary" type="submit" disabled={createQuestion.isPending}><Plus size={16}/>{createQuestion.isPending ? '保存中' : '保存题目'}</button>
    </form>}
    {!loading && !listError && <div className="qb-list-heading"><h2><BookOpen size={17}/>{searchResults ? '搜索结果' : '题目列表'}</h2><span>{visibleQuestions.length} 条已加载 · {searchResults ? '语义搜索结果' : '非全库总量'}</span></div>}
    {!visibleQuestions.length ? loading ? <EmptyState title="正在读取题库" text="请稍候" /> : message ? null : <EmptyState title="暂无题目" text={searchResults ? '没有匹配的题目。' : '题库列表为空，可新增题目或导入脱敏题库。'} /> : <section className="lab-list">{visibleQuestions.map((item) => <article className="lab-row question-bank-row" key={item.questionId || item.id}>
      <div><p className="agent-eyebrow">{item.position} / {item.level || '未指定'} / {item.category || '通用'}</p><h2>{item.question}</h2><details><summary>参考答案</summary><p>{item.answer || '未提供参考答案'}</p></details><p>{item.source || '来源未记录'} · {Array.isArray(item.tags) ? item.tags.join('、') : item.tags || '无标签'}</p>{item.version && <p>主数据版本 {item.version} · {item.indexStatus === 'READY' ? '索引就绪' : '待索引'}</p>}</div>
      <div className="question-bank-row-actions"><button className="qb-icon-button qb-danger" type="button" title="删除题目" aria-label={`删除题目：${item.question}`} onClick={() => { if (item.questionId && window.confirm(`删除题目“${item.question.slice(0, 80)}”？删除后请核对题库列表。`)) deleteQuestion.mutate(item.questionId); }} disabled={deleteQuestion.isPending || !item.questionId}><Trash2 size={16}/></button></div>
    </article>)}</section>}
  </div>;
}

function EmptyState({ title, text }: { title: string; text: string }) { return <section className="lab-empty"><h2>{title}</h2><p>{text}</p></section>; }
