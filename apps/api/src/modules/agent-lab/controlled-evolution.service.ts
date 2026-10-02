import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { GenerateImprovementCandidateDto } from './dto/controlled-evolution.dto';

const MIN_RELEASE_SCORE = 90;
const POLICY_HEADING = '【Agent Lab 受控改进策略】';

const STRATEGIES: Record<string, string> = {
  KEYWORD_MISMATCH: '回答必须覆盖任务要求的核心概念，并在输出前检查是否遗漏关键点。',
  JSON_SCHEMA_MISMATCH: '严格遵守约定的结构化输出字段，不得省略必填字段。',
  LATENCY_EXCEEDED: '优先给出直接且精炼的回答，减少不必要的规划与重复表达。',
  RUN_FAILED: '采用保守、可恢复的执行路径；工具不可用时给出明确且安全的降级回答。',
};

@Injectable()
export class ControlledEvolutionService {
  constructor(private readonly prisma: PrismaService) {}

  async generateCandidate(
    userId: string,
    agentId: string,
    dto: GenerateImprovementCandidateDto,
  ) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, workspaceId: workspace.id },
      include: { currentVersion: true },
    });
    if (!agent) throw new NotFoundException('Agent 不存在或无权访问');
    if (!agent.currentVersion || agent.currentVersion.status !== 'PUBLISHED') {
      throw new ConflictException('Agent 必须先有已发布的当前版本，才能生成改进候选');
    }

    const evaluation = await this.prisma.agentEvaluationRun.findFirst({
      where: {
        id: dto.sourceEvaluationId,
        workspaceId: workspace.id,
        agentId,
      },
      include: {
        results: {
          where: { passed: false },
          select: { failureCategory: true },
        },
      },
    });
    if (!evaluation) throw new NotFoundException('Evaluation 不存在或无权访问');
    if (evaluation.status !== 'COMPLETED' || evaluation.failedCases < 1) {
      throw new ConflictException('只有已完成且包含失败用例的评测可以生成改进候选');
    }
    if (evaluation.agentVersionId !== agent.currentVersion.id) {
      throw new ConflictException('只能基于当前已发布版本的失败评测生成候选');
    }

    const failureCategories = [...new Set(
      evaluation.results
        .map((item) => item.failureCategory)
        .filter((item): item is string => Boolean(item)),
    )].sort();
    const strategies = failureCategories.map(
      (category) => STRATEGIES[category]
        ?? '保持回答与用户目标、已有证据和输出约束一致，并在输出前完成自检。',
    );
    const uniqueStrategies = [...new Set(strategies)];
    const versions = await this.prisma.agentVersion.findMany({
      where: { agentId },
      select: { version: true },
    });
    const version = this.nextPatchVersion(agent.currentVersion.version, versions.map((item) => item.version));
    const strategyBlock = `${POLICY_HEADING}\n${uniqueStrategies.map((item, index) => `${index + 1}. ${item}`).join('\n')}`;
    const systemPrompt = [agent.currentVersion.systemPrompt.trim(), strategyBlock]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 100_000);

    const candidate = await this.prisma.agentVersion.create({
      data: {
        agentId,
        version,
        status: 'DRAFT',
        systemPrompt,
        modelConfig: agent.currentVersion.modelConfig ?? undefined,
        runtimeConfig: agent.currentVersion.runtimeConfig ?? undefined,
        toolBindings: agent.currentVersion.toolBindings ?? undefined,
        knowledgeBindings: agent.currentVersion.knowledgeBindings ?? undefined,
        memoryBindings: agent.currentVersion.memoryBindings ?? undefined,
        inputSchema: agent.currentVersion.inputSchema ?? undefined,
        outputSchema: agent.currentVersion.outputSchema ?? undefined,
        changelog: `受控改进候选；来源评测 ${evaluation.id}；失败分类 ${failureCategories.join(', ') || 'UNKNOWN'}。需完成同集评测并由管理员发布。`,
      },
    });

    return {
      sourceEvaluationId: evaluation.id,
      baseVersion: {
        id: agent.currentVersion.id,
        version: agent.currentVersion.version,
      },
      failureCategories,
      strategies: uniqueStrategies,
      candidate,
      requiresHumanApproval: true,
    };
  }

  async compareCandidate(userId: string, agentId: string, candidateVersionId: string) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, workspaceId: workspace.id },
      include: { currentVersion: true },
    });
    if (!agent) throw new NotFoundException('Agent 不存在或无权访问');
    if (!agent.currentVersion) throw new ConflictException('Agent 没有当前基线版本');
    if (candidateVersionId === agent.currentVersion.id) {
      throw new ConflictException('候选版本必须与当前基线版本不同');
    }

    const candidate = await this.prisma.agentEvaluationRun.findFirst({
      where: {
        workspaceId: workspace.id,
        agentId,
        agentVersionId: candidateVersionId,
        status: 'COMPLETED',
      },
      orderBy: { completedAt: 'desc' },
    });
    if (!candidate) throw new ConflictException('候选版本尚未完成评测');

    const baseline = await this.prisma.agentEvaluationRun.findFirst({
      where: {
        workspaceId: workspace.id,
        agentId,
        agentVersionId: agent.currentVersion.id,
        datasetId: candidate.datasetId,
        evaluatorId: candidate.evaluatorId,
        status: 'COMPLETED',
      },
      orderBy: { completedAt: 'desc' },
    });
    if (!baseline) {
      throw new ConflictException('当前版本缺少同一 Dataset/Evaluator 的基线评测');
    }

    const candidateScore = candidate.score ?? 0;
    const baselineScore = baseline.score ?? 0;
    const allCandidateCasesPassed = candidate.totalCases > 0
      && candidate.failedCases === 0
      && candidate.passedCases === candidate.totalCases;
    const releaseRecommended = allCandidateCasesPassed
      && candidateScore >= MIN_RELEASE_SCORE
      && candidateScore >= baselineScore;

    return {
      comparable: true,
      datasetId: candidate.datasetId,
      evaluatorId: candidate.evaluatorId,
      baseline: this.evaluationSummary(baseline),
      candidate: this.evaluationSummary(candidate),
      scoreDelta: candidateScore - baselineScore,
      releaseRecommendation: releaseRecommended ? 'APPROVE' : 'REJECT',
      reasons: [
        ...(allCandidateCasesPassed ? [] : ['候选版本存在未通过用例']),
        ...(candidateScore >= MIN_RELEASE_SCORE ? [] : [`候选分数低于 ${MIN_RELEASE_SCORE}`]),
        ...(candidateScore >= baselineScore ? [] : ['候选分数低于当前版本基线']),
      ],
    };
  }

  private evaluationSummary(evaluation: any) {
    return {
      evaluationId: evaluation.id,
      agentVersionId: evaluation.agentVersionId,
      score: evaluation.score,
      totalCases: evaluation.totalCases,
      passedCases: evaluation.passedCases,
      failedCases: evaluation.failedCases,
      metrics: evaluation.metrics ?? null,
    };
  }

  private nextPatchVersion(baseVersion: string, existingVersions: string[]) {
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(baseVersion);
    if (!match) throw new ConflictException('当前版本不是有效语义化版本');
    const [major, minor, patch] = match.slice(1).map(Number);
    let nextPatch = patch + 1;
    const existing = new Set(existingVersions);
    while (existing.has(`${major}.${minor}.${nextPatch}`)) nextPatch += 1;
    return `${major}.${minor}.${nextPatch}`;
  }

  private async getOrCreateDefaultWorkspace(userId: string) {
    return this.prisma.workspace.upsert({
      where: { slug: `personal-${userId}` },
      create: {
        name: `${userId} 的工作区`,
        slug: `personal-${userId}`,
        ownerId: userId,
        members: { create: { userId, role: 'OWNER' } },
      },
      update: {},
    });
  }
}
