import { Injectable } from '@nestjs/common';
import { EvaluationMode, EvaluationRunStatus, Prisma } from '@prisma/client';

interface FinalRunContext {
  id: string;
  interviewId: string;
  interview: {
    userId: string;
    targetJobId: string | null;
  };
}

interface EvidenceScore {
  evaluationRunId: string;
  score: number | null;
  confidence: number;
}

@Injectable()
export class SkillStateAggregationService {
  async aggregateFinalRun(tx: Prisma.TransactionClient, run: FinalRunContext): Promise<void> {
    const targetJobId = run.interview.targetJobId;
    if (!targetJobId) return;

    const currentEvidence = await tx.assessmentEvidence.findMany({
      where: {
        evaluationRunId: run.id,
        skillId: { not: null },
        score: { not: null },
      },
      select: { skillId: true },
      distinct: ['skillId'],
    });

    for (const evidence of currentEvidence) {
      const skillId = evidence.skillId;
      if (!skillId) continue;

      const evidenceHistory = await tx.assessmentEvidence.findMany({
        where: {
          skillId,
          score: { not: null },
          evaluationRun: {
            mode: EvaluationMode.FINAL,
            status: EvaluationRunStatus.SUCCEEDED,
            interview: {
              userId: run.interview.userId,
              targetJobId,
            },
          },
        },
        select: {
          evaluationRunId: true,
          score: true,
          confidence: true,
        },
      });
      const normalizedEvidence = evidenceHistory
        .filter((item): item is EvidenceScore & { score: number } => item.score !== null)
        .map((item) => ({
          ...item,
          score: this.normalizeScore(item.score),
          confidence: this.normalizeConfidence(item.confidence),
        }));
      if (normalizedEvidence.length === 0) continue;

      const currentRunEvidence = normalizedEvidence.filter(
        (item) => item.evaluationRunId === run.id,
      );
      if (currentRunEvidence.length === 0) continue;

      const priorState = await tx.candidateSkillState.findUnique({
        where: {
          userId_targetJobId_skillId: {
            userId: run.interview.userId,
            targetJobId,
            skillId,
          },
        },
      });
      const score = this.weightedScore(normalizedEvidence);
      const currentRunScore = this.weightedScore(currentRunEvidence);
      const trend = priorState?.sourceRunId === run.id
        ? priorState.trend
        : priorState
          ? Math.round((currentRunScore - priorState.score) * 100) / 100
          : null;
      const confidence = Math.min(
        1,
        this.average(normalizedEvidence.map((item) => item.confidence))
          * Math.min(1, normalizedEvidence.length / 3),
      );

      await tx.candidateSkillState.upsert({
        where: {
          userId_targetJobId_skillId: {
            userId: run.interview.userId,
            targetJobId,
            skillId,
          },
        },
        create: {
          userId: run.interview.userId,
          targetJobId,
          skillId,
          score,
          confidence,
          trend,
          evidenceCount: normalizedEvidence.length,
          lastAssessedAt: new Date(),
          sourceRunId: run.id,
        },
        update: {
          score,
          confidence,
          trend,
          evidenceCount: normalizedEvidence.length,
          lastAssessedAt: new Date(),
          sourceRunId: run.id,
        },
      });
    }
  }

  private normalizeScore(score: number): number {
    const normalized = score <= 1 ? score * 100 : score;
    return Math.max(0, Math.min(100, normalized));
  }

  private normalizeConfidence(confidence: number): number {
    return Math.max(0, Math.min(1, confidence));
  }

  private weightedScore(evidence: Array<{ score: number; confidence: number }>): number {
    const totalWeight = evidence.reduce((sum, item) => sum + Math.max(item.confidence, 0.1), 0);
    const weighted = evidence.reduce(
      (sum, item) => sum + item.score * Math.max(item.confidence, 0.1),
      0,
    );
    return Math.round((weighted / totalWeight) * 100) / 100;
  }

  private average(values: number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
}
