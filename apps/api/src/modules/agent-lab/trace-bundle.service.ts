import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { TraceEventProjection } from './trace-event.service';

export type TraceBundle = {
  formatVersion: 1;
  manifest: {
    runId: string;
    exportedAt: string;
    run: Record<string, unknown>;
    payloadReferences: Array<{ ref: string; eventSeq: number; field: string; bytes: number }>;
  };
  events: Array<Record<string, any>>;
  payloads: Record<string, unknown>;
};

export type TraceDebugView = {
  modelHistory: TraceEventProjection[];
  toolCalls: Array<{ callId: string; call?: Record<string, any>; result?: Record<string, any> }>;
  evaluations: Array<Record<string, any>>;
  terminals: Array<Record<string, any>>;
  errors: Array<Record<string, any>>;
  edges: Array<{ from: string; to: string; type: string }>;
};

@Injectable()
export class TraceBundleService {
  buildBundle(run: Record<string, any>, events: Array<Record<string, any>>): TraceBundle {
    const payloads: Record<string, unknown> = {};
    const payloadReferences: TraceBundle['manifest']['payloadReferences'] = [];
    const bundleEvents = events.map((source) => {
      const event = { ...source };
      for (const field of ['payload', 'input', 'output', 'metadata']) {
        if (event[field] === undefined || event[field] === null) continue;
        const serialized = JSON.stringify(event[field]);
        if (Buffer.byteLength(serialized, 'utf8') <= 16 * 1024) continue;
        const ref = `sha256:${createHash('sha256').update(serialized).digest('hex')}`;
        payloads[ref] = event[field];
        event[field] = { $ref: ref };
        payloadReferences.push({
          ref,
          eventSeq: event.seq,
          field,
          bytes: Buffer.byteLength(serialized, 'utf8'),
        });
      }
      return event;
    });
    return {
      formatVersion: 1,
      manifest: {
        runId: String(run.id),
        exportedAt: new Date().toISOString(),
        run: {
          id: run.id,
          status: run.status,
          application: run.application,
          agentId: run.agentId,
          agentVersionId: run.agentVersionId,
          parentRunId: run.parentRunId,
          budget: run.budget,
          createdAt: run.createdAt,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
        },
        payloadReferences,
      },
      events: bundleEvents,
      payloads,
    };
  }

  reduce(bundle: TraceBundle): TraceDebugView {
    const events = bundle.events
      .map((event) => this.hydrateEvent(event, bundle.payloads))
      .sort((left, right) => left.seq - right.seq);
    const modelHistory = events
      .filter((event) => event.modelVisible)
      .flatMap<TraceEventProjection>((event) => {
        const payload = this.toRecord(event.payload);
        if (event.type === 'user.message') {
          return [{ seq: event.seq, type: event.type, role: 'user' as const, content: this.content(payload), callId: event.callId }];
        }
        if (event.type === 'assistant.message') {
          return [{ seq: event.seq, type: event.type, role: 'assistant' as const, content: this.content(payload), callId: event.callId }];
        }
        if (event.type === 'tool.result') {
          return [{ seq: event.seq, type: event.type, role: 'tool' as const, content: this.content(payload), callId: event.callId }];
        }
        return [];
      });
    const toolCallMap = new Map<string, TraceDebugView['toolCalls'][number]>();
    const edges: TraceDebugView['edges'] = [];
    for (const event of events) {
      if (!event.callId) continue;
      const entry: TraceDebugView['toolCalls'][number] =
        toolCallMap.get(event.callId) || { callId: event.callId };
      if (event.type === 'tool.call') entry.call = event;
      if (event.type === 'tool.result') {
        entry.result = event;
        edges.push({ from: `tool.call:${event.callId}`, to: `tool.result:${event.callId}`, type: 'terminal-result' });
      }
      toolCallMap.set(event.callId, entry);
    }
    return {
      modelHistory,
      toolCalls: [...toolCallMap.values()],
      evaluations: events.filter((event) => event.type.startsWith('evaluation.')),
      terminals: events.filter((event) => ['turn.end', 'run.failed', 'run.cancelled'].includes(event.type)),
      errors: events.filter((event) => Boolean(event.error) || event.type === 'run.failed'),
      edges,
    };
  }

  private hydrateEvent(event: Record<string, any>, payloads: Record<string, unknown>) {
    const hydrated = { ...event };
    for (const field of ['payload', 'input', 'output', 'metadata']) {
      const reference = this.toRecord(hydrated[field]).$ref;
      if (typeof reference === 'string' && reference in payloads) hydrated[field] = payloads[reference];
    }
    return hydrated;
  }

  private toRecord(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, any>
      : {};
  }

  private content(payload: Record<string, any>) {
    if (typeof payload.content === 'string') return payload.content;
    if (payload.result !== undefined) return JSON.stringify(payload.result);
    return JSON.stringify(payload);
  }
}
