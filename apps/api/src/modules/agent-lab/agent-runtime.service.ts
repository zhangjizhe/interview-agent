import { assertSchema } from './configured-runtime.contract';
import type { ConfiguredRuntimeService } from './configured-runtime.service';
import { RuntimeCancelledError } from './configured-runtime.contract';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  Inject,
} from '@nestjs/common';
import { MultiAgentService } from '../agent/multi-agent.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RunAgentDto } from './dto/agent.dto';
import { TraceEventService } from './trace-event.service';
import { TraceBundleService } from './trace-bundle.service';

@Injectable()
export class AgentRuntimeService {
  private readonly logger = new Logger(AgentRuntimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly multiAgent: MultiAgentService,
    private readonly trace: TraceEventService,
    private readonly traceBundles: TraceBundleService,
    @Optional() @Inject('CONFIGURED_RUNTIME') private readonly configured?: ConfiguredRuntimeService,
  ) {}

  async prepareConfiguredRun(userId: string, agentId: string, dto: RunAgentDto, allowDraft: boolean) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    const agent = await this.prisma.agent.findFirst({ where: { id: agentId, workspaceId: workspace.id }, include: { currentVersion: true } });
    if (!agent) throw new NotFoundException('Agent不存在或无权访问');
    const version = await this.resolveVersion(agent, dto.agentVersionId, allowDraft);
    if (!this.configured) throw new ConflictException('配置运行时不可用');
    await this.configured.prepare(version, workspace.id, allowDraft);
    assertSchema(version.inputSchema ?? { type: 'object' }, dto.input);
    if (typeof dto.input.message !== 'string' || !dto.input.message.trim() || dto.input.message.length > 10000) throw new BadRequestException('input.message须为1至10000字符');
    return { workspace, version };
  }

  configuredModels() { return this.configured?.models() ?? []; }

  async runAgent(
    userId: string,
    agentId: string,
    dto: RunAgentDto,
    options: { allowDraftVersion?: boolean; bypassSemanticCache?: boolean; queuedRun?: any } = {},
  ) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, workspaceId: workspace.id },
      include: { currentVersion: true },
    });
    if (!agent) {
      throw new NotFoundException('Agent 不存在或无权访问');
    }

    const version = await this.resolveVersion(
      agent,
      dto.agentVersionId,
      options.allowDraftVersion === true,
    );
    const message = dto.input.message;
    if (typeof message !== 'string' || message.trim().length === 0) {
      throw new BadRequestException('运行时要求 input.message 为非空字符串');
    }
    if (message.length > 10_000) {
      throw new BadRequestException('input.message 不能超过 10000 个字符');
    }

    const runtimeConfig = (version.runtimeConfig || {}) as Record<string, unknown>;
    const isConfigured = ['single-agent-v1', 'finite-workflow-v1'].includes(String(runtimeConfig.adapter));
    if (isConfigured && !options.queuedRun && !options.allowDraftVersion) {
      throw new ConflictException('配置运行必须通过带 requestKey 的 runs 队列入口启动');
    }
    const prepared = isConfigured && this.configured
      ? await this.configured.prepare(version, workspace.id, options.allowDraftVersion === true) : undefined;
    if (runtimeConfig.adapter !== 'interview-multi-agent' && !prepared) {
      throw new BadRequestException(
        `当前仅支持 interview-multi-agent 适配器，版本 ${version.version} 未配置该适配器`,
      );
    }

    const startedAt = new Date();
    const run = options.queuedRun || await this.prisma.run.create({
      data: {
        workspaceId: workspace.id,
        agentId: agent.id,
        agentVersionId: version.id,
        application: dto.application,
        externalRunId: dto.externalRunId,
        input: dto.input as any,
        status: 'RUNNING',
        startedAt,
      },
    });
    await this.writeTrace(run.id, {
      type: 'turn.start',
      name: 'Agent Run Started',
      step: 'runtime',
      input: dto.input,
      payload: {
        application: dto.application ?? null,
        adapter: runtimeConfig.adapter,
      },
      metadata: {
        application: dto.application ?? null,
        adapter: runtimeConfig.adapter,
        tokenUsage: 'unavailable',
        estimatedCost: 'unavailable',
      },
    });

    try {
      if (!prepared && !this.multiAgent.isEnabled()) {
        throw new ConflictException('interview-multi-agent 运行时当前未启用');
      }

      const graphResult: any = prepared
        ? await this.configured!.execute(userId, run, version, dto.input, prepared)
        : await this.multiAgent.run(
        message,
        dto.externalRunId || run.id,
        [],
        version.systemPrompt,
        { bypassSemanticCache: options.bypassSemanticCache === true },
      );
      const completedAt = new Date();
      const latencyMs = completedAt.getTime() - startedAt.getTime();
      const output = graphResult.output || {
        response: graphResult.response,
        intent: graphResult.intent,
        plan: graphResult.plan,
        pastSteps: graphResult.pastSteps,
        steps: graphResult.steps,
        threadId: graphResult.threadId,
      };

      const completion = {
        data: {
          status: 'COMPLETED' as const,
          output: output as any,
          latencyMs,
          tokenUsage: graphResult.tokenUsage as any,
          estimatedCost: graphResult.estimatedCostCny,
          completedAt,
        },
      };
      let completed: any;
      if (options.queuedRun) {
        const updated = await this.prisma.run.updateMany({ where: { id: run.id, status: 'RUNNING', cancelRequestedAt: null, leaseOwner: run.leaseOwner }, ...completion });
        if (!updated.count) throw new RuntimeCancelledError('运行租约已失效，不覆盖终态');
        completed = await this.prisma.run.findFirst({ where: { id: run.id } });
      } else completed = await this.prisma.run.update({ where: { id: run.id }, ...completion });
      await this.writeTrace(run.id, {
        type: 'turn.end',
        name: 'Agent Run Completed',
        step: 'runtime',
        output,
        payload: { status: 'COMPLETED', output },
        latencyMs,
        tokenUsage: graphResult.tokenUsage,
        estimatedCost: graphResult.estimatedCostCny,
        metadata: {
          adapter: runtimeConfig.adapter,
          pricing: graphResult.pricing,
        },
      });
      return completed;
    } catch (error: any) {
      const completedAt = new Date();
      const latencyMs = completedAt.getTime() - startedAt.getTime();
      const message = error?.message || '运行时执行失败';
      await (options.queuedRun ? this.prisma.run.updateMany({
        where: { id: run.id, status: 'RUNNING', ...(options.queuedRun ? { leaseOwner: run.leaseOwner } : {}) },
        data: {
          status: error instanceof RuntimeCancelledError ? 'CANCELLED' : 'FAILED',
          error: message,
          latencyMs,
          completedAt,
        },
      }) : this.prisma.run.update({ where: { id: run.id }, data: {
        status: error instanceof RuntimeCancelledError ? 'CANCELLED' : 'FAILED', error: message, latencyMs, completedAt,
      } }));
      await this.writeTrace(run.id, {
        type: error instanceof RuntimeCancelledError ? 'run.cancelled' : 'run.failed',
        name: error instanceof RuntimeCancelledError ? 'Agent Run Cancelled' : 'Agent Run Failed',
        step: 'runtime',
        payload: { status: error instanceof RuntimeCancelledError ? 'CANCELLED' : 'FAILED', error: message },
        latencyMs,
        error: message,
      });
      if (error && typeof error === 'object') {
        error.agentLabRunId = run.id;
      }
      throw error;
    }
  }

  /**
   * 为已有 Application 流程建立 Lab Run，但不接管该流程的执行。
   * Interview SSE 仍由既有服务负责，完成后通过 completeExternalRun 回写统一 Run/Trace。
   */
  async startExternalRun(userId: string, agentId: string, dto: RunAgentDto) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, workspaceId: workspace.id },
      include: { currentVersion: true },
    });
    if (!agent) throw new NotFoundException('Agent 不存在或无权访问');
    const version = await this.resolveVersion(agent, dto.agentVersionId);
    const message = dto.input.message;
    if (typeof message !== 'string' || message.trim().length === 0) {
      throw new BadRequestException('Application Run 要求 input.message 为非空字符串');
    }
    const runtimeConfig = (version.runtimeConfig || {}) as Record<string, unknown>;
    const startedAt = new Date();
    const run = await this.prisma.run.create({
      data: {
        workspaceId: workspace.id,
        agentId: agent.id,
        agentVersionId: version.id,
        application: dto.application,
        externalRunId: dto.externalRunId,
        input: dto.input as any,
        status: 'RUNNING',
        startedAt,
      },
    });
    // 用户消息属于模型可见历史，不能降级为尽力而为遥测。
    await this.trace.append(run.id, {
      type: 'user.message',
      name: 'Application User Message',
      step: 'application-bridge',
      payload: { content: message },
    });
    await this.writeTrace(run.id, {
      type: 'turn.start',
      name: 'Application Run Started',
      step: 'application-bridge',
      input: dto.input,
      payload: {
        application: dto.application ?? null,
        adapter: runtimeConfig.adapter ?? 'external',
      },
    });
    return run;
  }

  async completeExternalRun(runId: string, output: Record<string, unknown>) {
    const run = await this.prisma.run.findUnique({
      where: { id: runId },
      select: { id: true, startedAt: true },
    });
    if (!run) throw new NotFoundException('Run 不存在');
    const completedAt = new Date();
    const latencyMs = run.startedAt ? completedAt.getTime() - run.startedAt.getTime() : undefined;
    const response = typeof output.response === 'string' ? output.response : JSON.stringify(output);
    await this.trace.append(runId, {
      type: 'assistant.message',
      name: 'Application Assistant Message',
      step: 'application-bridge',
      payload: { content: response },
    });
    const completed = await this.prisma.run.update({
      where: { id: runId },
      data: {
        status: 'COMPLETED',
        output: output as any,
        latencyMs,
        completedAt,
      },
    });
    await this.writeTrace(runId, {
      type: 'turn.end',
      name: 'Application Run Completed',
      step: 'application-bridge',
      output,
      payload: { status: 'COMPLETED', output },
      latencyMs,
    });
    return completed;
  }

  async failExternalRun(runId: string, message: string) {
    const completedAt = new Date();
    const existing = await this.prisma.run.findUnique({
      where: { id: runId },
      select: { startedAt: true },
    });
    if (!existing) throw new NotFoundException('Run 不存在');
    const latencyMs = existing.startedAt ? completedAt.getTime() - existing.startedAt.getTime() : undefined;
    const failed = await this.prisma.run.update({
      where: { id: runId },
      data: { status: 'FAILED', error: message, latencyMs, completedAt },
    });
    await this.writeTrace(runId, {
      type: 'run.failed',
      name: 'Application Run Failed',
      step: 'application-bridge',
      payload: { status: 'FAILED', error: message },
      error: message,
      latencyMs,
    });
    return failed;
  }

  async listRuns(userId: string, agentId?: string) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    if (agentId) {
      await this.requireAgent(workspace.id, agentId);
    }
    return this.prisma.run.findMany({
      where: {
        workspaceId: workspace.id,
        ...(agentId ? { agentId } : {}),
      },
      include: {
        agent: { select: { id: true, key: true, name: true } },
        agentVersion: { select: { id: true, version: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getRun(userId: string, runId: string) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    const run = await this.prisma.run.findFirst({
      where: { id: runId, workspaceId: workspace.id },
      include: {
        agent: { select: { id: true, key: true, name: true } },
        agentVersion: { select: { id: true, version: true, status: true } },
      },
    });
    if (!run) {
      throw new NotFoundException('Run 不存在或无权访问');
    }
    return run;
  }

  async getTrace(userId: string, runId: string) {
    await this.getRun(userId, runId);
    return this.trace.list(runId);
  }

  async exportTrace(userId: string, runId: string) {
    await this.getRun(userId, runId);
    return this.trace.exportJsonl(runId);
  }

  async exportTraceBundle(userId: string, runId: string) {
    const run = await this.getRun(userId, runId);
    const events = await this.trace.list(runId);
    return this.traceBundles.buildBundle(run, events);
  }

  private async resolveVersion(
    agent: any,
    requestedVersionId?: string,
    allowDraftVersion = false,
  ) {
    const version = requestedVersionId
      ? await this.prisma.agentVersion.findFirst({
          where: { id: requestedVersionId, agentId: agent.id },
        })
      : agent.currentVersion;
    if (!version) {
      throw new NotFoundException('Agent 没有可运行的版本');
    }
    const draftAllowed = allowDraftVersion
      && Boolean(requestedVersionId)
      && version.status === 'DRAFT';
    if (version.status !== 'PUBLISHED' && !draftAllowed) {
      throw new ConflictException('只能运行已发布的 AgentVersion');
    }
    return version;
  }

  private async requireAgent(workspaceId: string, agentId: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, workspaceId },
      select: { id: true },
    });
    if (!agent) {
      throw new NotFoundException('Agent 不存在或无权访问');
    }
    return agent;
  }

  private async getOrCreateDefaultWorkspace(userId: string) {
    return this.prisma.workspace.upsert({
      where: { slug: `personal-${userId}` },
      create: {
        name: `${userId} 的工作区`,
        slug: `personal-${userId}`,
        ownerId: userId,
        members: {
          create: {
            userId,
            role: 'OWNER',
          },
        },
      },
      update: {},
    });
  }

  private async writeTrace(
    runId: string,
    event: {
      type: string;
      name: string;
      step?: string;
      payload?: unknown;
      input?: unknown;
      output?: unknown;
      metadata?: unknown;
      latencyMs?: number;
      tokenUsage?: unknown;
      estimatedCost?: number;
      error?: string;
    },
  ) {
    try {
      return await this.trace.append(runId, {
        type: event.type,
        name: event.name,
        step: event.step,
        payload: event.payload,
        input: event.input,
        output: event.output,
        metadata: event.metadata,
        latencyMs: event.latencyMs,
        tokenUsage: event.tokenUsage,
        estimatedCost: event.estimatedCost,
        error: event.error,
      });
    } catch (error: any) {
      this.logger.warn(`运行遥测写入失败，Run ${runId}: ${error?.message || 'unknown error'}`);
    }
  }
}
