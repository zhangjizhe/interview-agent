import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import './knowledge-library.css';

type KnowledgeItem = { id: string; title: string; topic: string; body: string; tags: string[] };
const READ_LIMIT = 200;

function checkedItems(value: unknown): KnowledgeItem[] {
  if (!value || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items)
    || value.items.length > READ_LIMIT || value.items.some(item => !item || typeof item.id !== 'string'
      || !item.id.trim() || typeof item.title !== 'string' || typeof item.topic !== 'string'
      || typeof item.body !== 'string' || !Array.isArray(item.tags) || item.tags.some((tag: unknown) => typeof tag !== 'string'))
    || new Set(value.items.map(item => item.id)).size !== value.items.length) {
    throw new Error('知识资料返回格式异常，未将读取失败显示为空资料库。');
  }
  return value.items;
}

export function KnowledgeLibraryPanel() {
  const [search, setSearch] = useState('');
  const [topic, setTopic] = useState('');
  const [expanded, setExpanded] = useState('');
  const library = useQuery<KnowledgeItem[]>({ queryKey: ['lab-historical-knowledge'], retry: false,
    queryFn: async () => {
      try {
        return checkedItems(await api(`/knowledge-base/list?limit=${READ_LIMIT}`, { signal: AbortSignal.timeout(15000) }));
      } catch (error) {
        if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) {
          throw new Error('知识资料读取超时，请核对存储服务后重新读取。');
        }
        throw error;
      }
    } });
  const items = library.isError ? [] : library.data ?? [];
  const topics = [...new Set(items.map(item => item.topic))].sort();
  const query = search.trim().toLowerCase();
  const visible = items.filter(item => (!topic || item.topic === topic)
    && `${item.title} ${item.topic} ${item.tags.join(' ')}`.toLowerCase().includes(query));
  return <section className="knowledge-library" aria-label="RAG 历史知识资料">
    <header><div><p className="agent-eyebrow">KNOWLEDGE LIBRARY</p><h2>RAG 知识资料 · 只读</h2><p>读取当前组织已保存的历史题目和技术资料。此处不会导入、重建索引或自动绑定给 Agent。</p></div>
      <button type="button" disabled={library.isFetching} onClick={() => library.refetch()}>{library.isFetching ? '读取中' : '重新读取知识资料'}</button></header>
    <p className="knowledge-library-note">这些资料与“业务题库”的记录、评测用例独立。筛选仅针对已加载的标题、主题和标签，不调用模型。</p>
    {library.isPending && <p role="status">正在读取历史知识资料…</p>}
    {library.isError && <p role="alert">知识资料读取失败：{library.error.message}</p>}
    {library.isSuccess && !library.isError && <p role="status">已加载 {items.length} 条知识资料 · 当前筛选 {visible.length} 条 · 本次读取上限 {READ_LIMIT} 条；不是全库存储总量。</p>}
    <div className="knowledge-library-filters"><label>筛选知识资料<input value={search} onChange={event => { setSearch(event.target.value); setExpanded(''); }} placeholder="标题、主题或标签" /></label>
      <label>资料主题<select value={topic} onChange={event => { setTopic(event.target.value); setExpanded(''); }}><option value="">全部主题</option>{topics.map(value => <option key={value}>{value}</option>)}</select></label></div>
    {library.isSuccess && !items.length && <p>当前组织未返回知识资料；这不证明其他组织或历史存储没有数据。</p>}
    {Boolean(items.length) && !visible.length && <p>已加载的资料中没有匹配项，请调整筛选。</p>}
    <div className="knowledge-library-items">{visible.map(item => <article key={item.id}>
      <p className="knowledge-library-topic">{item.topic} · <code>{item.id}</code></p><h3>{item.title}</h3>
      <div className="knowledge-library-tags">{item.tags.map((tag, index) => <span key={`${index}:${tag}`}>{tag}</span>)}</div>
      <button type="button" aria-expanded={expanded === item.id} onClick={() => setExpanded(current => current === item.id ? '' : item.id)}>{expanded === item.id ? '收起资料' : `查看资料：${item.title}`}</button>
      {expanded === item.id && <div className="knowledge-library-body"><h4>已保存的资料正文</h4><pre>{item.body.slice(0, 30000)}</pre>{item.body.length > 30000 && <p>正文超过本次展示上限，内容已截断。</p>}<p>来源链接未由现有接口返回；不推测或补造来源。</p></div>}
    </article>)}</div>
  </section>;
}
