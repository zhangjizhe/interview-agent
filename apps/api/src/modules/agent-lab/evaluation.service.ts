import { assertSchema } from './configured-runtime.contract';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AgentRuntimeService } from './agent-runtime.service';
import {
  CreateEvaluationDatasetCaseDto,
  CreateEvaluationDatasetDto,
  CreateEvaluatorDto,
  RunEvaluationDto,
} from './dto/agent.dto';
import { buildStratifiedEvaluationEvidence } from '../inference/evaluation-statistics';
import { EvaluationCancellationError } from './evaluation-job.errors';
import {
  CURATED_INTERVIEW_RELEASE_DATASET,
  CURATED_INTERVIEW_RELEASE_EVALUATOR,
} from './curated-release-dataset';

const DEFAULT_RELEASE_EVALUATION_BUDGET_CNY = 5;

class ReleaseEvaluationBudgetError extends Error {}

export interface EvaluationJobExecution {
  id: string;
  startedAt: Date;
  assetHash: string;
  progress: (progress: { completedSamples: number; completedCases: number; spentCny: number; limitCny: number | null; costEvidenceStatus: string }) => Promise<void>;
  finish: (data: Record<string, any>) => Promise<any>;
}

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

  async bootstrapCuratedReleaseDataset(userId: string) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    const manifest = CURATED_INTERVIEW_RELEASE_DATASET;
    const coverage = buildStratifiedEvaluationEvidence(manifest.cases.map((item) => ({
      caseKey: item.key,
      score: 0,
      passed: true,
      metadata: item.metadata,
    })));
    if (coverage.status === 'unavailable') {
      throw new ConflictException(`内置发布 Dataset 清单无效：${coverage.reasons.join('；')}`);
    }
    const canonicalCases = [...manifest.cases]
      .sort((left, right) => left.key.localeCompare(right.key))
      .map((item) => ({
        key: item.key,
        input: item.input,
        expectedOutput: item.expectedOutput,
        metadata: item.metadata,
        enabled: item.enabled,
      }));
    const contentHash = this.datasetContentHash(manifest.version, canonicalCases);

    return this.prisma.$transaction(async (tx) => {
      let dataset = await tx.evaluationDataset.findFirst({
        where: { workspaceId: workspace.id, key: manifest.key },
        include: { cases: { orderBy: { key: 'asc' } } },
      });
      if (dataset) {
        if (dataset.version !== manifest.version || dataset.contentHash !== contentHash || !dataset.frozenAt) {
          throw new ConflictException('同名内置 Dataset 与当前清单不一致；请保留旧版本并使用新的 Dataset key');
        }
      } else {
        dataset = await tx.evaluationDataset.create({
          data: {
            workspaceId: workspace.id,
            key: manifest.key,
            name: manifest.name,
            description: manifest.description,
            version: manifest.version,
            metadata: manifest.metadata as any,
            cases: {
              create: canonicalCases.map((item) => ({
                key: item.key,
                input: item.input as any,
                expectedOutput: item.expectedOutput as any,
                metadata: item.metadata as any,
                enabled: item.enabled,
              })),
            },
          },
          include: { cases: { orderBy: { key: 'asc' } } },
        });
        dataset = await tx.evaluationDataset.update({
          where: { id: dataset.id },
          data: { frozenAt: new Date(), contentHash },
          include: { cases: { orderBy: { key: 'asc' } } },
        });
      }

      let evaluator = await tx.evaluator.findFirst({
        where: { workspaceId: workspace.id, key: CURATED_INTERVIEW_RELEASE_EVALUATOR.key },
      });
      if (!evaluator) {
        evaluator = await tx.evaluator.create({
          data: {
            workspaceId: workspace.id,
            ...CURATED_INTERVIEW_RELEASE_EVALUATOR,
          },
        });
      } else if (evaluator.type !== CURATED_INTERVIEW_RELEASE_EVALUATOR.type
        || this.stableStringify(evaluator.config) !== this.stableStringify(CURATED_INTERVIEW_RELEASE_EVALUATOR.config)) {
        throw new ConflictException('同名内置 Evaluator 与当前合同不一致');
      }

      return {
        dataset,
        evaluator,
        coverage,
        reviewRequired: this.datasetReviewStatus(dataset) !== 'APPROVED',
        releaseRunPlan: {
          cases: canonicalCases.length,
          minimumRepeats: 3,
          samplesPerVersion: canonicalCases.length * 3,
          comparisonSamples: canonicalCases.length * 3 * 2,
          serverBudgetCeilingCny: this.releaseBudgetCeilingCny(),
        },
      };
    }, { isolationLevel: 'Serializable' });
  }

  async approveDatasetReview(userId: string, datasetId: string) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    const dataset = await this.requireDataset(workspace.id, datasetId, {
      cases: { where: { enabled: true }, orderBy: { key: 'asc' } },
    });
    if (!dataset.frozenAt || !dataset.contentHash) {
      throw new ConflictException('只有已冻结并生成内容指纹的 Dataset 可以批准');
    }
    if (this.datasetReviewStatus(dataset) === 'APPROVED') return dataset;
    const coverage = buildStratifiedEvaluationEvidence(dataset.cases.map((item: any) => ({
      caseKey: item.key,
      score: 0,
      passed: true,
      metadata: item.metadata,
    })));
    if (coverage.status === 'unavailable') {
      throw new BadRequestException(`Dataset 不满足发布合同：${coverage.reasons.join('；')}`);
    }
    const governanceReasons = this.datasetGovernanceReasons(dataset.cases);
    if (governanceReasons.length > 0) {
      throw new BadRequestException(`Dataset 治理证据不足：${governanceReasons.join('；')}`);
    }
    const metadata = this.toRecord(dataset.metadata);
    return this.prisma.evaluationDataset.update({
      where: { id: dataset.id },
      data: {
        metadata: {
          ...metadata,
          review: {
            status: 'APPROVED',
            reviewedByUserId: userId,
            reviewedAt: new Date().toISOString(),
          },
        } as any,
      },
      include: { cases: { orderBy: { key: 'asc' } } },
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
    const dataset = await this.requireDataset(workspace.id, datasetId);
    if (dataset.frozenAt) {
      throw new ConflictException('Dataset 已冻结，不能再追加 Case；请创建新版本');
    }
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
      if (error?.code === 'P2004' || String(error?.message).includes('evaluation dataset is frozen')) {
        throw new ConflictException('Dataset 已冻结，不能再追加 Case；请创建新版本');
      }
      throw error;
    }
  }

  async freezeDataset(userId: string, datasetId: string) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    return this.prisma.$transaction(async (tx) => {
      const dataset = await tx.evaluationDataset.findFirst({
        where: { id: datasetId, workspaceId: workspace.id },
        include: { cases: { orderBy: { key: 'asc' } } },
      });
      if (!dataset) throw new NotFoundException('Dataset 不存在或无权访问');
      if (dataset.frozenAt) return dataset;
      if (dataset.cases.length === 0) {
        throw new BadRequestException('Dataset 至少需要一个 Case 才能冻结');
      }
      const contentHash = `sha256:${createHash('sha256')
        .update(this.stableStringify({
          version: dataset.version,
          cases: dataset.cases.map((item: any) => ({
            key: item.key,
            input: item.input,
            expectedOutput: item.expectedOutput,
            metadata: item.metadata,
            enabled: item.enabled,
          })),
        }))
        .digest('hex')}`;
      const frozenAt = new Date();
      const updated = await tx.evaluationDataset.updateMany({
        where: { id: datasetId, workspaceId: workspace.id, frozenAt: null },
        data: { frozenAt, contentHash },
      });
      if (updated.count !== 1) {
        return tx.evaluationDataset.findFirstOrThrow({ where: { id: datasetId } });
      }
      return { ...dataset, frozenAt, contentHash };
    }, { isolationLevel: 'Serializable' });
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

  async prepareEvaluation(userId: string, agentId: string, dto: RunEvaluationDto) {
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
      Boolean(dto.agentVersionId),
    );
    const dataset = await this.requireDataset(workspace.id, dto.datasetId, {
      cases: { where: { enabled: true }, orderBy: { createdAt: 'asc' } },
    });
    if (dataset.cases.length === 0) {
      throw new BadRequestException('Dataset 至少需要一个启用的 case 才能运行评测');
    }
    const repeatCount = dto.repeatCount ?? 1;
    if (repeatCount >= 3 && (!dataset.frozenAt || !dataset.contentHash)) {
      throw new BadRequestException('3–5 次发布证据评测要求先冻结 Dataset 并生成内容指纹');
    }
    if (repeatCount >= 3) {
      const coverage = buildStratifiedEvaluationEvidence(dataset.cases.map((item: any) => ({
        caseKey: item.key,
        score: 0,
        passed: true,
        metadata: item.metadata,
      })));
      if (coverage.status === 'unavailable') {
        throw new BadRequestException(`发布 Dataset 分层证据不足：${coverage.reasons.join('；')}`);
      }
      const governanceReasons = this.datasetGovernanceReasons(dataset.cases);
      if (governanceReasons.length > 0) {
        throw new BadRequestException(`发布 Dataset 治理证据不足：${governanceReasons.join('；')}`);
      }
      if (this.datasetReviewStatus(dataset) !== 'APPROVED') {
        throw new BadRequestException('3–5 次发布证据评测要求管理员先审查并批准 Dataset');
      }
      if (typeof dto.maxEstimatedCostCny !== 'number') {
        throw new BadRequestException('3–5 次发布证据评测必须提供 maxEstimatedCostCny 成本停止阈值');
      }
    }
    const evaluator = await this.requireEvaluator(workspace.id, dto.evaluatorId);
    const effectiveBudgetCny = repeatCount >= 3
      ? Math.min(dto.maxEstimatedCostCny!, this.releaseBudgetCeilingCny())
      : null;
    const assetHash = this.datasetContentHash(dataset.version, {
      cases: dataset.cases, evaluator: { type: evaluator.type, config: evaluator.config },
      version: { systemPrompt: version.systemPrompt, modelConfig: version.modelConfig,
        runtimeConfig: version.runtimeConfig, toolBindings: version.toolBindings,
        knowledgeBindings: version.knowledgeBindings, memoryBindings: version.memoryBindings,
        inputSchema: version.inputSchema, outputSchema: version.outputSchema },
    });
    return { workspace, agent, version, dataset, evaluator, repeatCount, effectiveBudgetCny, assetHash };
  }

  async runEvaluation(userId: string, agentId: string, dto: RunEvaluationDto, job?: EvaluationJobExecution) {
    const prepared = await this.prepareEvaluation(userId, agentId, dto);
    if (job && job.assetHash !== prepared.assetHash) throw new ConflictException('评测资产已变化，请明确创建新任务');
    const { workspace, agent, version, dataset, evaluator, repeatCount, effectiveBudgetCny } = prepared;
    const startedAt = job?.startedAt ?? new Date();
    let spentCostCny = 0;
    let completedSamples = 0;
    let completedCases = 0;
    let interruptedRunId: string | null = null;
    let costEvidenceUnavailable = false;
    const evaluation = job ? { id: job.id } : await this.prisma.agentEvaluationRun.create({
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

    const progress = () => job?.progress({ completedSamples, completedCases,
      spentCny: Number(spentCostCny.toFixed(6)), limitCny: effectiveBudgetCny,
      costEvidenceStatus: costEvidenceUnavailable ? 'unavailable' : 'available' });
    const finish = (data: Record<string, any>) => job
      ? job.finish({ ...data, completedSamples, completedCases })
      : this.prisma.agentEvaluationRun.update({ where: { id: evaluation.id }, data });

    try {
      const caseResults: Array<{
        caseKey: string;
        score: number;
        passed: boolean;
        passRate: number;
        metadata: unknown;
      }> = [];
      const allRuns: any[] = [];
      for (const datasetCase of dataset.cases) {
        const samples: Array<{ rule: RuleEvaluation; run?: any; error?: string }> = [];
        for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex += 1) {
          await progress();
          if (effectiveBudgetCny !== null && spentCostCny >= effectiveBudgetCny) {
            throw new ReleaseEvaluationBudgetError(
              `评测成本已达到停止阈值 ¥${effectiveBudgetCny.toFixed(2)}，已停止后续 Provider 调用`,
            );
          }
          try {
            const run = await this.runtime.runAgent(
              userId,
              agentId,
              {
                agentVersionId: version.id,
                application: 'agent-lab-evaluation',
                externalRunId: `evaluation:${evaluation.id}:${datasetCase.id}:${repeatIndex + 1}`,
                input: datasetCase.input as Record<string, unknown>,
              },
              { allowDraftVersion: true, bypassSemanticCache: true },
            );
            allRuns.push(run);
            completedSamples += 1;
            const validCost = typeof run.estimatedCost === 'number' && Number.isFinite(run.estimatedCost) && run.estimatedCost >= 0;
            if (validCost) spentCostCny += run.estimatedCost;
            else costEvidenceUnavailable = true;
            if (effectiveBudgetCny !== null) {
              if (!validCost) {
                interruptedRunId = run.id ?? null;
                costEvidenceUnavailable = true;
                throw new ReleaseEvaluationBudgetError('评测费率证据不可用，已停止后续 Provider 调用');
              }
              if (spentCostCny > effectiveBudgetCny) {
                throw new ReleaseEvaluationBudgetError(
                  `评测成本超过停止阈值 ¥${effectiveBudgetCny.toFixed(2)}，已停止后续 Provider 调用`,
                );
              }
            }
            samples.push({ rule: this.evaluateRule(evaluator, datasetCase, run), run });
            await progress();
          } catch (error: any) {
            if (error instanceof ReleaseEvaluationBudgetError || error instanceof EvaluationCancellationError) throw error;
            if (effectiveBudgetCny !== null) {
              interruptedRunId = error?.agentLabRunId ?? null;
              costEvidenceUnavailable = true;
              // A failed runtime can already have incurred Provider charges.
              // Without complete usage evidence, continuing cannot enforce the budget.
              throw new ReleaseEvaluationBudgetError('发布评测样本失败，费用无法完整核验，已停止后续 Provider 调用');
            }
            const message = error?.message || '运行或规则评测失败';
            costEvidenceUnavailable = true;
            samples.push({
              rule: {
                score: 0,
                passed: false,
                metrics: {},
                evidence: { error: message, runId: error?.agentLabRunId ?? null },
                failureCategory: 'RUN_FAILED',
                failureMessage: message,
              },
              error: message,
              run: error?.agentLabRunId ? { id: error.agentLabRunId } : undefined,
            });
          }
        }
        const score = samples.reduce((sum, item) => sum + item.rule.score, 0) / samples.length;
        const passed = samples.every((item) => item.rule.passed);
        const failed = samples.find((item) => !item.rule.passed);
        const runIds = samples.map((item) => item.run?.id).filter(Boolean);
        const latencies = samples
          .map((item) => item.run?.latencyMs)
          .filter((value): value is number => typeof value === 'number');
        await this.prisma.evaluationResult.create({
          data: {
            evaluationRunId: evaluation.id,
            datasetCaseId: datasetCase.id,
            runId: runIds[0],
            status: samples.some((item) => item.error) ? 'FAILED' : 'COMPLETED',
            score,
            passed,
            metrics: {
              repeatCount,
              latency: latencies.length === samples.length
                ? { p95Ms: this.percentile(latencies, 0.95) }
                : { status: 'unavailable' },
              samples: samples.map((item) => item.rule.metrics),
            } as any,
            evidence: {
              runIds,
              samples: samples.map((item) => item.rule.evidence),
            } as any,
            outputSummary: this.summarizeOutput(samples.map((item) => item.run?.output ?? null)),
            failureCategory: failed?.rule.failureCategory,
            failureMessage: failed?.rule.failureMessage,
          },
        });
        completedCases += 1;
        await progress();
        caseResults.push({
          caseKey: datasetCase.key,
          score,
          passed,
          passRate: samples.filter((item) => item.rule.passed).length / samples.length,
          metadata: datasetCase.metadata,
        });
      }

      const passedCases = caseResults.filter((item) => item.passed).length;
      const score = caseResults.reduce((sum, item) => sum + item.score, 0) / caseResults.length;
      const completedAt = new Date();
      return finish({
          status: 'COMPLETED',
          score,
          passedCases,
          failedCases: caseResults.length - passedCases,
          completedAt,
          metrics: {
            evaluatorType: evaluator.type,
            outputContractVersion: 'final-output/v1',
            cachePolicy: 'semantic-cache-bypass/v1',
            datasetContentHash: dataset.contentHash ?? null,
            datasetFrozenAt: dataset.frozenAt ?? null,
            repeatCount,
            totalSamples: dataset.cases.length * repeatCount,
            totalCases: caseResults.length,
            passedCases,
            failedCases: caseResults.length - passedCases,
            averageScore: score,
            wallClockLatencyMs: completedAt.getTime() - startedAt.getTime(),
            budget: effectiveBudgetCny === null
              ? { status: 'not-required', spentCny: Number(spentCostCny.toFixed(6)), costEvidenceStatus: costEvidenceUnavailable ? 'unavailable' : 'available' }
              : {
                  status: 'within-limit',
                  limitCny: effectiveBudgetCny,
                  spentCny: Number(spentCostCny.toFixed(6)),
                  completedSamples,
                },
            stratification: buildStratifiedEvaluationEvidence(caseResults),
            ...this.aggregateRunEvidence(allRuns),
            ...(costEvidenceUnavailable ? { estimatedCost: { status: 'unavailable' } } : {}),
          },
      });
    } catch (error: any) {
      const message = error?.message || '评测执行失败';
      await finish({
          status: error instanceof EvaluationCancellationError ? 'CANCELLED' : 'FAILED',
          error: message,
          metrics: {
                repeatCount,
                totalSamples: dataset.cases.length * repeatCount,
                budget: {
                  status: error instanceof EvaluationCancellationError ? 'cancelled' : error instanceof ReleaseEvaluationBudgetError ? 'stopped' : 'failed',
                  limitCny: effectiveBudgetCny,
                  spentCny: Number(spentCostCny.toFixed(6)),
                  completedSamples,
                  costEvidenceStatus: costEvidenceUnavailable ? 'unavailable' : 'available',
                  ...(costEvidenceUnavailable ? {
                    costEvidenceStatus: 'unavailable',
                    interruptedRunId,
                  } : {}),
                },
              },
          completedAt: new Date(),
      });
      throw error;
    }
  }

  async listEvaluations(userId: string, agentId: string) {
    const workspace = await this.getOrCreateDefaultWorkspace(userId);
    await this.requireAgent(workspace.id, agentId);
    return this.prisma.agentEvaluationRun.findMany({
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
    const evaluation = await this.prisma.agentEvaluationRun.findFirst({
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
      const finalOutput = Object.hasOwn(run.output ?? {}, 'response') ? run.output.response : run.output;
      const output = (typeof finalOutput === 'string' ? finalOutput : JSON.stringify(finalOutput ?? {})).toLowerCase();
      const matched = keywords.filter((keyword) => output.includes(keyword.toLowerCase()));
      const score = keywords.length === 0 ? 0 : (matched.length / keywords.length) * 100;
      const minScore = this.numberConfig(config.minScore, 100);
      const passed = keywords.length > 0 && score >= minScore;
      return {
        score,
        passed,
        metrics: { expectedKeywords: keywords, matchedKeywords: matched, minScore },
        evidence: { output: finalOutput ?? null, outputPath: Object.hasOwn(run.output ?? {}, 'response') ? 'response' : '$' },
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
      const output = Array.isArray(run.output?.nodes) ? { response: run.output.response } : this.toRecord(run.output);
      const schema = expected.schema ?? config.schema;
      if (schema !== undefined) {
        try {
          assertSchema(schema, output);
          return { score: 100, passed: true, metrics: { schema, outputPath: '$final' }, evidence: { output } };
        } catch (error: any) {
          return { score: 0, passed: false, metrics: { schema, outputPath: '$final' }, evidence: { output }, failureCategory: 'JSON_SCHEMA_MISMATCH', failureMessage: error.message };
        }
      }
      const missingKeys = requiredKeys.filter((key) => !(key in output));
      const score = requiredKeys.length === 0 ? 0 : ((requiredKeys.length - missingKeys.length) / requiredKeys.length) * 100;
      return {
        score,
        passed: requiredKeys.length > 0 && missingKeys.length === 0,
        metrics: { requiredKeys, missingKeys },
        evidence: { output: run.output ?? null },
        ...(requiredKeys.length > 0 && missingKeys.length === 0
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
      throw new NotFoundException('Agent 没有可评测的版本');
    }
    const draftAllowed = allowDraftVersion
      && Boolean(requestedVersionId)
      && version.status === 'DRAFT';
    if (version.status !== 'PUBLISHED' && !draftAllowed) {
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

  private aggregateRunEvidence(runs: any[]) {
    const latencies = runs.map((run) => run.latencyMs)
      .filter((value): value is number => typeof value === 'number');
    const totalTokens = runs.map((run) => this.toRecord(run.tokenUsage).totalTokens);
    const costs = runs.map((run) => run.estimatedCost);
    return {
      latency: runs.length > 0 && latencies.length === runs.length
        ? {
            sampleCount: latencies.length,
            p50Ms: this.percentile(latencies, 0.5),
            p95Ms: this.percentile(latencies, 0.95),
            maxMs: Math.max(...latencies),
          }
        : { status: 'unavailable', sampleCount: latencies.length },
      tokenUsage: runs.length > 0 && totalTokens.length === runs.length
        && totalTokens.every((value) => typeof value === 'number')
        ? { status: 'available', totalTokens: (totalTokens as number[]).reduce((sum, value) => sum + value, 0) }
        : { status: 'unavailable' },
      estimatedCost: runs.length > 0 && costs.length === runs.length
        && costs.every((value) => typeof value === 'number')
        ? { status: 'available', totalCny: Number((costs as number[]).reduce((sum, value) => sum + value, 0).toFixed(6)) }
        : { status: 'unavailable' },
    };
  }

  private percentile(values: number[], percentile: number) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil(sorted.length * percentile) - 1)];
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${this.stableStringify(record[key])}`).join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
  }

  private datasetContentHash(version: string, cases: unknown) {
    return `sha256:${createHash('sha256')
      .update(this.stableStringify({ version, cases }))
      .digest('hex')}`;
  }

  private datasetReviewStatus(dataset: any) {
    return this.toRecord(this.toRecord(dataset?.metadata).review).status;
  }

  private datasetGovernanceReasons(cases: any[]) {
    const reasons: string[] = [];
    for (const item of cases) {
      const provenance = this.toRecord(this.toRecord(item.metadata).provenance);
      if (typeof provenance.sourceType !== 'string' || provenance.sourceType.length === 0) {
        reasons.push(`Case ${item.key} 缺少 sourceType`);
      }
      if (typeof provenance.owner !== 'string' || provenance.owner.length === 0) {
        reasons.push(`Case ${item.key} 缺少 owner`);
      }
      if (provenance.allowedUse !== 'agent-release-evaluation') {
        reasons.push(`Case ${item.key} 未授权用于发布评测`);
      }
      if (provenance.containsPersonalData !== false) {
        reasons.push(`Case ${item.key} 未明确证明不含个人数据`);
      }
      if (provenance.containsCandidateData === true
        && (provenance.deidentified !== true || typeof provenance.consentBasis !== 'string')) {
        reasons.push(`Case ${item.key} 的候选人数据缺少脱敏或同意依据`);
      }
    }
    return [...new Set(reasons)];
  }

  private releaseBudgetCeilingCny() {
    const configured = Number(process.env.AGENT_LAB_MAX_EVALUATION_COST_CNY);
    return Number.isFinite(configured) && configured >= 0.01
      ? configured
      : DEFAULT_RELEASE_EVALUATION_BUDGET_CNY;
  }

  private summarizeOutput(value: unknown): string {
    const serialized = JSON.stringify(value ?? null);
    return serialized.length > 2_000 ? `${serialized.slice(0, 2_000)}...` : serialized;
  }
}
