import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma/prisma.service';

const TRAINING_POLICY_VERSION = 'evidence-gap-v1';
const WEAK_SKILL_SCORE_THRESHOLD = 70;

@Injectable()
export class TrainingService {
  constructor(private prisma: PrismaService) {}

  async refresh(userId: string, targetJobId: string) {
    const job = await this.prisma.targetJob.findFirst({
      where: { id: targetJobId, userId },
      include: {
        candidateSkillStates: {
          where: { sourceRun: { mode: 'FINAL', status: 'SUCCEEDED' } },
          include: { skill: true, sourceRun: true },
          orderBy: { score: 'asc' },
        },
      },
    });
    if (!job) throw new NotFoundException('Target job not found');

    const recommendations = [];
    for (const state of job.candidateSkillStates.slice(0, 3)) {
      if (!state.sourceRunId || state.score >= WEAK_SKILL_SCORE_THRESHOLD) continue;
      const evidence = await this.prisma.assessmentEvidence.findMany({
        where: {
          evaluationRunId: state.sourceRunId,
          skillId: state.skillId,
          score: { not: null },
        },
        select: { id: true, expectedEvidence: true, missingEvidence: true },
      });
      if (evidence.length === 0) continue;
      const expectedEvidence = evidence.flatMap((item) =>
        Array.isArray(item.expectedEvidence) ? item.expectedEvidence : [],
      );
      const recommendation = await this.prisma.trainingRecommendation.upsert({
        where: {
          userId_targetJobId_skillId_sourceRunId: {
            userId,
            targetJobId,
            skillId: state.skillId,
            sourceRunId: state.sourceRunId,
          },
        },
        create: {
          userId,
          targetJobId,
          targetJobProfileVersion: job.profileVersion,
          skillId: state.skillId,
          sourceRunId: state.sourceRunId,
          sourceEvidenceId: evidence[0].id,
          evidenceIds: evidence.map((item) => item.id),
          objective: `用一次结构化回答证明 ${state.skill.name} 的关键决策能力（${TRAINING_POLICY_VERSION}）。`,
          prompts: [
            '说明你的方案、约束和取舍。',
            '给出一个风险场景，以及你的验证方式。',
            '说明如何用指标判断方案是否有效。',
          ],
          expectedEvidence,
        },
        update: {},
        include: { skill: { select: { id: true, name: true, slug: true } } },
      });
      recommendations.push(recommendation);
    }
    return recommendations;
  }

  async list(userId: string, targetJobId?: string) {
    return this.prisma.trainingRecommendation.findMany({
      where: { userId, ...(targetJobId ? { targetJobId } : {}) },
      include: {
        skill: { select: { id: true, name: true, slug: true } },
        targetJob: { select: { id: true, title: true, level: true, profileVersion: true } },
        sourceEvidence: { select: { reason: true, missingEvidence: true, recommendation: true } },
        attempts: { orderBy: { completedAt: 'desc' } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async complete(userId: string, recommendationId: string) {
    const recommendation = await this.prisma.trainingRecommendation.findFirst({
      where: { id: recommendationId, userId },
      include: { attempts: { orderBy: { completedAt: 'desc' }, take: 1 } },
    });
    if (!recommendation) throw new NotFoundException('Training recommendation not found');
    if (recommendation.status !== 'READY') {
      return recommendation.attempts[0] || null;
    }
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.trainingRecommendation.updateMany({ where: { id: recommendationId, userId, status: 'READY' }, data: { status: 'COMPLETED' } });
      if (claimed.count !== 1) return tx.trainingAttempt.findFirst({ where: { recommendationId, userId }, orderBy: { completedAt: 'desc' } });
      const attempt = await tx.trainingAttempt.create({
        data: { recommendationId, userId },
      });
      return attempt;
    });
  }

  async attachRetest(userId: string, recommendationId: string, interviewId: string, targetJobId: string, skillId: string) {
    const recommendation = await this.prisma.trainingRecommendation.findFirst({
      where: { id: recommendationId, userId, targetJobId, skillId, status: 'COMPLETED' },
      include: {
        targetJob: { select: { profileVersion: true, isActive: true } },
        attempts: { where: { retestInterviewId: null }, orderBy: { completedAt: 'desc' }, take: 1 },
      },
    });
    if (!recommendation) throw new NotFoundException('Completed training recommendation not found');
    if (
      !recommendation.targetJob.isActive
      || recommendation.targetJob.profileVersion !== recommendation.targetJobProfileVersion
    ) {
      throw new BadRequestException('Target job changed; refresh training recommendations before retest');
    }
    const attempt = recommendation.attempts[0];
    if (!attempt) throw new BadRequestException('Training completion is required before retest');
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.trainingRecommendation.updateMany({
        where: { id: recommendationId, userId, status: 'COMPLETED', targetJob: { isActive: true, profileVersion: recommendation.targetJobProfileVersion } },
        data: { status: 'RETEST_STARTED' },
      });
      if (claim.count !== 1) throw new ConflictException('Training retest already started or target job changed');
      const attached = await tx.trainingAttempt.updateMany({
        where: { id: attempt.id, userId, retestInterviewId: null },
        data: { retestInterviewId: interviewId },
      });
      if (attached.count !== 1) throw new ConflictException('Training attempt already attached');
      return tx.trainingRecommendation.findFirst({ where: { id: recommendationId, userId } });
    });
  }
}
