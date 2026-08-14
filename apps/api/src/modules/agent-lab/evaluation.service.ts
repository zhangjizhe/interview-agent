import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AgentRuntimeService } from './agent-runtime.service';
import {
  CreateEvaluationDatasetCaseDto,
  CreateEvaluationDatasetDto,
  CreateEvaluatorDto,
  RunEvaluationDto,
} from './dto/agent.dto';

type RuleEvaluation = {
  score: number;
  passed: boolean;
  metrics: Record<string, unknown>;
  evidence: Record<string, unknown>;
  failureCategory?: string;
  failureMessage?: string;
};

@Injectable()
export class EvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: AgentRuntimeService,
  ) {}

  async createDataset(userId: string, dto: CreateEvaluationDatasetDto) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    try {
      return await this.prisma.evaluationDataset.create({
        data: {
          workspaceId: workspace.id,
          key: dto.key,
          name: dto.name,
          description: dto.description,
          version: dto.version,
          metadata: dto.metadata as any,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException(`Dataset key "${dto.key}" 已存在`);
      }
      throw error;
    }
  }

  async listDatasets(userId: string) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    return this.prisma.evaluationDataset.findMany({
      where: { workspaceId: workspace.id },
      include: { _count: { select: { cases: true, evaluationRuns: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getDataset(userId: string, datasetId: string) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    return this.requireDataset(workspace.id, datasetId, {
      cases: { orderBy: { createdAt: 'asc' } },
      _count: { select: { evaluationRuns: true } },
    });
  }

  async addDatasetCase(
    userId: string,
    datasetId: string,
    dto: CreateEvaluationDatasetCaseDto,
  ) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    await this.requireDataset(workspace.id, datasetId);
    try {
      return await this.prisma.evaluationCase.create({
        data: {
          datasetId,
          key: dto.key,
          input: dto.input as any,
          expectedOutput: dto.expectedOutput as any,
          metadata: dto.metadata as any,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException(`Dataset case key "${dto.key}" 已存在`);
      }
      throw error;
    }
  }

  async createEvaluator(userId: string, dto: CreateEvaluatorDto) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    try {
      return await this.prisma.evaluator.create({
        data: {
          workspaceId: workspace.id,
          key: dto.key,
          name: dto.name,
          type: dto.type,
          config: dto.config as any,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException(`Evaluator key "${dto.key}" 已存在`);
      }
      throw error;
    }
  }

  async listEvaluators(userId: string) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    return this.prisma.evaluator.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async runEvaluation(userId: string, agentId: string, dto: RunEvaluationDto) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, workspaceId: workspace.id },
      include: { currentVersion: true },
    });
    if (!agent) {
      throw new NotFoundException('Agent 不存在或无权访问');
    }

    const version = await this.resolveVersion(agent, dto.agentVersionId);
    const dataset = await this.requireDataset(workspace.id, dto.datasetId, {
      cases: { where: { enabled: true }, orderBy: { createdAt: 'asc' } },
    });
    if (dataset.cases.length === 0) {
      throw new BadRequestException('Dataset 至少需要一个启用的 case 才能运行评测');
    }
    const evaluator = await this.requireEvaluator(workspace.id, dto.evaluatorId);
    const startedAt = new Date();
    const evaluation = await this.prisma.evaluationRun.create({
      data: {
        workspaceId: workspace.id,
        agentId: agent.id,
        agentVersionId: version.id,
        datasetId: dataset.id,
        evaluatorId: evaluator.id,
        status: 'RUNNING',
        totalCases: dataset.cases.length,
        startedAt,
      },
    });

    try {
      const caseResults: Array<{ score: number; passed: boolean }> = [];
      for (const datasetCase of dataset.cases) {
        try {
          const run = await this.runtime.runAgent(userId, agentId, {
            agentVersionId: version.id,
            application: 'agent-lab-evaluation',
            externalRunId: `evaluation:${evaluation.id}:${datasetCase.id}`,
            input: datasetCase.input as Record<string, unknown>,
          });
          const ruleResult = this.evaluateRule(evaluator, datasetCase, run);
          await this.prisma.evaluationResult.create({
            data: {
              evaluationRunId: evaluation.id,
              datasetCaseId: datasetCase.id,
              runId: run.id,
              status: 'COMPLETED',
              score: ruleResult.score,
              passed: ruleResult.passed,
              metrics: ruleResult.metrics as any,
              evidence: ruleResult.evidence as any,
              outputSummary: this.summarizeOutput(run.output),
              failureCategory: ruleResult.failureCategory,
              failureMessage: ruleResult.failureMessage,
            },
          });
          caseResults.push(ruleResult);
        } catch (error: any) {
          const message = error?.message || '运行或规则评测失败';
          await this.prisma.evaluationResult.create({
            data: {
              evaluationRunId: evaluation.id,
              datasetCaseId: datasetCase.id,
              runId: error?.agentLabRunId,
              status: 'FAILED',
              passed: false,
              failureCategory: 'RUN_FAILED',
              failureMessage: message,
              evidence: { error: message, runId: error?.agentLabRunId ?? null },
            },
          });
          caseResults.push({ score: 0, passed: false });
        }
      }

      const passedCases = caseResults.filter((item) => item.passed).length;
      const score = caseResults.reduce((sum, item) => sum + item.score, 0) / caseResults.length;
      const completedAt = new Date();
      return this.prisma.evaluationRun.update({
        where: { id: evaluation.id },
        data: {
          status: 'COMPLETED',
          score,
          passedCases,
          failedCases: caseResults.length - passedCases,
          completedAt,
          metrics: {
            evaluatorType: evaluator.type,
            totalCases: caseResults.length,
            passedCases,
            failedCases: caseResults.length - passedCases,
            averageScore: score,
            latencyMs: completedAt.getTime() - startedAt.getTime(),
          },
        },
      });
    } catch (error: any) {
      const message = error?.message || '评测执行失败';
      await this.prisma.evaluationRun.update({
        where: { id: evaluation.id },
        data: {
          status: 'FAILED',
          error: message,
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  async listEvaluations(userId: string, agentId: string) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    await this.requireAgent(workspace.id, agentId);
    return this.prisma.evaluationRun.findMany({
      where: { workspaceId: workspace.id, agentId },
      include: {
        agentVersion: { select: { id: true, version: true } },
        dataset: { select: { id: true, key: true, name: true, version: true } },
        evaluator: { select: { id: true, key: true, name: true, type: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getEvaluation(userId: string, evaluationId: string) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    const evaluation = await this.prisma.evaluationRun.findFirst({
      where: { id: evaluationId, workspaceId: workspace.id },
      include: {
        agent: { select: { id: true, key: true, name: true } },
        agentVersion: { select: { id: true, version: true } },
        dataset: { select: { id: true, key: true, name: true, version: true } },
        evaluator: { select: { id: true, key: true, name: true, type: true } },
        results: {
          include: {
            datasetCase: { select: { id: true, key: true, input: true, expectedOutput: true } },
            run: { select: { id: true, status: true, latencyMs: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!evaluation) {
      throw new NotFoundException('Evaluation 不存在或无权访问');
    }
    return evaluation;
  }

  private evaluateRule(evaluator: any, datasetCase: any, run: any): RuleEvaluation {
    const expected = this.toRecord(datasetCase.expectedOutput);
    const config = this.toRecord(evaluator.config);
    if (evaluator.type === 'KEYWORD') {
      const keywords = this.stringList(expected.keywords);
      const output = JSON.stringify(run.output ?? {}).toLowerCase();
      const matched = keywords.filter((keyword) => output.includes(keyword.toLowerCase()));
      const score = keywords.length === 0 ? 100 : (matched.length / keywords.length) * 100;
      const minScore = this.numberConfig(config.minScore, 100);
      const passed = score >= minScore;
      return {
        score,
        passed,
        metrics: { expectedKeywords: keywords, matchedKeywords: matched, minScore },
        evidence: { output: run.output ?? null },
        ...(passed
          ? {}
          : {
              failureCategory: 'KEYWORD_MISMATCH',
              failureMessage: `关键词命中 ${matched.length}/${keywords.length}，低于阈值 ${minScore}`,
            }),
      };
    }

    if (evaluator.type === 'JSON_SCHEMA') {
      const requiredKeys = this.stringList(expected.requiredKeys ?? config.requiredKeys);
      const output = this.toRecord(run.output);
      const missingKeys = requiredKeys.filter((key) => !(key in output));
      const score = requiredKeys.length === 0 ? 100 : ((requiredKeys.length - missingKeys.length) / requiredKeys.length) * 100;
      return {
        score,
        passed: missingKeys.length === 0,
        metrics: { requiredKeys, missingKeys },
        evidence: { output: run.output ?? null },
        ...(missingKeys.length === 0
          ? {}
          : {
              failureCategory: 'JSON_SCHEMA_MISMATCH',
              failureMessage: `输出缺少字段：${missingKeys.join(', ')}`,
            }),
      };
    }

    const maxLatencyMs = this.numberConfig(config.maxLatencyMs, 10_000);
    const latencyMs = typeof run.latencyMs === 'number' ? run.latencyMs : Number.MAX_SAFE_INTEGER;
    const passed = latencyMs <= maxLatencyMs;
    return {
      score: passed ? 100 : Math.max(0, (maxLatencyMs / latencyMs) * 100),
      passed,
      metrics: { latencyMs, maxLatencyMs },
      evidence: { runId: run.id, latencyMs },
      ...(passed
        ? {}
        : {
            failureCategory: 'LATENCY_EXCEEDED',
            failureMessage: `运行耗时 ${latencyMs}ms，超过阈值 ${maxLatencyMs}ms`,
          }),
    };
  }

  private async resolveVersion(agent: any, requestedVersionId?: string) {
    const version = requestedVersionId
      ? await this.prisma.agentVersion.findFirst({
          where: { id: requestedVersionId, agentId: agent.id },
        })
      : agent.currentVersion;
    if (!version) {
      throw new NotFoundException('Agent 没有可评测的版本');
    }
    if (version.status !== 'PUBLISHED') {
      throw new ConflictException('只能评测已发布的 AgentVersion');
    }
    return version;
  }

  private async requireDataset(
    workspaceId: string,
    datasetId: string,
    include?: Record<string, unknown>,
  ): Promise<any> {
    const dataset = await this.prisma.evaluationDataset.findFirst({
      where: { id: datasetId, workspaceId },
      include: include as any,
    });
    if (!dataset) {
      throw new NotFoundException('Dataset 不存在或无权访问');
    }
    return dataset;
  }

  private async requireEvaluator(workspaceId: string, evaluatorId: string) {
    const evaluator = await this.prisma.evaluator.findFirst({
      where: { id: evaluatorId, workspaceId, enabled: true },
    });
    if (!evaluator) {
      throw new NotFoundException('Evaluator 不存在、未启用或无权访问');
    }
    return evaluator;
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

  private toRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private stringList(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : [];
  }

  private numberConfig(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? value
      : fallback;
  }

  private summarizeOutput(value: unknown): string {
    const serialized = JSON.stringify(value ?? null);
    return serialized.length > 2_000 ? `${serialized.slice(0, 2_000)}...` : serialized;
  }
}
