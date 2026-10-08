import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry } from 'prom-client';
import type { Response as ExpressResponse } from 'express';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  private readonly calls = new Counter({ name: 'llm_requests_total', help: 'Physical text model requests, including health probes', labelNames: ['provider', 'mode', 'outcome'], registers: [this.registry] });
  private readonly duration = new Histogram({ name: 'llm_request_duration_seconds', help: 'Time until model response body closes', labelNames: ['provider', 'mode'], buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120], registers: [this.registry] });
  private readonly tokens = new Counter({ name: 'llm_tokens_total', help: 'Provider-reported tokens only', labelNames: ['provider', 'direction'], registers: [this.registry] });
  private readonly missing = new Counter({ name: 'llm_usage_missing_total', help: 'Completed model responses without usage', labelNames: ['provider'], registers: [this.registry] });
  private readonly rejections = new Counter({ name: 'security_rejections_total', help: 'Security gate rejections', labelNames: ['kind'], registers: [this.registry] });
  private readonly sse = new Gauge({ name: 'sse_active_connections', help: 'Open candidate SSE responses', registers: [this.registry] });

  reject(kind: 'quota' | 'ssrf' | 'rate_limit') { this.rejections.inc({ kind }); }
  openSse(response: Pick<ExpressResponse, 'once'>) {
    this.sse.inc();
    let closed = false;
    const close = () => { if (!closed) { closed = true; this.sse.dec(); } };
    response.once('close', close); response.once('finish', close);
  }

  /** 旁路观测响应字节；不修改模型协议，不缓存正文到日志。标签只能由服务端固定值提供。 */
  modelFetch(provider: 'qwen' | 'deepseek' | 'deepagents', transport: typeof fetch = globalThis.fetch): typeof fetch {
    return async (input, init) => {
      let streaming = false;
      try { streaming = typeof init?.body === 'string' && JSON.parse(init.body).stream === true; } catch { /* SDK owns validation. */ }
      const mode = streaming ? 'stream' : 'chat';
      const stop = this.duration.startTimer({ provider, mode });
      let finished = false, usage: any, buffer = '';
      const decoder = new TextDecoder();
      const parse = (text: string) => {
        try { const value = JSON.parse(text); if (value.usage) usage = value.usage; } catch { /* Partial or non-JSON provider payload. */ }
      };
      const finish = (outcome: 'success' | 'error' | 'cancelled') => {
        if (finished) return;
        finished = true; stop(); this.calls.inc({ provider, mode, outcome });
        if (usage) {
          for (const [direction, value] of [['input', usage.prompt_tokens], ['output', usage.completion_tokens]] as const) {
            if (Number.isFinite(value) && value >= 0) this.tokens.inc({ provider, direction }, value);
          }
        } else if (outcome === 'success') this.missing.inc({ provider });
        buffer = '';
      };
      try {
        const response = await transport(input, init);
        if (!response.body) { finish(response.ok ? 'success' : 'error'); return response; }
        const reader = response.body.getReader();
        const body = new ReadableStream<Uint8Array>({
          async pull(controller) {
            try {
              const { done, value } = await reader.read();
              if (done) {
                buffer += decoder.decode();
                if (!streaming) parse(buffer);
                else if (buffer.startsWith('data:')) parse(buffer.slice(5).trim());
                finish(response.ok ? 'success' : 'error'); controller.close(); return;
              }
              buffer += decoder.decode(value, { stream: true });
              if (streaming) {
                let newline: number;
                while ((newline = buffer.indexOf('\n')) >= 0) {
                  const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
                  if (line === 'data: [DONE]') finish(response.ok ? 'success' : 'error');
                  else if (line.startsWith('data:')) parse(line.slice(5).trim());
                }
              }
              // 不让观测路径额外无界保存响应。超大/未知协议记 usage missing，不估算为真实用量。
              if (buffer.length > 1048576) buffer = '';
              controller.enqueue(value);
            } catch (error) { finish('error'); controller.error(error); }
          },
          async cancel(reason) { finish('cancelled'); await reader.cancel(reason); },
        });
        return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
      } catch (error) { finish('error'); throw error; }
    };
  }
}
