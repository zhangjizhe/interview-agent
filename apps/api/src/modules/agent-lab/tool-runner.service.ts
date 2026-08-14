import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { TraceEventService } from './trace-event.service';
import { ApprovalResolution, ToolApprovalService } from './tool-approval.service';

export type ToolDecision = 'ALLOW' | 'ASK' | 'DENY';
export type ToolResultStatus = 'OK' | 'DENIED' | 'CANCELLED' | 'TIMED_OUT' | 'ERROR';

export type ToolCall = Readonly<{
  runId: string;
  workspaceId: string;
  toolName: string;
  args: Record<string, unknown>;
  callId?: string;
  timeoutMs?: number;
}>;

export type ToolExecutionContext = {
  signal: AbortSignal;
  callId: string;
  workspaceId: string;
};

export type ToolDefinition = {
  name: string;
  requiresApproval?: boolean;
  execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<unknown>;
};

export interface ToolHook {
  beforeCall(call: ToolCall): Promise<{ decision: ToolDecision; reason?: string }> | { decision: ToolDecision; reason?: string };
}

export interface ToolGuard {
  check(call: ToolCall): Promise<void> | void;
}

export interface ToolApprovalHandler {
  decide(call: ToolCall): Promise<'APPROVED' | 'DENIED' | 'CANCELLED'>;
}

export type ToolRunOptions = {
  hooks?: ToolHook[];
  guards?: ToolGuard[];
  approvalHandler?: ToolApprovalHandler;
  approvalTimeoutMs?: number;
};

export type ToolRunResult = {
  callId: string;
  status: ToolResultStatus;
  output?: unknown;
  error?: { type: string; message: string };
};

export class ToolPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolPolicyError';
  }
}

@Injectable()
export class ToolRunner {
  constructor(
    private readonly trace: TraceEventService,
    private readonly approvals: ToolApprovalService,
  ) {}

  async run(
    call: ToolCall,
    tool: ToolDefinition,
    options: ToolRunOptions = {},
  ): Promise<ToolRunResult> {
    const callId = call.callId || randomUUID();
    const immutableCall: ToolCall = Object.freeze({ ...call, callId, args: Object.freeze({ ...call.args }) });
    await this.trace.append(call.runId, {
      type: 'tool.call',
      name: tool.name,
      callId,
      step: 'tool-runner',
      payload: { toolName: tool.name, args: immutableCall.args },
    });

    let result: ToolRunResult;
    try {
      if (tool.name !== immutableCall.toolName) {
        throw new ToolPolicyError('工具定义与调用名称不一致');
      }
      for (const guard of options.guards || []) {
        await guard.check(immutableCall);
      }

      const hookDecision = await this.resolveHookDecision(immutableCall, options.hooks || []);
      if (hookDecision.decision === 'DENY') {
        result = this.denied(callId, hookDecision.reason || 'Hook 拒绝执行');
      } else if (tool.requiresApproval || hookDecision.decision === 'ASK') {
        const approval = await this.requestApproval(
          immutableCall,
          tool.name,
          options.approvalHandler,
          options.approvalTimeoutMs,
        );
        if (approval.status !== 'APPROVED') {
          result = {
            callId,
            status: this.approvalStatusToToolStatus(approval.status),
            error: { type: approval.status, message: approval.reason },
          };
        } else {
          result = await this.executeTool(immutableCall, tool, callId);
        }
      } else {
        result = await this.executeTool(immutableCall, tool, callId);
      }
    } catch (error: any) {
      result = this.normalizeError(callId, error);
    }

    await this.trace.append(call.runId, {
      type: 'tool.result',
      name: tool.name,
      callId,
      step: 'tool-runner',
      payload: {
        status: result.status,
        output: result.output,
        error: result.error,
      },
      error: result.error?.message,
    });
    return result;
  }

  private async resolveHookDecision(call: ToolCall, hooks: ToolHook[]) {
    let decision: ToolDecision = 'ALLOW';
    let reason: string | undefined;
    for (const hook of hooks) {
      const recommendation = await hook.beforeCall(call);
      if (recommendation.decision === 'DENY') return recommendation;
      if (recommendation.decision === 'ASK') {
        decision = 'ASK';
        reason = recommendation.reason;
      }
    }
    return { decision, reason };
  }

  private async requestApproval(
    call: ToolCall,
    toolName: string,
    handler: ToolApprovalHandler | undefined,
    timeoutMs = 30_000,
  ): Promise<{ status: ApprovalResolution; reason: string }> {
    await this.approvals.request(call.runId, call.callId!, toolName, {
      workspaceId: call.workspaceId,
      args: call.args,
    });
    await this.trace.append(call.runId, {
      type: 'approval.requested',
      name: 'Tool Approval Requested',
      callId: call.callId,
      step: 'tool-runner',
      payload: { toolName, timeoutMs },
    });

    let status: ApprovalResolution = 'DENIED';
    let reason = '缺少审批处理器，默认拒绝';
    if (handler) {
      try {
        const decision = await this.withTimeout(handler.decide(call), timeoutMs);
        status = decision;
        reason = decision === 'APPROVED' ? '审批通过' : '审批未通过';
      } catch (error: any) {
        status = error?.name === 'ToolTimeoutError' ? 'TIMED_OUT' : 'ERROR';
        reason = error?.message || '审批处理异常';
      }
    }

    await this.approvals.resolve(call.runId, call.callId!, status, { reason });
    await this.trace.append(call.runId, {
      type: 'approval.resolved',
      name: 'Tool Approval Resolved',
      callId: call.callId,
      step: 'tool-runner',
      payload: { status, reason },
    });
    return { status, reason };
  }

  private async executeTool(call: ToolCall, tool: ToolDefinition, callId: string) {
    const controller = new AbortController();
    try {
      const output = await this.withTimeout(
        tool.execute(call.args, {
          signal: controller.signal,
          callId,
          workspaceId: call.workspaceId,
        }),
        call.timeoutMs || 30_000,
        () => controller.abort(),
      );
      return { callId, status: 'OK' as const, output };
    } catch (error: any) {
      return this.normalizeError(callId, error);
    }
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    onTimeout?: () => void,
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => {
            onTimeout?.();
            const error = new Error(`操作超过 ${timeoutMs}ms`);
            error.name = 'ToolTimeoutError';
            reject(error);
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private denied(callId: string, message: string): ToolRunResult {
    return { callId, status: 'DENIED', error: { type: 'DENIED', message } };
  }

  private normalizeError(callId: string, error: any): ToolRunResult {
    if (error instanceof ToolPolicyError) {
      return this.denied(callId, error.message);
    }
    if (error?.name === 'ToolTimeoutError') {
      return {
        callId,
        status: 'TIMED_OUT',
        error: { type: 'TIMEOUT', message: error.message },
      };
    }
    if (error?.name === 'AbortError') {
      return {
        callId,
        status: 'CANCELLED',
        error: { type: 'CANCELLED', message: error.message || '操作取消' },
      };
    }
    return {
      callId,
      status: 'ERROR',
      error: { type: 'EXECUTION_ERROR', message: error?.message || '工具执行失败' },
    };
  }

  private approvalStatusToToolStatus(status: ApprovalResolution): ToolResultStatus {
    if (status === 'CANCELLED') return 'CANCELLED';
    if (status === 'TIMED_OUT') return 'TIMED_OUT';
    if (status === 'ERROR') return 'ERROR';
    return 'DENIED';
  }
}
