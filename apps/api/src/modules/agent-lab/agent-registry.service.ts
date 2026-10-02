import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  CloneAgentDto,
  CreateAgentDto,
  CreateAgentVersionDto,
  UpdateAgentDto,
} from './dto/agent.dto';
import { inferReleaseGate } from '../inference/release-gate-inference';
import { DecisionLedgerService } from '../inference/decision-ledger.service';
import { DecisionDomain } from '@prisma/client';

const INTERVIEW_AGENT_KEY = 'interview-interviewer';
const INTERVIEW_AGENT_VERSION = '1.0.0';

const interviewAgentVersion = {
  version: INTERVIEW_AGENT_VERSION,
  systemPrompt:
    '当前版本由 InterviewAgentService 根据岗位、职级、候选人上下文和题库动态构建面试官提示词。',
  modelConfig: {
    provider: 'qwen',
    model: 'qwen-plus',
    fallbackProvider: 'deepseek',
  },
  runtimeConfig: {
    adapter: 'interview-multi-agent',
    engine: 'multi',
    graph: 'interview',
  },
  toolBindings: {
    available: [
      'bocha_search',
      'memory_recall',
      'knowledge_bank',
      'github_get_user',
      'github_list_repos',
      'github_get_readme',
      'notion_search',
      'notion_get_page',
      'notion_list_databases',
    ],
  },
  knowledgeBindings: {
    resources: ['interview_knowledge_base'],
  },
  memoryBindings: {
    shortTerm: 'redis',
    longTerm: ['milvus', 'mem0'],
  },
  inputSchema: {
    type: 'object',
    required: ['message', 'position', 'level'],
    properties: {
      message: { type: 'string' },
      position: { type: 'string' },
      level: { type: 'string' },
      sessionId: { type: 'string' },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      response: { type: 'string' },
      events: { type: 'array' },
    },
  },
  changelog: '将现有 InterviewAgentService 注册为 AgentLab 的首个版本化 Agent。',
};

