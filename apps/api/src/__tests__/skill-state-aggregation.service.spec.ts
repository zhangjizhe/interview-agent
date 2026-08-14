import { SkillStateAggregationService } from '../modules/interview/services/skill-state-aggregation.service';

describe('SkillStateAggregationService', () => {
  const tx = {
    assessmentEvidence: { findMany: jest.fn() },
    candidateSkillState: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const run = {
    id: 'run-current',
    interviewId: 'interview-current',
    interview: { userId: 'user-a', targetJobId: 'job-a' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tx.candidateSkillState.findUnique.mockResolvedValue(null);
    tx.candidateSkillState.upsert.mockResolvedValue({});
  });

  it('aggregates only successful FINAL evidence for the same user, job and skill', async () => {
    tx.assessmentEvidence.findMany
      .mockResolvedValueOnce([{ skillId: 'skill-rag' }])
      .mockResolvedValueOnce([
        { evaluationRunId: 'run-older', score: 0.6, confidence: 0.8 },
        { evaluationRunId: 'run-current', score: 80, confidence: 0.9 },
      ]);
    const service = new SkillStateAggregationService();

    await service.aggregateFinalRun(tx as any, run);

    expect(tx.assessmentEvidence.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        evaluationRun: expect.objectContaining({
          mode: 'FINAL',
          status: 'SUCCEEDED',
          interview: { userId: 'user-a', targetJobId: 'job-a' },
        }),
      }),
    }));
    expect(tx.candidateSkillState.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        userId: 'user-a',
        targetJobId: 'job-a',
        skillId: 'skill-rag',
        evidenceCount: 2,
        sourceRunId: 'run-current',
      }),
    }));
  });

  it('does not create a state without a target job or scored skill evidence', async () => {
    const service = new SkillStateAggregationService();

    await service.aggregateFinalRun(tx as any, {
      ...run,
      interview: { userId: 'user-a', targetJobId: null },
    });
    expect(tx.assessmentEvidence.findMany).not.toHaveBeenCalled();

    tx.assessmentEvidence.findMany.mockResolvedValueOnce([]);
    await service.aggregateFinalRun(tx as any, run);
    expect(tx.candidateSkillState.upsert).not.toHaveBeenCalled();
  });

  it('preserves the existing trend on an idempotent retry of the same run', async () => {
    tx.assessmentEvidence.findMany
      .mockResolvedValueOnce([{ skillId: 'skill-rag' }])
      .mockResolvedValueOnce([
        { evaluationRunId: 'run-current', score: 0.75, confidence: 0.8 },
      ]);
    tx.candidateSkillState.findUnique.mockResolvedValueOnce({
      score: 75,
      trend: 12,
      sourceRunId: 'run-current',
    });
    const service = new SkillStateAggregationService();

    await service.aggregateFinalRun(tx as any, run);

    expect(tx.candidateSkillState.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ trend: 12, evidenceCount: 1 }),
    }));
  });
});
