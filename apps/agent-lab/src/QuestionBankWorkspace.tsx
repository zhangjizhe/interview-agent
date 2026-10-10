import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Trash2 } from 'lucide-react';
import { api } from './api';

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
};

export function QuestionBankWorkspace({
  questions,
  query,
  position,
  searchResults,
  message,
  loading = false,
  searching = false,
  onQuery,
  onPosition,
  onSearch,
  onClearSearch,
}: {
  questions: QuestionBankItem[];
  query: string;
  position: string;
  searchResults: QuestionBankItem[] | null;
  message: string;
  loading?: boolean;
  searching?: boolean;
  onQuery: (value: string) => void;
  onPosition: (value: string) => void;
  onSearch: () => void;
  onClearSearch: () => void;
}) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ position: 'AI Agent 工程师', level: 'P5', category: '通用', question: '', answer: '', tags: '' });
  const createQuestion = useMutation({
    mutationFn: () => api('/interview/question-bank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, tags: form.tags.split(/[,，、\s]+/).filter(Boolean) }),
    }),
    onSuccess: () => {
      setShowCreate(false);
      setForm({ position: 'AI Agent 工程师', level: 'P5', category: '通用', question: '', answer: '', tags: '' });
      queryClient.invalidateQueries({ queryKey: ['agent-lab-question-bank'] });
      onClearSearch();
    },
  });
  const deleteQuestion = useMutation({
    mutationFn: async (questionId: string) => {
      const result = await api(`/interview/question-bank/${encodeURIComponent(questionId)}`, { method: 'DELETE' });
      if (result.deleted !== true) throw new Error('删除未确认，请刷新后核验。');
      return result;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['agent-lab-question-bank'] }); onClearSearch(); },
  });
  const visibleQuestions = searchResults ?? questions;

  return <div className="agent-page-grid">
    <section className="lab-command-form question-bank-toolbar">
      <div><p className="agent-eyebrow">QUESTION BANK</p><h2>题库治理</h2><p className="question-bank-note">管理员维护题目覆盖、来源和质量。新增会调用一次向量模型；搜索会调用向量与精排模型，每次模型请求估算上限0.05元。列表与删除不调用模型。</p></div>
      <label>岗位<input value={position} onChange={(event) => onPosition(event.target.value)} placeholder="筛选岗位" /></label>
      <label>搜索题目<input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="输入关键词" /></label>
      <div className="question-bank-actions">
        <button className="agent-command" type="button" onClick={onSearch} disabled={!query.trim() || searching}><Search size={16}/>{searching ? '搜索中' : '搜索'}</button>
        {searchResults && <button className="agent-command quiet-command" type="button" onClick={onClearSearch}>清除</button>}
        <button className="agent-command" type="button" disabled={createQuestion.isPending} onClick={() => setShowCreate((value) => !value)}><Plus size={16}/>{showCreate ? '关闭新增' : '新增题目'}</button>
      </div>
    </section>
    {message && <p className="agent-error">{message}</p>}
    {createQuestion.isError && <p className="agent-error">{createQuestion.error instanceof Error ? createQuestion.error.message : '题目保存失败'}。若结果未知，请先刷新核验，避免重复调用模型。</p>}
    {deleteQuestion.isError && <p className="agent-error" role="alert">题目删除失败，请刷新核验后重试。</p>}
    {showCreate && <form className="lab-command-form question-bank-create" onSubmit={(event) => { event.preventDefault(); if (!createQuestion.isPending) createQuestion.mutate(); }}>
      <label>岗位<input required disabled={createQuestion.isPending} value={form.position} onChange={(event) => setForm({ ...form, position: event.target.value })} /></label>
      <label>职级<input disabled={createQuestion.isPending} value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })} /></label>
      <label>分类<input disabled={createQuestion.isPending} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></label>
      <label className="question-bank-wide">题目<textarea required rows={3} disabled={createQuestion.isPending} value={form.question} onChange={(event) => setForm({ ...form, question: event.target.value })} /></label>
      <label className="question-bank-wide">参考答案<textarea required rows={4} disabled={createQuestion.isPending} value={form.answer} onChange={(event) => setForm({ ...form, answer: event.target.value })} /></label>
      <label>标签<input disabled={createQuestion.isPending} value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="架构,性能" /></label>
      <button className="agent-command" type="submit" disabled={createQuestion.isPending}><Plus size={16}/>{createQuestion.isPending ? '保存中' : '保存题目'}</button>
    </form>}
    {!visibleQuestions.length ? loading ? <EmptyState title="正在读取题库" text="请稍候" /> : message ? null : <EmptyState title="暂无题目" text={searchResults ? '没有匹配的题目。' : '题库列表为空，可新增题目或导入脱敏题库。'} /> : <section className="lab-list">{visibleQuestions.map((item) => <article className="lab-row question-bank-row" key={item.questionId || item.id}>
      <div><p className="agent-eyebrow">{item.position} / {item.level || '未指定'} / {item.category || '通用'}</p><h2>{item.question}</h2><details><summary>参考答案</summary><p>{item.answer || '未提供参考答案'}</p></details><p>{item.source || '来源未记录'} · {Array.isArray(item.tags) ? item.tags.join('、') : item.tags || '无标签'}</p></div>
      <div className="question-bank-row-actions"><button className="icon-command danger-command" type="button" title="删除题目" onClick={() => { if (item.questionId && window.confirm('删除这道题目？')) deleteQuestion.mutate(item.questionId); }} disabled={deleteQuestion.isPending || !item.questionId}><Trash2 size={16}/></button></div>
    </article>)}</section>}
  </div>;
}

function EmptyState({ title, text }: { title: string; text: string }) { return <section className="lab-empty"><h2>{title}</h2><p>{text}</p></section>; }
