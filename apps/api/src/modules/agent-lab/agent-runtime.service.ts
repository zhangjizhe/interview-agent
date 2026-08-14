import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
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
  ) {}

  async runAgent(userId: string, agentId: string, dto: RunAgentDto) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, workspaceId: workspace.id },
      include: { currentVersion: true },
    });
    if (!agent) {
      throw new NotFoundException('Agent 不存在或无权访问');
    }

    const version = await this.resolveVersion(agent, dto.agentVersionId);
    const message = dto.input.message;
    if (typeof message !== 'string' || message.trim().length === 0) {
      throw new BadRequestException('当前 Interview 运行时要求 input.message 为非空字符串');
    }
    if (message.length > 10_000) {
      throw new BadRequestException('input.message 不能超过 10000 个字符');
    }

    const runtimeConfig = (version.runtimeConfig || {}) as Record<string, unknown>;
    if (runtimeConfig.adapter !== 'interview-multi-agent') {
      throw new BadRequestException(
        `当前仅支持 interview-multi-agent 适配器，版本 ${version.version} 未配置该适配器`,
      );
    }

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
      if (!this.multiAgent.isEnabled()) {
        throw new ConflictException('interview-multi-agent 运行时当前未启用');
      }

      const graphResult = await this.multiAgent.run(
        message,
        dto.externalRunId || run.id,
      );
      const completedAt = new Date();
      const latencyMs = completedAt.getTime() - startedAt.getTime();
      const output = {
        response: graphResult.response,
        intent: graphResult.intent,
        plan: graphResult.plan,
        pastSteps: graphResult.pastSteps,
        steps: graphResult.steps,
        threadId: graphResult.threadId,
      };

      const completed = await this.prisma.run.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          output: output as any,
          latencyMs,
          completedAt,
        },
      });
      await this.writeTrace(run.id, {
        type: 'turn.end',
        name: 'Agent Run Completed',
        step: 'runtime',
        output,
        payload: { status: 'COMPLETED', output },
        latencyMs,
        metadata: {
          adapter: runtimeConfig.adapter,
          tokenUsage: 'unavailable',
          estimatedCost: 'unavailable',
        },
      });
      return completed;
    } catch (error: any) {
      const completedAt = new Date();
      const latencyMs = completedAt.getTime() - startedAt.getTime();
      const message = error?.message || '运行时执行失败';
      await this.prisma.run.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          error: message,
          latencyMs,
          completedAt,
        },
      });
      await this.writeTrace(run.id, {
        type: 'run.failed',
        name: 'Agent Run Failed',
        step: 'runtime',
        payload: { status: 'FAILED', error: message },
        latencyMs,
        error: message,
      });
      if (error && typeof error === 'object') {
        error.agentLabRunId = run.id;
      }
      throw error;
    }
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

  private async resolveVersion(agent: any, requestedVersionId?: string) {
    const version = requestedVersionId
      ? await this.prisma.agentVersion.findFirst({
          where: { id: requestedVersionId, agentId: agent.id },
        })
      : agent.currentVersion;
    if (!version) {
      throw new NotFoundException('Agent 没有可运行的版本');
    }
    if (version.status !== 'PUBLISHED') {
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
        error: event.error,
      });
    } catch (error: any) {
      this.logger.warn(`运行遥测写入失败，Run ${runId}: ${error?.message || 'unknown error'}`);
    }
  }
}
