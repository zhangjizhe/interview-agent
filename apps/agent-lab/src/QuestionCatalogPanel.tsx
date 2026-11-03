import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

type CatalogStatus = { contractVersion: 'question-catalog/v1'; mode: 'LEGACY'; canonicalStore: 'milvus-legacy'; adoptionRequired: true }
  | { contractVersion: 'question-catalog/v1'; mode: 'CATALOG'; canonicalStore: 'postgresql'; count: number; pendingIndexCount: number; legacySourceRetained: true };
const count = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) >= 0;
function statusReceipt(value: any): CatalogStatus {
  if (value?.contractVersion === 'question-catalog/v1' && (
    (value.mode === 'LEGACY' && value.canonicalStore === 'milvus-legacy' && value.adoptionRequired === true)
    || (value.mode === 'CATALOG' && value.canonicalStore === 'postgresql' && count(value.count)
      && count(value.pendingIndexCount) && value.pendingIndexCount <= value.count && value.legacySourceRetained === true))) return value;
  throw new Error('题库状态回执不完整，请重新读取。');
}

/** Governance UI remains an Interview API client; it never owns the question data. */
export function QuestionCatalogPanel() {
  const client = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [message, setMessage] = useState('');
  const state = useQuery({ queryKey: ['question-catalog-status'], queryFn: async () => statusReceipt(await api('/interview/question-bank/catalog/status', { signal: AbortSignal.timeout(10000) })), retry: false });
  const action = useMutation({
    retry: false,
    mutationFn: async (kind: 'adopt-legacy' | 'rebuild-index') => {
      const result = await api(`/interview/question-bank/catalog/${kind}`, { method: 'POST', signal: AbortSignal.timeout(190000), body: JSON.stringify(kind === 'adopt-legacy' ? { maintenanceConfirmed: true } : {}) });
      const common = result?.contractVersion === 'question-catalog/v1';
      const valid = kind === 'adopt-legacy'
        ? common && result.mode === 'CATALOG' && result.providerCalls === 0 && (result.reused === true
          || (count(result.adoptedCount) && typeof result.sourceHash === 'string' && /^[a-f0-9]{64}$/.test(result.sourceHash) && result.legacySourceRetained === true))
        : common && count(result.requestedCount) && result.requestedCount <= 20 && result.canonicalStatus === 'SAVED' && ['READY', 'PENDING'].includes(result.indexStatus);
      if (!valid) throw new Error('操作回执不完整');
      return { kind, result };
    },
    onMutate: () => setMessage(''),
    onSuccess: ({ kind, result }) => {
      setConfirmed(false);
      setMessage(kind === 'adopt-legacy' ? '迁移已确认，旧向量源保留。请核对最新主数据与待索引数量。'
        : result.indexStatus === 'READY' ? `本批 ${result.requestedCount} 项索引处理已确认。` : '主数据已保存，本批索引尚未就绪，请核对后再处理。');
      void client.invalidateQueries({ queryKey: ['question-catalog-status'] });
      void client.invalidateQueries({ queryKey: ['agent-lab-question-bank'] });
    },
    onError: () => { setUnknown(true); setMessage('操作未确认，可能已部分执行。先重新读取状态，勿直接重复提交。'); },
  });
  const reread = async () => {
    const result = await state.refetch();
    if (result.isSuccess) { setUnknown(false); action.reset(); setMessage('已重新读取状态；请核对数量后决定下一步。'); }
  };
  const blocked = action.isPending || state.isFetching || unknown || state.isError || !state.data;
  return <section className="lab-command-form" aria-label="题库主数据与检索索引">
    <h2>题库主数据与检索索引</h2>
    <p>题库归 Interview 业务管理；Agent Lab 提供治理入口。评测集独立冻结，不自动等同生产题库。</p>
    {state.isLoading && <p role="status">正在读取题库存储状态…</p>}
    {state.isError && <p role="alert">题库存储状态读取失败，未显示为空题库。</p>}
    {state.data?.mode === 'LEGACY' && <>
      <p>当前主存储：旧 Milvus 题库。迁移不调用模型，保留源数据；完成后由 PostgreSQL 保存主记录与版本。</p>
      <label><input type="checkbox" checked={confirmed} disabled={action.isPending} onChange={event => setConfirmed(event.target.checked)} />已备份，并停止旧版 API 与离线导入程序的题库写入</label>
      <button className="agent-command" disabled={blocked || !confirmed} onClick={() => action.mutate('adopt-legacy')}>迁移当前组织题库</button>
    </>}
    {state.data?.mode === 'CATALOG' && <>
      <p>主数据：PostgreSQL · {state.data.count} 题 · 待索引 {state.data.pendingIndexCount} 题。旧向量源保留，历史版本不随删除清除。</p>
      <p>每次最多处理 20 个待索引题目，会调用向量模型并消耗额度；不自动重试。待索引期间仍可读取列表与选题。</p>
      <button className="agent-command" disabled={blocked || state.data.pendingIndexCount === 0} onClick={() => action.mutate('rebuild-index')}>处理待索引题目（最多20题）</button>
    </>}
    <button className="agent-command quiet-command" disabled={action.isPending || state.isFetching} onClick={() => { void reread(); }}>重新读取存储状态</button>
    {action.isPending && <p role="status">正在处理，请等待回执…</p>}
    {message && <p role={unknown ? 'alert' : 'status'}>{message}</p>}
  </section>;
}
