import { ServiceUnavailableException } from '@nestjs/common';
import { QuotaService } from './quota.service';

/** Existing DeepAgents tool protocol cannot use the text-only gateway adapter.
 * Meter every HTTP attempt at its transport boundary, including graph tool loops.
 * Never forward unknown request formats without an enforceable output ceiling.
 */
export function createQuotaFetch(quota: QuotaService, transport: typeof fetch = globalThis.fetch): typeof fetch {
  return async (input, init) => {
    if (typeof init?.body !== 'string') throw new ServiceUnavailableException('Unsupported model request');
    const body = JSON.parse(init.body);
    if (!Array.isArray(body.messages)) throw new ServiceUnavailableException('Unsupported model request');
    const bounded = await quota.reserveLlm({ messages: body.messages, tools: body.tools, maxTokens: body.max_completion_tokens ?? body.max_tokens });
    if ('max_completion_tokens' in body) body.max_completion_tokens = bounded.maxTokens;
    else body.max_tokens = bounded.maxTokens;
    return transport(input, { ...init, body: JSON.stringify(body) });
  };
}
