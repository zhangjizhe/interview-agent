import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { readCollectionPage } from './lab-data-client';
export function DataBindingPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const [page, setPage] = useState(1); const [query, setQuery] = useState(''); const [search, setSearch] = useState('');
  const choices = useQuery({ queryKey: ['lab-data-bindings', page, search], queryFn: () => readCollectionPage(`/agent-lab/data-collections?${new URLSearchParams({ page: String(page), q: search })}`) });
  const kinds = { QUESTION: '题目', ARTICLE: '文章', DOCUMENT: '文档' };
  return <fieldset><legend>资料集合绑定</legend><p>已选择 {value.length} / 5 个集合，仅当前 Agent 版本可读。其他 Agent 不会自动获得绑定；撤销授权或归档会阻止后续读取。</p>
    <label>查找资料集合<input maxLength={120} value={query} onChange={e => setQuery(e.target.value)} /></label><button type="button" onClick={() => { setSearch(query); setPage(1); }}>查找集合</button>
    {choices.isError ? <p role="alert">{(choices.error as Error).message} <button type="button" onClick={() => void choices.refetch()}>重试读取可绑定集合</button></p> : choices.isLoading ? <p>正在读取可绑定集合…</p> : <div className="data-binding-options">{choices.data?.items.map(item => <label key={item.id}><input type="checkbox" checked={value.includes(item.id)} disabled={!value.includes(item.id) && value.length >= 5} onChange={e => onChange(e.target.checked ? [...value, item.id] : value.filter(id => id !== item.id))} />{item.name} · {kinds[item.kind]}</label>)}</div>}
    <div><button type="button" disabled={page === 1 || choices.isFetching} onClick={() => setPage(page - 1)}>上一页集合</button><span>第 {page} 页</span><button type="button" disabled={!choices.data?.hasMore || choices.isFetching || page >= 1000} onClick={() => setPage(page + 1)}>下一页集合</button><button type="button" disabled={!value.length} onClick={() => onChange([])}>清除资料绑定</button></div>
    <p>每次运行最多读取 5 条相关资料并限制总长度。保存后选中的固定版本决定实际绑定，未保存的勾选不影响运行。</p>
  </fieldset>;
}
