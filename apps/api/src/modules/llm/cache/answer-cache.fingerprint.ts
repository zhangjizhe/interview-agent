import { createHash } from 'node:crypto';
import type { ChatParams } from '../providers/types';

export interface AnswerCacheLimits {
  planId: string;
  maxInputBytes: number;
  maxOutputTokens: number;
  monthlyLlmCalls: number;
}

// Plain JSON only: unsupported values must bypass caching instead of silently
// disappearing from the request identity (JSON.stringify normally drops them).
function canonical(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${Array.from(value, canonical).join(',')}]`;
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  throw new Error('Unsupported cache context');
}

export function answerCacheFingerprint(
  params: ChatParams & { interviewId?: string; userId?: string; semanticCacheType?: string },
  identity: { organizationId: string; userId?: string },
  provider: { name: string; defaultModel: string },
  limits: AnswerCacheLimits,
  mode: 'chat' | 'stream',
): string | undefined {
  try {
    if (!identity.userId || !provider.name || !provider.defaultModel || !params.messages.length) return;
    // A cached text response cannot replay tool calls or their side effects.
    if (params.tools?.length || params.messages.some(m => m.role === 'tool' || 'tool_calls' in m || 'toolCalls' in m)) return;
    if (!params.messages.every(m => typeof m.content === 'string')) return;
    if (!limits.planId || !Number.isInteger(limits.maxInputBytes) || limits.maxInputBytes < 1 ||
        !Number.isInteger(limits.maxOutputTokens) || limits.maxOutputTokens < 1 || limits.monthlyLlmCalls < 1) return;
    if (Buffer.byteLength(JSON.stringify({ messages: params.messages, tools: params.tools }), 'utf8') > limits.maxInputBytes) return;
    if (params.maxTokens !== undefined && (!Number.isInteger(params.maxTokens) || params.maxTokens < 1)) return;
    // Keep all model input fields, including future fields, except tracing and
    // caller-supplied identities. Undefined optional fields equal omission.
    const { traceId: _trace, userId: _caller, interviewId, semanticCacheType: _type, stream: _stream, ...input } = params;
    const request = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    request.temperature = params.temperature ?? 0.7;
    request.maxTokens = Math.min(params.maxTokens ?? limits.maxOutputTokens, limits.maxOutputTokens);
    const context = canonical({
      contract: 'answer-cache/v2', identity, interviewId: interviewId ?? 'unknown',
      provider: { name: provider.name, model: provider.defaultModel }, limits, mode, request,
    });
    return createHash('sha256').update(context).digest('hex');
  } catch {
    return;
  }
}
