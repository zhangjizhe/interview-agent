export type RuntimeRun = {
  id: string; agentId: string; agentVersionId: string; status: string;
  agent?: { name?: string; key?: string }; agentVersion?: { version?: string };
  application?: string; parentRunId?: string; createdAt?: string; startedAt?: string; completedAt?: string;
  latencyMs?: number | null; estimatedCost?: number | null;
  tokenUsage?: { calls?: number; promptTokens?: number; completionTokens?: number; totalTokens?: number };
  input?: unknown; output?: unknown; error?: string | null;
};
export type RuntimeEvent = {
  id: string; runId?: string; seq: number; type: string; name?: string; step?: string;
  callId?: string; turnId?: string; createdAt?: string; latencyMs?: number | null;
  estimatedCost?: number | null; tokenUsage?: unknown; metadata?: unknown;
  input?: unknown; output?: unknown; payload?: unknown; error?: string | null;
};

export const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export const costLabel = (value: unknown) => numeric(value) ? `¥${value.toFixed(6)}` : '未知，不能按零计算';
export const durationLabel = (value: unknown) => numeric(value) ? `${value.toLocaleString()} ms` : '未记录';
export const dateLabel = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : '未记录';
export const isFailure = (event: RuntimeEvent) => Boolean(event.error) || /failed|error|denied|cancelled|timeout/i.test(event.type)
  || Boolean(event.payload && typeof event.payload === 'object' && 'status' in event.payload
    && ['FAILED', 'ERROR', 'DENIED', 'CANCELLED', 'TIMEOUT'].includes(String(event.payload.status)));
export function eventGroup(event: RuntimeEvent) {
  if (event.type.startsWith('model.')) return 'model';
  if (/tool|approval/.test(event.type)) return 'tool';
  if (/workflow|subagent/.test(event.type)) return 'workflow';
  if (/retriev|knowledge|data\./.test(event.type)) return 'retrieval';
  return 'runtime';
}

// Bounded diagnostic presentation; suppress common credential and system-message fields.
const privateKey = /^system$|prompt|reasoning|thought|password|secret|authorization|api.?key|access.?token|refresh.?token|cookie|headers|messages|email|phone/i;
export function diagnosticText(value: string) {
  return (value.length > 6000 ? `${value.slice(0, 6000)}\n[内容已截断]` : value)
    .replace(/https?:\/\/[^\s<>"']+/gi, raw => {
      try { const url = new URL(raw); url.username = ''; url.password = ''; url.search = ''; url.hash = ''; return url.toString(); } catch { return '[URL 已隐藏]'; }
    })
    .replace(/Bearer\s+[\w.\-]+/gi, 'Bearer [已隐藏]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[密钥已隐藏]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[令牌已隐藏]')
    .replace(/((?:api[_ -]?key|password|secret|token)\s*[=:]\s*)[^\s,;]+/gi, '$1[已隐藏]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[邮箱已隐藏]');
}
export function diagnosticJson(value: unknown) {
  let remaining = 160;
  function visit(item: unknown, depth: number): unknown {
    if (--remaining < 0 || depth > 5) return '[已截断]';
    if (typeof item === 'string') return diagnosticText(item);
    if (Array.isArray(item)) return item.slice(0, 20).map(child => visit(child, depth + 1));
    if (item && typeof item === 'object' && 'role' in item && item.role === 'system') return '[系统消息已隐藏]';
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).slice(0, 30)
      .map(([key, child]) => [diagnosticText(key), privateKey.test(key) && !(numeric(child) && /^prompt_?tokens$/i.test(key)) ? '[已隐藏]' : visit(child, depth + 1)]));
    return item ?? null;
  }
  return value == null ? '未记录' : JSON.stringify(visit(value, 0), null, 2);
}

export function checkedEvents(value: unknown, runId: string): RuntimeEvent[] {
  if (!Array.isArray(value) || value.some(event => !event || typeof event.id !== 'string'
    || !Number.isInteger(event.seq) || event.seq < 1 || typeof event.type !== 'string'
    || (event.runId != null && event.runId !== runId))) throw new Error('Trace 数据格式或运行归属不匹配，未展示事件。');
  if (new Set(value.map(event => event.seq)).size !== value.length || new Set(value.map(event => event.id)).size !== value.length) {
    throw new Error('Trace 事件标识或序号重复，未展示有歧义的记录。');
  }
  return [...value].sort((a, b) => a.seq - b.seq);
}
