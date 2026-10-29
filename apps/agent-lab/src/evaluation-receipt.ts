export type EvaluationJobReceipt = {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  totalCases: number;
  completedSamples: number;
  completedCases: number;
  reused: boolean;
  statusUrl: string;
};

/** Only a complete queue receipt confirms admission. Unknown delivery keeps the request key. */
export function requireEvaluationReceipt(value: unknown): EvaluationJobReceipt {
  const invalid = () => new Error('提交结果未确认，请使用相同请求重试或查询评测任务；不要更换评测资产重复提交。');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const receipt = value as Record<string, unknown>;
  const count = (field: string) => typeof receipt[field] === 'number' && Number.isSafeInteger(receipt[field]) && Number(receipt[field]) >= 0;
  if (typeof receipt.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(receipt.id)
    || typeof receipt.status !== 'string' || !['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(receipt.status)
    || typeof receipt.reused !== 'boolean' || receipt.statusUrl !== `/api/agent-lab/evaluations/${receipt.id}`
    || !count('totalCases') || Number(receipt.totalCases) < 1 || !count('completedSamples') || !count('completedCases')
    || Number(receipt.completedCases) > Number(receipt.totalCases) || Number(receipt.completedSamples) > Number(receipt.totalCases) * 5) throw invalid();
  return receipt as EvaluationJobReceipt;
}

const PENDING_VERSION = 1;
const MAX_PENDING_EVALUATIONS = 64;
const PENDING_PREFIX = 'ia:evaluation-pending:v1:';
const STORAGE_ERROR = '无法安全保存评测请求，请恢复本页会话存储后重试；尚未提交新的评测。';
type PendingEntry = { signature: string; requestKey: string };
type PendingStore = { version: number; entries: PendingEntry[] };
export type EvaluationRequestLease = PendingEntry & { storageKey: string };
export type EvaluationRequestIdentity = {
  agentId: string;
  datasetId: string;
  evaluatorId: string;
  agentVersionId?: string;
  repeatCount?: number;
  maxEstimatedCostCny?: number;
};

function pendingStore(storageKey: string): PendingStore {
  const raw = sessionStorage.getItem(storageKey);
  if (raw === null) return { version: PENDING_VERSION, entries: [] };
  if (raw.length > 128_000) throw new Error(STORAGE_ERROR);
  const value = JSON.parse(raw) as PendingStore;
  if (!value || Object.keys(value).some(key => !['version', 'entries'].includes(key)) || value.version !== PENDING_VERSION || !Array.isArray(value.entries) || value.entries.length > MAX_PENDING_EVALUATIONS
    || value.entries.some(item => !item || Object.keys(item).some(key => !['signature', 'requestKey'].includes(key)) || typeof item.signature !== 'string' || item.signature.length > 2048
      || typeof item.requestKey !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(item.requestKey))
    || new Set(value.entries.map(item => item.signature)).size !== value.entries.length) throw new Error(STORAGE_ERROR);
  return value;
}

/** Store only stable resource IDs and budget options, never candidate input or credentials. */
function requestSignature(input: EvaluationRequestIdentity): string {
  const id = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
  if (!id(input.agentId) || !id(input.datasetId) || !id(input.evaluatorId)
    || (input.agentVersionId !== undefined && !id(input.agentVersionId))
    || (input.repeatCount !== undefined && (!Number.isInteger(input.repeatCount) || input.repeatCount < 1 || input.repeatCount > 5))
    || (input.maxEstimatedCostCny !== undefined && (!Number.isFinite(input.maxEstimatedCostCny) || input.maxEstimatedCostCny < 0.01 || input.maxEstimatedCostCny > 100))) {
    throw new Error('评测资源或预算无效，尚未提交评测。');
  }
  return JSON.stringify({ agentId: input.agentId, datasetId: input.datasetId, evaluatorId: input.evaluatorId,
    agentVersionId: input.agentVersionId, repeatCount: input.repeatCount ?? 1, maxEstimatedCostCny: input.maxEstimatedCostCny });
}

/** Same-tab reload/remount retries reuse an unconfirmed key. Storage failure stops before POST. */
export function acquireEvaluationRequest(input: EvaluationRequestIdentity): EvaluationRequestLease {
  const signature = requestSignature(input);
  try {
    // Client namespace only; server authentication and ownership remain authoritative.
    const userId = localStorage.getItem('ia_userId');
    if (!userId || userId.length > 200) throw new Error('评测需要当前登录身份，请重新登录后重试。');
    const storageKey = `${PENDING_PREFIX}${encodeURIComponent(userId)}`;
    const store = pendingStore(storageKey);
    const existing = store.entries.find(item => item.signature === signature);
    if (existing) return { storageKey, ...existing };
    if (store.entries.length >= MAX_PENDING_EVALUATIONS) throw new Error('本页未确认的评测请求已达上限，请先查询或重试已有评测。');
    const requestKey = crypto.randomUUID();
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(requestKey) || store.entries.some(item => item.requestKey === requestKey)) throw new Error(STORAGE_ERROR);
    store.entries.push({ signature, requestKey });
    const encoded = JSON.stringify(store);
    sessionStorage.setItem(storageKey, encoded);
    if (sessionStorage.getItem(storageKey) !== encoded) throw new Error(STORAGE_ERROR);
    return { storageKey, signature, requestKey };
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith('评测需要') || error.message.startsWith('本页未确认'))) throw error;
    throw new Error(STORAGE_ERROR);
  }
}

/** Clear only the exact admitted request; late replies cannot erase a newer submission. */
export function confirmEvaluationRequest(lease: EvaluationRequestLease): boolean {
  try {
    const store = pendingStore(lease.storageKey);
    const retained = store.entries.filter(item => item.signature !== lease.signature || item.requestKey !== lease.requestKey);
    if (retained.length === store.entries.length) return true;
    const encoded = JSON.stringify({ version: PENDING_VERSION, entries: retained });
    sessionStorage.setItem(lease.storageKey, encoded);
    return sessionStorage.getItem(lease.storageKey) === encoded;
  } catch {
    // Admission is already confirmed: cleanup failure must not turn a real receipt into an unknown delivery.
    // If the old entry remains, a later click safely reuses the accepted server job.
    return false;
  }
}
