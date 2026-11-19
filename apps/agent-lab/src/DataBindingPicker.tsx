import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { readCollectionPage } from './lab-data-client';

export function DataBindingPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const choices = useQuery({ queryKey: ['lab-data-bindings', page, search], queryFn: () => readCollectionPage(`/agent-lab/data-collections?${new URLSearchParams({ page: String(page), q: search })}`) });
  const kinds = { QUESTION: '题目', ARTICLE: '文章', DOCUMENT: '文档' };
  const paging = choices.isFetching;
  return <fieldset className="binding-panel">
    <legend>资料集合绑定</legend>
    <p>已选择 {value.length} / 5 个集合，仅当前 Agent 版本可读。其他 Agent 不会自动获得绑定；撤销授权或归档会阻止后续读取。</p>
    <div className="binding-search">
      <label>查找资料集合<input maxLength={120} value={query} onChange={e => setQuery(e.target.value)} placeholder="按集合名称筛选" /></label>
      <button type="button" className="lab-btn-primary" onClick={() => { setSearch(query); setPage(1); }}><Search size={15} aria-hidden="true" />查找集合</button>
    </div>
    {choices.isError ? <p role="alert">{(choices.error as Error).message} <button type="button" className="lab-btn-ghost" onClick={() => void choices.refetch()}>重试读取可绑定集合</button></p> : choices.isLoading ? <p>正在读取可绑定集合…</p> : <div className="data-binding-options">{choices.data?.items.map(item => <label key={item.id}><input type="checkbox" checked={value.includes(item.id)} disabled={!value.includes(item.id) && value.length >= 5} onChange={e => onChange(e.target.checked ? [...value, item.id] : value.filter(id => id !== item.id))} />{item.name} · {kinds[item.kind]}</label>)}</div>}
    <div className="binding-pager">
      <div className="binding-pager-nav">
        <button type="button" disabled={page === 1 || paging} onClick={() => setPage(page - 1)}>上一页集合</button>
        <span className="binding-page">第 {page} 页</span>
        <button type="button" disabled={!choices.data?.hasMore || paging || page >= 1000} onClick={() => setPage(page + 1)}>下一页集合</button>
      </div>
      <button type="button" className="lab-btn-ghost" disabled={!value.length} onClick={() => onChange([])}>清除资料绑定</button>
    </div>
    <p>每次运行最多读取 5 条相关资料并限制总长度。保存后选中的固定版本决定实际绑定，未保存的勾选不影响运行。</p>
  </fieldset>;
}
