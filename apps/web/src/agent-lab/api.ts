export type JsonObject = Record<string, unknown>;

export async function agentLabRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/agent-lab${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const message =
      typeof body === 'object' && body && 'message' in body
        ? String((body as JsonObject).message)
        : `请求失败 (HTTP ${response.status})`;
    throw new Error(message);
  }
  return body as T;
}

export function formatDate(value?: string | Date | null): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN', { hour12: false });
}

export function formatDuration(value?: number | null): string {
  if (value === undefined || value === null) return '-';
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

export function outputPreview(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'response' in value) {
    return String((value as JsonObject).response ?? '');
  }
  if (!value) return '-';
  return JSON.stringify(value);
}

export async function downloadAgentLabTrace(runId: string): Promise<void> {
  const response = await fetch(`/api/agent-lab/runs/${runId}/trace.jsonl`);
  if (!response.ok) {
    throw new Error(`导出 Trace 失败 (HTTP ${response.status})`);
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = `trace-${runId}.jsonl`;
  link.click();
  URL.revokeObjectURL(url);
}
