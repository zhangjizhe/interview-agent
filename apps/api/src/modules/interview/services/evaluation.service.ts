import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { EvaluationMode } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { SkillStateAggregationService } from './skill-state-aggregation.service';

export interface FinalReportPayload {
  overallScore: number;
  scores: Record<string, number>;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
}

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private skillStateAggregation: SkillStateAggregationService,
  ) {}

  async beginFinalEvaluation(interviewId: string) {
    const answers = await this.prisma.interviewAnswer.findMany({
      where: { interviewId },
      include: {
        question: true,
        answerHistories: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (answers.length === 0) {
      throw new Error('没有可用于最终评价的规范化回答记录');
    }

    const definition = await this.getFinalDefinition();
    const inputRevision = this.hash(
      answers.map((answer) => `${answer.id}:${answer.revision}`).join('|'),
    );
    const idempotencyKey = this.hash(
      `${interviewId}|${inputRevision}|${definition.version}|FINAL`,
    );

    const run = await this.prisma.evaluationRun.upsert({
      where: { idempotencyKey },
      create: {
        interviewId,
        definitionId: definition.id,
        inputRevision,
        mode: 'FINAL',
        status: 'PENDING',
        idempotencyKey,
      },
      update: {},
    });

    if (run.status === 'SUCCEEDED' || run.status === 'DEGRADED') {
      return { run, answers, existing: true };
    }

    const started = await this.prisma.evaluationRun.update({
      where: { id: run.id },
      data: { status: 'RUNNING', error: null, degradedReason: null },
    });
    return { run: started, answers, existing: false };
  }

  async completeFinalEvaluation(
    runId: string,
    report: FinalReportPayload,
    actualModel?: string,
  ) {
    const run = await this.prisma.evaluationRun.findUniqueOrThrow({
      where: { id: runId },
      include: {
        interview: true,
        definition: true,
        assessmentEvidence: true,
        _count: { select: { assessmentEvidence: true } },
      },
    });
    if (run.mode !== 'FINAL') {
      throw new Error('只有 FINAL 运行可以写入正式报告');
    }
    if (run.status === 'SUCCEEDED' || run.status === 'DEGRADED') {
      return this.prisma.report.findFirst({ where: { currentEvaluationRunId: run.id } });
    }
    if (actualModel && actualModel !== run.definition.modelVersion) {
      return this.moveToActualModelRun(run, report, actualModel);
    }

    const answers = await this.prisma.interviewAnswer.findMany({
      where: { interviewId: run.interviewId },
      include: {
        question: true,
        answerHistories: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'asc' },
    });
    const reportPayload = {
      ...report,
      evaluationRunId: run.id,
      definitionVersion: run.definition.version,
      inputRevision: run.inputRevision,
    };

    await this.prisma.$transaction(async (tx) => {
      for (const answer of answers) {
        const legacy = answer.answerHistories[0];
        await tx.assessmentEvidence.upsert({
          where: {
            evaluationRunId_answerId: {
              evaluationRunId: run.id,
              answerId: answer.id,
            },
          },
          create: {
            evaluationRunId: run.id,
            interviewId: run.interviewId,
            questionId: answer.questionId,
            answerId: answer.id,
            answerExcerpt: answer.content.slice(0, 1200),
            expectedEvidence: answer.question.expectedEvidence ?? undefined,
            observedEvidence: legacy?.feedback
              ? { feedback: legacy.feedback }
              : undefined,
            dimensions: legacy
              ? {
                  completeness: legacy.completeness,
                  correctness: legacy.correctness,
                  depth: legacy.depth,
                }
              : undefined,
            score: legacy?.score ?? null,
            reason: legacy?.feedback ?? null,
            confidence: legacy?.llmEvaluated ? 0.5 : 0.3,
          },
          update: {},
        });
      }

      await tx.evaluationRun.update({
        where: { id: run.id },
        data: {
          status: 'SUCCEEDED',
          reportPayload: reportPayload as any,
          completedAt: new Date(),
        },
      });

      await this.skillStateAggregation.aggregateFinalRun(tx, {
        id: run.id,
        interviewId: run.interviewId,
        interview: {
          userId: run.interview.userId,
          targetJobId: run.interview.targetJobId,
        },
      });

      // Report 是当前展示快照，不承载不可变历史。切换到此已成功 FINAL 运行是显式动作。
      await tx.report.upsert({
        where: { interviewId: run.interviewId },
        create: {
          interviewId: run.interviewId,
          currentEvaluationRunId: run.id,
          overallScore: report.overallScore,
          scores: report.scores as any,
          strengths: report.strengths.join('\n'),
          weaknesses: report.weaknesses.join('\n'),
          suggestions: report.suggestions.join('\n'),
        },
        update: {
          currentEvaluationRunId: run.id,
          overallScore: report.overallScore,
          scores: report.scores as any,
          strengths: report.strengths.join('\n'),
          weaknesses: report.weaknesses.join('\n'),
          suggestions: report.suggestions.join('\n'),
        },
      });
    });

    return this.prisma.report.findUniqueOrThrow({
      where: { interviewId: run.interviewId },
    });
  }

  async failFinalEvaluation(runId: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`Final evaluation ${runId} failed: ${message}`);
    await this.prisma.evaluationRun.update({
      where: { id: runId },
      data: { status: 'FAILED', error: message, completedAt: new Date() },
    });
  }

  private async getFinalDefinition() {
    const modelVersion = this.config.get<string>('qwen.model') || 'qwen-plus';
    return this.getOrCreateDefinition('qwen', modelVersion);
  }

  private async moveToActualModelRun(
    run: {
      id: string;
      interviewId: string;
      inputRevision: string;
      mode: EvaluationMode;
      definition: { modelVersion: string };
    },
    report: FinalReportPayload,
    actualModel: string,
  ) {
    const provider = actualModel.toLowerCase().includes('deepseek') ? 'deepseek' : 'qwen';
    const definition = await this.getOrCreateDefinition(provider, actualModel);
    const idempotencyKey = this.hash(
      `${run.interviewId}|${run.inputRevision}|${definition.version}|FINAL`,
    );
    const replacement = await this.prisma.evaluationRun.upsert({
      where: { idempotencyKey },
      create: {
        interviewId: run.interviewId,
        definitionId: definition.id,
        inputRevision: run.inputRevision,
        mode: 'FINAL',
        status: 'RUNNING',
        idempotencyKey,
        supersedesId: run.id,
      },
      update: {},
    });
    await this.prisma.evaluationRun.update({
      where: { id: run.id },
      data: { status: 'SUPERSEDED', completedAt: new Date() },
    });
    return this.completeFinalEvaluation(replacement.id, report, actualModel);
  }

  private async getOrCreateDefinition(modelProvider: string, modelVersion: string) {
    const definition = {
      evaluatorVersion: 'interview-report-evaluator-v1',
      promptVersion: 'interview-report-prompt-v1',
      rubricVersion: 'interview-rubric-v1',
      modelProvider,
      modelVersion,
      modelParameters: { temperature: 0.3 },
      evaluationMode: 'FINAL' as const,
      fallbackPolicyVersion: 'gateway-fallback-v1',
    };
    const definitionHash = this.hash(JSON.stringify(definition));
    return this.prisma.evaluationDefinition.upsert({
      where: { definitionHash },
      create: {
        ...definition,
        version: `evaluation-definition-${definitionHash.slice(0, 12)}`,
        definitionHash,
      },
      update: {},
    });
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
