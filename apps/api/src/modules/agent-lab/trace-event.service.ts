import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

export const TRACE_FORMAT_VERSION = 1;

export const MODEL_VISIBLE_EVENT_TYPES = new Set([
  'user.message',
  'assistant.message',
  'tool.result',
]);

export type TraceEventInput = {
  type: string;
  name?: string;
  turnId?: string;
  step?: string;
  callId?: string;
  modelVisible?: boolean;
  payload?: unknown;
  input?: unknown;
  output?: unknown;
  metadata?: unknown;
  latencyMs?: number;
  tokenUsage?: unknown;
  estimatedCost?: number;
  error?: string;
};

export type TraceEventProjection = {
  seq: number;
  type: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  callId?: string;
};

@Injectable()
export class TraceEventService {
  constructor(private readonly prisma: PrismaService) {}

  async append(runId: string, event: TraceEventInput) {
    const modelVisible = this.resolveModelVisible(event.type, event.modelVisible);
    return this.prisma.$transaction(async (tx) => {
      const run = await tx.run.update({
        where: { id: runId },
        data: { traceSequence: { increment: 1 } },
        select: { traceSequence: true },
      });
      return tx.traceEvent.create({
        data: {
          formatVersion: TRACE_FORMAT_VERSION,
          runId,
          seq: run.traceSequence,
          turnId: event.turnId,
          step: event.step,
          callId: event.callId,
          type: event.type,
          name: event.name || event.type,
          modelVisible,
          payload: this.jsonSafe(event.payload),
          input: this.jsonSafe(event.input),
          output: this.jsonSafe(event.output),
          metadata: this.jsonSafe(event.metadata),
          latencyMs: event.latencyMs,
          tokenUsage: this.jsonSafe(event.tokenUsage),
          estimatedCost: event.estimatedCost,
          error: event.error,
        },
      });
    });
  }

  async list(runId: string) {
    return this.prisma.traceEvent.findMany({
      where: { runId },
      orderBy: { seq: 'asc' },
    });
  }

  async exportJsonl(runId: string) {
    const events = await this.list(runId);
    return events.map((event) => JSON.stringify(event)).join('\n');
  }

  projectModelHistory(events: Array<Record<string, any>>): TraceEventProjection[] {
    return [...events]
      .sort((left, right) => left.seq - right.seq)
      .filter((event) => event.modelVisible)
      .flatMap<TraceEventProjection>((event) => {
        const payload = this.toRecord(event.payload);
        if (event.type === 'user.message') {
          return [{
            seq: event.seq,
            type: event.type,
            role: 'user' as const,
            content: this.contentFromPayload(payload),
            callId: event.callId || undefined,
          }];
        }
        if (event.type === 'assistant.message') {
          return [{
            seq: event.seq,
            type: event.type,
            role: 'assistant' as const,
            content: this.contentFromPayload(payload),
            callId: event.callId || undefined,
          }];
        }
        if (event.type === 'tool.result') {
          return [{
            seq: event.seq,
            type: event.type,
            role: 'tool' as const,
            content: this.contentFromPayload(payload),
            callId: event.callId || undefined,
          }];
        }
        return [];
      });
  }

  assertToolCallTerminalPairs(events: Array<Record<string, any>>) {
    const calls = new Map<string, number>();
    const results = new Map<string, number>();
    for (const event of events) {
      if (!event.callId) continue;
      if (event.type === 'tool.call') {
        calls.set(event.callId, (calls.get(event.callId) || 0) + 1);
      }
      if (event.type === 'tool.result') {
        results.set(event.callId, (results.get(event.callId) || 0) + 1);
      }
    }
    for (const [callId, count] of calls) {
      if (count !== 1 || results.get(callId) !== 1) {
        throw new BadRequestException(`工具调用 ${callId} 未拥有唯一终态结果`);
      }
    }
    for (const [callId, count] of results) {
      if (count !== 1 || calls.get(callId) !== 1) {
        throw new BadRequestException(`工具结果 ${callId} 未拥有唯一调用事件`);
      }
    }
    return true;
  }

  private resolveModelVisible(type: string, requested?: boolean) {
    if (MODEL_VISIBLE_EVENT_TYPES.has(type) && requested === false) {
      throw new BadRequestException(`${type} 是标准模型可见事件，不能标记为不可见`);
    }
    return MODEL_VISIBLE_EVENT_TYPES.has(type) || requested === true;
  }

  private jsonSafe(value: unknown) {
    if (value === undefined) return undefined;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      throw new BadRequestException('TraceEvent payload 必须是 JSON-safe 数据');
    }
  }

  private toRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  }

  private contentFromPayload(payload: Record<string, unknown>) {
    if (typeof payload.content === 'string') return payload.content;
    if (payload.result !== undefined) return JSON.stringify(payload.result);
    return JSON.stringify(payload);
  }
}
