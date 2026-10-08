import { NotFoundException } from '@nestjs/common';
import { TrainingService } from '../modules/interview/services/training.service';

describe('TrainingService', () => {
  const prisma = {
    targetJob: { findFirst: jest.fn() },
    assessmentEvidence: { findMany: jest.fn() },
    trainingRecommendation: { upsert: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    trainingAttempt: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findFirst: jest.fn() },
    candidateSkillState: { update: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
  });

  it('creates recommendations only from the current user final skill evidence', async () => {
    prisma.targetJob.findFirst.mockResolvedValue({
      id: 'job-a',
      profileVersion: 2,
      candidateSkillStates: [{
        skillId: 'skill-rag',
        score: 52,
        sourceRunId: 'run-final',
        skill: { name: 'RAG', slug: 'rag' },
        sourceRun: { id: 'run-final' },
      }],
    });
    prisma.assessmentEvidence.findMany.mockResolvedValue([
      { id: 'evidence-a', expectedEvidence: ['检索', '引用'], missingEvidence: ['重排'] },
    ]);
    prisma.trainingRecommendation.upsert.mockResolvedValue({ id: 'recommendation-a' });
    const service = new TrainingService(prisma as any);

    await service.refresh('user-a', 'job-a');

    expect(prisma.targetJob.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'job-a', userId: 'user-a' },
    }));
    expect(prisma.trainingRecommendation.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        userId: 'user-a',
        targetJobId: 'job-a',
        targetJobProfileVersion: 2,
        skillId: 'skill-rag',
        sourceRunId: 'run-final',
        sourceEvidenceId: 'evidence-a',
        evidenceIds: ['evidence-a'],
      }),
    }));
  });

  it('records completion without writing candidate skill state', async () => {
    prisma.trainingRecommendation.findFirst.mockResolvedValue({
      id: 'recommendation-a',
      userId: 'user-a',
      status: 'READY',
      attempts: [],
    });
    prisma.trainingAttempt.create.mockResolvedValue({ id: 'attempt-a' });
    const service = new TrainingService(prisma as any);

    await service.complete('user-a', 'recommendation-a');

    expect(prisma.trainingAttempt.create).toHaveBeenCalledWith({
      data: { recommendationId: 'recommendation-a', userId: 'user-a' },
    });
    expect(prisma.candidateSkillState.update).not.toHaveBeenCalled();
  });

  it('rejects completion of another user recommendation', async () => {
    prisma.trainingRecommendation.findFirst.mockResolvedValue(null);
    const service = new TrainingService(prisma as any);

    await expect(service.complete('user-b', 'recommendation-a')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('links a completed training attempt to a matching skill-practice retest', async () => {
    prisma.trainingRecommendation.findFirst.mockResolvedValue({
      id: 'recommendation-a',
      targetJobProfileVersion: 2,
      targetJob: { isActive: true, profileVersion: 2 },
      attempts: [{ id: 'attempt-a' }],
    });
    prisma.trainingAttempt.update.mockResolvedValue({});
    prisma.trainingRecommendation.update.mockResolvedValue({ id: 'recommendation-a', status: 'RETEST_STARTED' });
    const service = new TrainingService(prisma as any);

    await service.attachRetest('user-a', 'recommendation-a', 'interview-retest', 'job-a', 'skill-rag');

    expect(prisma.trainingAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: 'attempt-a', userId: 'user-a', retestInterviewId: null },
      data: { retestInterviewId: 'interview-retest' },
    });
    expect(prisma.candidateSkillState.update).not.toHaveBeenCalled();
  });

  it('does not recommend a skill that meets the evidence-based score threshold', async () => {
    prisma.targetJob.findFirst.mockResolvedValue({
      id: 'job-a',
      profileVersion: 2,
      candidateSkillStates: [{
        skillId: 'skill-rag',
        score: 84,
        sourceRunId: 'run-final',
        skill: { name: 'RAG', slug: 'rag' },
        sourceRun: { id: 'run-final' },
      }],
    });
    const service = new TrainingService(prisma as any);

    await expect(service.refresh('user-a', 'job-a')).resolves.toEqual([]);
    expect(prisma.assessmentEvidence.findMany).not.toHaveBeenCalled();
    expect(prisma.trainingRecommendation.upsert).not.toHaveBeenCalled();
  });

  it('rejects a retest when the recommendation target-job version is stale', async () => {
    prisma.trainingRecommendation.findFirst.mockResolvedValue({
      id: 'recommendation-a',
      targetJobProfileVersion: 1,
      targetJob: { isActive: true, profileVersion: 2 },
      attempts: [{ id: 'attempt-a' }],
    });
    const service = new TrainingService(prisma as any);

    await expect(service.attachRetest(
      'user-a',
      'recommendation-a',
      'interview-a',
      'job-a',
      'skill-rag',
    )).rejects.toThrow('Target job changed');
    expect(prisma.trainingAttempt.update).not.toHaveBeenCalled();
  });
});