@Injectable()
export class AgentRegistryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly decisionLedger: DecisionLedgerService,
  ) {}

  async listAgents(userId: string) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    return this.prisma.agent.findMany({
      where: { workspaceId: workspace.id },
      include: {
        currentVersion: true,
        _count: { select: { versions: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getAgent(userId: string, agentId: string) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    return this.requireAgent(workspace.id, agentId, {
      currentVersion: true,
      versions: { orderBy: { createdAt: 'desc' } },
    });
  }

  async createAgent(userId: string, dto: CreateAgentDto) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    try {
      return await this.prisma.agent.create({
        data: {
          workspaceId: workspace.id,
          key: dto.key,
          name: dto.name,
          description: dto.description,
          type: dto.type,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException(`Agent key "${dto.key}" 已存在`);
      }
      throw error;
    }
  }

  async updateAgent(userId: string, agentId: string, dto: UpdateAgentDto) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    await this.requireAgent(workspace.id, agentId);
    return this.prisma.agent.update({
      where: { id: agentId },
      data: {
        name: dto.name,
        description: dto.description,
        type: dto.type,
      },
    });
  }

  async deleteAgent(userId: string, agentId: string) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    await this.requireAgent(workspace.id, agentId);
    await this.prisma.agent.delete({ where: { id: agentId } });
    return { deleted: true, agentId };
  }

  async cloneAgent(userId: string, agentId: string, dto: CloneAgentDto) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    const source = await this.requireAgent(workspace.id, agentId, {
      currentVersion: true,
    });

    try {
      return await this.prisma.$transaction(async (tx) => {
        const cloned = await tx.agent.create({
          data: {
            workspaceId: workspace.id,
            key: dto.key,
            name: dto.name,
            description: source.description,
            type: source.type,
          },
        });

        if (!source.currentVersion) {
          return cloned;
        }

        const copiedVersion = await tx.agentVersion.create({
          data: {
            agentId: cloned.id,
            version: '1.0.0',
            status: 'DRAFT',
            modelConfig: source.currentVersion.modelConfig ?? undefined,
            systemPrompt: source.currentVersion.systemPrompt,
            runtimeConfig: source.currentVersion.runtimeConfig ?? undefined,
            toolBindings: source.currentVersion.toolBindings ?? undefined,
            knowledgeBindings: source.currentVersion.knowledgeBindings ?? undefined,
            memoryBindings: source.currentVersion.memoryBindings ?? undefined,
            inputSchema: source.currentVersion.inputSchema ?? undefined,
            outputSchema: source.currentVersion.outputSchema ?? undefined,
            changelog: `从 ${source.key}@${source.currentVersion.version} 克隆`,
          },
        });

        return tx.agent.update({
          where: { id: cloned.id },
          data: { currentVersionId: copiedVersion.id },
        });
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException(`Agent key "${dto.key}" 已存在`);
      }
      throw error;
    }
  }

  async createVersion(userId: string, agentId: string, dto: CreateAgentVersionDto) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    await this.requireAgent(workspace.id, agentId);
    try {
      return await this.prisma.agentVersion.create({
        data: {
          agentId,
          version: dto.version,
          systemPrompt: dto.systemPrompt ?? '',
          modelConfig: dto.modelConfig as any,
          runtimeConfig: dto.runtimeConfig as any,
          toolBindings: dto.toolBindings as any,
          knowledgeBindings: dto.knowledgeBindings as any,
          memoryBindings: dto.memoryBindings as any,
          inputSchema: dto.inputSchema as any,
          outputSchema: dto.outputSchema as any,
          changelog: dto.changelog,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException(`版本 "${dto.version}" 已存在`);
      }
      throw error;
    }
  }

  async listVersions(userId: string, agentId: string) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    await this.requireAgent(workspace.id, agentId);
    return this.prisma.agentVersion.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async publishVersion(userId: string, agentId: string, versionId: string) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    const version = await this.requireVersion(workspace.id, agentId, versionId);
    if (version.status === 'PUBLISHED') {
      const result = {
        ...version,
        releaseGate: {
          outcome: { allowed: true, reason: '版本已发布，无需重复执行发布门禁。' },
          ruleSetVersion: 'release-gate/v1',
          matchedRules: ['RG-000:already-published'],
          evidence: { agentVersionId: version.id },
        },
      };
      await this.recordReleaseGate(agentId, version.id, userId, result.releaseGate);
      return result;
    }

    const releaseGate = await this.getReleaseGateForVersion(agentId, version.id);
    await this.recordReleaseGate(agentId, version.id, userId, releaseGate);
    if (!releaseGate.outcome.allowed) {
      throw new ConflictException(releaseGate.outcome.reason);
    }

    const published = await this.prisma.$transaction(async (tx) => {
      const published = await tx.agentVersion.update({
        where: { id: version.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: version.publishedAt ?? new Date(),
        },
      });
      await tx.agent.update({
        where: { id: agentId },
        data: {
          status: 'ACTIVE',
          currentVersionId: published.id,
        },
      });
      return published;
    });

    return { ...published, releaseGate };
  }

  async getReleaseGate(userId: string, agentId: string, versionId: string) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    const version = await this.requireVersion(workspace.id, agentId, versionId);
    return this.getReleaseGateForVersion(agentId, version.id);
  }

  async getVersionDecisionSnapshot(
    userId: string,
    agentId: string,
    versionId: string,
    asOf?: string,
  ) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    const version = await this.requireVersion(workspace.id, agentId, versionId);
    const at = this.parseAsOf(asOf);
    const [decisions, facts] = await Promise.all([
      this.decisionLedger.listDecisionsAt(version.id, at),
      this.decisionLedger.listFactsAt('AGENT_VERSION', version.id, at),
    ]);

    return {
      asOf: at.toISOString(),
      decisions,
      facts,
    };
  }

  async activateVersion(userId: string, agentId: string, versionId: string) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    const version = await this.requireVersion(workspace.id, agentId, versionId);
    if (version.status !== 'PUBLISHED') {
      throw new ConflictException('只有已发布版本可以作为当前版本');
    }

    await this.prisma.agent.update({
      where: { id: agentId },
      data: {
        status: 'ACTIVE',
        currentVersionId: version.id,
      },
    });
    return version;
  }

  async bootstrapInterviewAgent(userId: string) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    const agent = await this.prisma.agent.upsert({
      where: {
        workspaceId_key: {
          workspaceId: workspace.id,
          key: INTERVIEW_AGENT_KEY,
        },
      },
      create: {
        workspaceId: workspace.id,
        key: INTERVIEW_AGENT_KEY,
        name: 'Interview Agent',
        description: 'AgentLab 上的第一个真实应用 Agent，负责运行当前 AI 面试流程。',
        type: 'interviewer',
      },
      update: {},
    });

    const version = await this.prisma.agentVersion.upsert({
      where: {
        agentId_version: {
          agentId: agent.id,
          version: INTERVIEW_AGENT_VERSION,
        },
      },
      create: {
        agentId: agent.id,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        ...interviewAgentVersion,
      },
      update: {},
    });

    if (!agent.currentVersionId) {
      await this.prisma.agent.update({
        where: { id: agent.id },
        data: {
          status: 'ACTIVE',
          currentVersionId: version.id,
        },
      });
    }

    return this.getAgent(userId, agent.id);
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

  private async requireAgent(
    workspaceId: string,
    agentId: string,
    include?: Record<string, unknown>,
  ): Promise<any> {
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, workspaceId },
      include: include as any,
    });
    if (!agent) {
      throw new NotFoundException('Agent 不存在或无权访问');
    }
    return agent;
  }

  private async requireVersion(workspaceId: string, agentId: string, versionId: string) {
    const version = await this.prisma.agentVersion.findFirst({
      where: {
        id: versionId,
        agentId,
        parentAgent: { workspaceId },
      },
    });
    if (!version) {
      throw new NotFoundException('Agent 版本不存在或无权访问');
    }
    return version;
  }

  private async getReleaseGateForVersion(agentId: string, agentVersionId: string) {
    const evaluation = await this.prisma.agentEvaluationRun.findFirst({
      where: {
        agentVersionId,
        status: 'COMPLETED',
      },
      orderBy: { completedAt: 'desc' },
      select: {
        id: true,
        status: true,
        score: true,
        totalCases: true,
        passedCases: true,
        failedCases: true,
        completedAt: true,
        datasetId: true,
        evaluatorId: true,
      },
    });
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId },
      select: { currentVersionId: true },
    });
    const comparisonRequired = Boolean(
      agent?.currentVersionId && agent.currentVersionId !== agentVersionId,
    );
    const baseline = comparisonRequired && evaluation
      ? await this.prisma.agentEvaluationRun.findFirst({
          where: {
            agentId,
            agentVersionId: agent!.currentVersionId!,
            datasetId: evaluation.datasetId,
            evaluatorId: evaluation.evaluatorId,
            status: 'COMPLETED',
          },
          orderBy: { completedAt: 'desc' },
          select: {
            id: true,
            status: true,
            score: true,
            totalCases: true,
            passedCases: true,
            failedCases: true,
            completedAt: true,
          },
        })
      : null;
    return inferReleaseGate(evaluation, {
      required: comparisonRequired,
      baseline,
    });
  }

  private async recordReleaseGate(
    agentId: string,
    agentVersionId: string,
    actorId: string,
    releaseGate: ReturnType<typeof inferReleaseGate>,
  ) {
    const evaluation = releaseGate.evidence.evaluation;
    const evaluationId = this.toRecord(evaluation).id;
    await this.decisionLedger.record({
      domain: DecisionDomain.AGENT_LAB,
      decisionType: 'agent-version.release-gate',
      subjectType: 'AGENT_VERSION',
      subjectId: agentVersionId,
      agentId,
      agentVersionId,
      actorId,
      outcome: releaseGate.outcome,
      ruleSetVersion: releaseGate.ruleSetVersion,
      inputSnapshot: {
        evaluation: evaluation ?? null,
        minimumScore: releaseGate.evidence.minimumScore ?? null,
      },
      facts: [
        {
          subjectType: 'AGENT_VERSION',
          subjectId: agentVersionId,
          predicate: 'release.gate',
          value: {
            allowed: releaseGate.outcome.allowed,
            reason: releaseGate.outcome.reason,
          },
          sourceType: 'EVALUATION_RUN',
          sourceId: typeof evaluationId === 'string' ? evaluationId : undefined,
        },
      ],
      evidence: [
        {
          kind: 'RULE_EVALUATION',
          sourceType: 'RELEASE_GATE',
          sourceId: agentVersionId,
          payload: {
            matchedRules: releaseGate.matchedRules,
            evidence: releaseGate.evidence,
          },
        },
      ],
    });
  }

  private toRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  }

  private parseAsOf(value?: string) {
    if (!value) return new Date();
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('asOf 必须是有效的 ISO 时间');
    }
    return parsed;
  }
}
