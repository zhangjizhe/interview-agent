import { readCollectionPage, readDataPage, readRecordPage } from './lab-data-client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import './data-governance.css';

type Kind = 'QUESTION' | 'ARTICLE' | 'DOCUMENT';
type Collection = { id: string; name: string; kind: Kind; access: 'OWNER' | 'READ' | 'WRITE'; _count?: { records: number } };
type RecordItem = { id: string; collectionId: string; title: string; content: string; sourceUrl?: string | null; tags: string[]; revision: number };
const kinds = { QUESTION: '题目', ARTICLE: '文章', DOCUMENT: '文档' };
const accessNames = { OWNER: '所有者', READ: '只读', WRITE: '可编辑' };
const errorText = (error: unknown) => error instanceof Error ? error.message : '操作未完成，请重新读取后核验。';
function PageControls({ page, hasMore, pending, onPage }: { page: number; hasMore?: boolean; pending: boolean; onPage: (n: number) => void }) {
  return <div className="data-actions"><button disabled={page === 1 || pending} onClick={() => onPage(page - 1)}>上一页</button><span>第 {page} 页</span><button disabled={!hasMore || pending || page >= 1000} onClick={() => onPage(page + 1)}>下一页</button></div>;
}
export function DataGovernanceWorkspace() {
  const cache = useQueryClient();
  const [kind, setKind] = useState(''); const [page, setPage] = useState(1);
  const [name, setName] = useState(''); const [newKind, setNewKind] = useState<Kind>('ARTICLE');
  const [selected, setSelected] = useState<Collection | null>(null);
  const collections = useQuery<{ items: Collection[]; hasMore: boolean }>({ queryKey: ['lab-data-collections', kind, page], queryFn: () => readCollectionPage(`/agent-lab/data-collections?${new URLSearchParams({ page: String(page), limit: '20', ...(kind ? { kind } : {}) })}`) });
  const create = useMutation({ mutationFn: async () => {
    const result = await api('/agent-lab/data-collections', { method: 'POST', body: JSON.stringify({ name, kind: newKind }) });
    if (!result?.id || result.name !== name.trim() || result.kind !== newKind || result.access !== 'OWNER') throw new Error('集合保存未确认，请重新读取核验。');
    return result as Collection;
  }, onSuccess: result => { setName(''); setSelected(result); void cache.invalidateQueries({ queryKey: ['lab-data-collections'] }); } });
  return <section className="data-governance"><h2>数据治理</h2><p>资料集合默认私有。按题目、文章或文档分别管理；共享必须显式授权。Agent 只能读取已保存版本中绑定且仍有权限的集合。</p>
    <form className="data-actions" onSubmit={event => { event.preventDefault(); if (!create.isPending) create.mutate(); }}>
      <label>集合名称<input required maxLength={120} disabled={create.isPending} value={name} onChange={e => setName(e.target.value)} /></label>
      <label>资料类型<select aria-label="资料类型" disabled={create.isPending} value={newKind} onChange={e => setNewKind(e.target.value as Kind)}>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button disabled={create.isPending} type="submit">{create.isPending ? '创建中' : '创建私有集合'}</button>
    </form>
    {create.isError && <p role="alert">{errorText(create.error)}</p>}
    <label>筛选类型<select aria-label="筛选类型" value={kind} onChange={e => { setKind(e.target.value); setPage(1); }}><option value="">全部类型</option>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {collections.isError ? <p role="alert">资料集合读取失败：{errorText(collections.error)} <button onClick={() => void collections.refetch()}>重试读取集合</button></p> : collections.isLoading ? <p>正在读取资料集合…</p> : <>
      {!collections.data?.items.length && <p>没有可访问的资料集合。可创建私有集合，或请所有者授权。</p>}
      <div className="data-collection-list">{collections.data?.items.map(item => <button className={selected?.id === item.id ? 'selected' : ''} key={item.id} onClick={() => { create.reset(); setSelected(item); }}><strong>{item.name}</strong><span>{kinds[item.kind]} · {accessNames[item.access]} · {item._count?.records ?? 0} 条</span></button>)}</div>
      <PageControls page={page} hasMore={collections.data?.hasMore} pending={collections.isFetching} onPage={setPage} />
    </>}
    {selected && <CollectionDetail key={selected.id} collection={selected} onArchived={() => { setSelected(null); void cache.invalidateQueries({ queryKey: ['lab-data-collections'] }); }} />}
    <p>面试题库仍属于 Interview 应用的组织级共享数据；本页不会自动迁移其历史内容或修改归属。集合管理、版本和授权操作不调用模型。</p>
  </section>;
}
function CollectionDetail({ collection, onArchived }: { collection: Collection; onArchived: () => void }) {
  const [tab, setTab] = useState<'records' | 'grants' | 'audit'>('records');
  const archive = useMutation({ mutationFn: async () => {
    const result = await api(`/agent-lab/data-collections/${collection.id}`, { method: 'DELETE' });
    if (result?.id !== collection.id || result.archived !== true) throw new Error('归档结果未确认，请重新读取核验。');
  }, onSuccess: onArchived });
  return <section aria-label={`资料集合 ${collection.name}`} className="data-detail"><h3>{collection.name} · {kinds[collection.kind]}</h3><p>打开时权限：{accessNames[collection.access]}。归档或撤销授权后，后续 Agent 读取会被阻止；已发送的模型请求无法撤回。</p>
    <div className="data-actions"><button onClick={() => setTab('records')}>资料</button>{collection.access === 'OWNER' && <><button onClick={() => setTab('grants')}>共享权限</button><button onClick={() => setTab('audit')}>变更记录</button><button disabled={archive.isPending} onClick={() => { if (window.confirm('归档后所有 Agent 将无法继续读取此集合，历史版本仍保留。确认归档？')) archive.mutate(); }}>归档集合</button></>}</div>
    {archive.isError && <p role="alert">{errorText(archive.error)}</p>}
    {tab === 'records' && <Records collection={collection} />}{tab === 'grants' && <Grants collection={collection} />}{tab === 'audit' && <Audit collection={collection} />}
  </section>;
}
function Records({ collection }: { collection: Collection }) {
  const cache = useQueryClient(); const base = `/agent-lab/data-collections/${collection.id}`;
  const [page, setPage] = useState(1); const [query, setQuery] = useState(''); const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<RecordItem | null>(null); const [historyId, setHistoryId] = useState(''); const [historyPage, setHistoryPage] = useState(1);
  const [title, setTitle] = useState(''); const [content, setContent] = useState(''); const [sourceUrl, setSourceUrl] = useState('');
  const [notice, setNotice] = useState('');
  const records = useQuery({ queryKey: ['lab-data-records', collection.id, page, search], queryFn: () => readRecordPage(`${base}/records?${new URLSearchParams({ page: String(page), q: search })}`, collection.id), refetchInterval: 30000 });
  const history = useQuery<any>({ queryKey: ['lab-data-history', collection.id, historyId, historyPage], queryFn: () => readDataPage(`${base}/records/${historyId}/history?page=${historyPage}`), enabled: !!historyId });
  const reset = () => { setEditing(null); setTitle(''); setContent(''); setSourceUrl(''); };
  const refresh = () => { void cache.invalidateQueries({ queryKey: ['lab-data-records', collection.id] }); void cache.invalidateQueries({ queryKey: ['lab-data-history', collection.id] }); void cache.invalidateQueries({ queryKey: ['lab-data-collections'] }); };
  const save = useMutation({ onMutate: () => setNotice(''), mutationFn: async () => {
    const result = await api(`${base}/records${editing ? `/${editing.id}` : ''}`, { method: editing ? 'PUT' : 'POST', body: JSON.stringify({ title, content, ...(sourceUrl ? { sourceUrl } : {}), ...(editing ? { revision: editing.revision, tags: editing.tags } : {}) }) });
    if (!result?.id || result.collectionId !== collection.id || result.title !== title.trim() || result.content !== content || !Number.isInteger(result.revision) || result.revision !== (editing ? editing.revision + 1 : 1) || (editing && result.id !== editing.id)) throw new Error('资料保存未确认，请重新读取核验，避免重复创建。');
  }, onSuccess: () => { reset(); refresh(); setNotice('资料已保存，历史版本已记录。'); } });
  const remove = useMutation({ onMutate: () => setNotice(''), mutationFn: async (item: RecordItem) => {
    const result = await api(`${base}/records/${item.id}?revision=${item.revision}`, { method: 'DELETE' });
    if (result?.id !== item.id || result.deleted !== true) throw new Error('删除结果未确认，请重新读取核验。');
  }, onSuccess: () => { reset(); refresh(); setNotice('资料已删除，历史版本保留。'); } });
  const locked = save.isPending || remove.isPending;
  const canWrite = !records.isError && records.data && records.data.access !== 'READ';
  return <div><form className="data-actions" onSubmit={e => { e.preventDefault(); setSearch(query); setPage(1); }}><label>搜索资料<input maxLength={120} value={query} onChange={e => setQuery(e.target.value)} /></label><button type="submit">搜索</button><button type="button" onClick={() => void records.refetch()}>重新读取资料</button></form>
    {records.data && !records.isError && <p>当前资料权限：{accessNames[records.data.access]}</p>}{notice && <p role="status">{notice}</p>}{[save.error, remove.error].filter(Boolean).map((error, i) => <p role="alert" key={i}>{errorText(error)}</p>)}
    {records.isError ? <p role="alert">资料读取失败或授权已失效：{errorText(records.error)}</p> : <>
      {canWrite && <form className="data-record-form" onSubmit={e => { e.preventDefault(); if (!locked) save.mutate(); }}><fieldset disabled={locked}><legend>{editing ? '编辑资料' : '新增资料'}</legend>
        <label>资料标题<input required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} /></label><label>{collection.kind === 'QUESTION' ? '题目内容与参考答案' : '正文'}<textarea aria-label={collection.kind === 'QUESTION' ? '题目内容与参考答案' : '正文'} required maxLength={20000} rows={6} value={content} onChange={e => setContent(e.target.value)} /></label>
        <label>来源链接（可选）<input type="url" maxLength={2000} value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} /></label><button type="submit">{save.isPending ? '保存中' : '保存资料'}</button>{editing && <button type="button" onClick={reset}>取消编辑</button>}
      </fieldset></form>}
      {records.isLoading ? <p>正在读取资料…</p> : !records.data?.items.length ? <p>当前集合没有匹配的资料。</p> : records.data.items.map(item => <article className="data-record" key={item.id}><h4>{item.title}</h4><p>版本 {item.revision}</p><details><summary>查看内容</summary><p className="data-content">{item.content}</p>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">查看来源</a>}</details>
        <div className="data-actions"><button disabled={locked} onClick={() => { setHistoryId(item.id); setHistoryPage(1); }}>版本历史</button>{canWrite && <><button disabled={locked} onClick={() => { save.reset(); remove.reset(); setNotice(''); setEditing(item); setTitle(item.title); setContent(item.content); setSourceUrl(item.sourceUrl || ''); }}>编辑资料</button><button disabled={locked} onClick={() => { if (window.confirm('确认删除此资料？历史版本会保留。')) remove.mutate(item); }}>删除资料</button></>}</div>
      </article>)}<PageControls page={page} hasMore={records.data?.hasMore} pending={records.isFetching} onPage={setPage} />
    </>}
    {historyId && !records.isError && <section aria-label="版本历史"><h4>版本历史</h4>{history.isError ? <p role="alert">历史读取失败：{errorText(history.error)}</p> : history.data?.items?.map((item: any) => <details key={item.id}><summary>版本 {item.revision} · {new Date(item.createdAt).toLocaleString()}</summary><p>{item.snapshot.title}</p><p className="data-content">{item.snapshot.content}</p></details>)}<PageControls page={historyPage} hasMore={history.data?.hasMore} pending={history.isFetching} onPage={setHistoryPage} /></section>}
  </div>;
}
function Grants({ collection }: { collection: Collection }) {
  const cache = useQueryClient(); const base = `/agent-lab/data-collections/${collection.id}/grants`;
  const [page, setPage] = useState(1);
  const [userId, setUserId] = useState(''); const [access, setAccess] = useState('READ'); const [notice, setNotice] = useState('');
  const grants = useQuery<any>({ queryKey: ['lab-data-grants', collection.id, page], queryFn: () => readDataPage(`${base}?page=${page}`) });
  const save = useMutation({ onMutate: () => setNotice(''), mutationFn: async () => {
    const row = await api(base, { method: 'PUT', body: JSON.stringify({ userId, access }) });
    if (row?.collectionId !== collection.id || row.userId !== userId || row.access !== access) throw new Error('授权未确认，请重新读取核验。');
  }, onSuccess: () => { setUserId(''); setNotice('授权已保存。'); void cache.invalidateQueries({ queryKey: ['lab-data-grants', collection.id] }); } });
  const revoke = useMutation({ onMutate: () => setNotice(''), mutationFn: async (id: string) => {
    const row = await api(`${base}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (row?.revoked !== true || row.userId !== id) throw new Error('撤销未确认，请重新读取核验。');
  }, onSuccess: () => { setNotice('授权已撤销，后续资料读取将被拒绝。'); void cache.invalidateQueries({ queryKey: ['lab-data-grants', collection.id] }); } });
  return <section><h4>共享权限</h4><p>仅所有者可以授权、撤销和归档。只读允许读取与 Agent 绑定；编辑额外允许维护资料。权限不会跨组织授予，也不会自动传递给其他 Agent。</p>
    <form className="data-actions" onSubmit={e => { e.preventDefault(); if (!save.isPending && !revoke.isPending) save.mutate(); }}><label>账号 ID（登录用户名）<input required maxLength={100} disabled={save.isPending || revoke.isPending} value={userId} onChange={e => setUserId(e.target.value)} /></label><label>授予权限<select aria-label="授予权限" disabled={save.isPending || revoke.isPending} value={access} onChange={e => setAccess(e.target.value)}><option value="READ">只读</option><option value="WRITE">编辑</option></select></label><button disabled={save.isPending || revoke.isPending} type="submit">保存授权</button></form>
    {notice && <p role="status">{notice}</p>}{[grants.error, save.error, revoke.error].filter(Boolean).map((error, i) => <p role="alert" key={i}>{errorText(error)}</p>)}
    {!grants.isError && grants.data?.items.map((row: any) => <p key={row.id}>{row.userId} · {accessNames[row.access as 'READ' | 'WRITE']} <button disabled={save.isPending || revoke.isPending} onClick={() => revoke.mutate(row.userId)}>撤销授权</button></p>)}
    <button onClick={() => void grants.refetch()}>重新读取授权</button><PageControls page={page} hasMore={grants.data?.hasMore} pending={grants.isFetching} onPage={setPage} />
  </section>;
}
function Audit({ collection }: { collection: Collection }) {
  const [page, setPage] = useState(1);
  const events = useQuery<any>({ queryKey: ['lab-data-audit', collection.id, page], queryFn: () => readDataPage(`/agent-lab/data-collections/${collection.id}/audit?page=${page}`) });
  const actions: Record<string, string> = { COLLECTION_CREATE: '创建集合', COLLECTION_ARCHIVE: '归档集合', RECORD_CREATE: '新增资料', RECORD_UPDATE: '修改资料', RECORD_DELETE: '删除资料', GRANT_SET: '设置授权', GRANT_REVOKE: '撤销授权' };
  return <section><h4>变更记录</h4>{events.isError ? <p role="alert">变更记录读取失败：{errorText(events.error)}</p> : events.data?.items?.map((row: any) => <p key={row.id}>{new Date(row.createdAt).toLocaleString()} · {actions[row.action] || row.action} · 操作人 {row.actorId}</p>)}<button onClick={() => void events.refetch()}>重新读取变更记录</button><PageControls page={page} hasMore={events.data?.hasMore} pending={events.isFetching} onPage={setPage} /></section>;
}
