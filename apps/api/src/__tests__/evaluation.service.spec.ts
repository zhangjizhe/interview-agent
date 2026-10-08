import { EvaluationService } from '../modules/interview/services/evaluation.service';

describe('EvaluationService', () => {
  const prisma = {
    interviewAnswer: { findMany: jest.fn() },
    evaluationDefinition: { upsert: jest.fn() },
    evaluationRun: {
      upsert: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    report: { findFirst: jest.fn(), findUniqueOrThrow: jest.fn() },
    $transaction: jest.fn(),
  };
  const config = { get: jest.fn().mockReturnValue('qwen-plus') };
  const skillStateAggregation = { aggregateFinalRun: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.interviewAnswer.findMany.mockResolvedValue([{ id: 'answer-1', revision: 1 }]);
    prisma.evaluationDefinition.upsert.mockResolvedValue({
      id: 'definition-1',
      version: 'evaluation-definition-123',
    });
    prisma.evaluationRun.upsert.mockResolvedValue({
      id: 'run-1',
      status: 'PENDING',
    });
    prisma.evaluationRun.update.mockResolvedValue({
      id: 'run-1',
      status: 'RUNNING',
    });
  });

  it('uses an immutable definition version in the final-run idempotency key', async () => {
    const service = new EvaluationService(prisma as any, config as any, skillStateAggregation as any);

    await service.beginFinalEvaluation('interview-1');

    expect(prisma.evaluationDefinition.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { definitionHash: expect.any(String) },
      create: expect.objectContaining({
        evaluatorVersion: 'interview-report-evaluator-v1',
        promptVersion: 'interview-report-prompt-v1',
        modelVersion: 'qwen-plus',
        evaluationMode: 'FINAL',
      }),
    }));
    expect(prisma.evaluationRun.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        interviewId: 'interview-1',
        definitionId: 'definition-1',
        mode: 'FINAL',
        idempotencyKey: expect.any(String),
      }),
    }));
  });

  it('does not restart a successful idempotent run', async () => {
    prisma.evaluationRun.upsert.mockResolvedValueOnce({
      id: 'run-complete',
      status: 'SUCCEEDED',
    });
    const service = new EvaluationService(prisma as any, config as any, skillStateAggregation as any);

    const result = await service.beginFinalEvaluation('interview-1');

    expect(result.existing).toBe(true);
    expect(prisma.evaluationRun.update).not.toHaveBeenCalled();
  });

  it('persists a failed final run instead of manufacturing a zero-score report', async () => {
    const service = new EvaluationService(prisma as any, config as any, skillStateAggregation as any);

    await service.failFinalEvaluation('run-1', new Error('provider unavailable'));

    expect(prisma.evaluationRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({
        status: 'FAILED',
        error: 'provider unavailable',
        completedAt: expect.any(Date),
      }),
    });
    expect(prisma.report.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('creates a replacement definition and run when the gateway returns another model', async () => {
    const service = new EvaluationService(prisma as any, config as any, skillStateAggregation as any);
    const run = {
      id: 'run-primary',
      interviewId: 'interview-1',
      inputRevision: 'revision-1',
      mode: 'FINAL',
      definition: { modelVersion: 'qwen-plus' },
    };
    prisma.evaluationDefinition.upsert.mockResolvedValueOnce({
      id: 'definition-fallback',
      version: 'evaluation-definition-fallback',
    });
    prisma.evaluationRun.upsert.mockResolvedValueOnce({
      id: 'run-fallback',
      status: 'SUCCEEDED',
    });
    prisma.evaluationRun.findUnique.mockResolvedValueOnce({
      id: 'run-fallback',
      mode: 'FINAL',
      status: 'SUCCEEDED',
    });
    prisma.evaluationRun.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'run-fallback',
      mode: 'FINAL',
      status: 'SUCCEEDED',
    });
    prisma.report.findFirst.mockResolvedValueOnce({ id: 'report-1' });

    const result = await (service as any).moveToActualModelRun(
      run,
      { overallScore: 80, scores: {}, strengths: [], weaknesses: [], suggestions: [] },
      'deepseek-chat',
    );

    expect(prisma.evaluationDefinition.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ modelProvider: 'deepseek', modelVersion: 'deepseek-chat' }),
    }));
    expect(prisma.evaluationRun.update).toHaveBeenCalledWith({
      where: { id: 'run-primary' },
      data: expect.objectContaining({ status: 'SUPERSEDED' }),
    });
    expect(result).toEqual({ id: 'report-1' });
  });

  it('aggregates skill state inside the successful FINAL evaluation transaction', async () => {
    const tx = {
      assessmentEvidence: { upsert: jest.fn().mockResolvedValue({}) },
      evaluationRun: { update: jest.fn().mockResolvedValue({}) },
      report: { upsert: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementationOnce(async (callback: any) => callback(tx));
    prisma.evaluationRun.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'run-1',
      interviewId: 'interview-1',
      mode: 'FINAL',
      status: 'RUNNING',
      interview: { userId: 'user-a', targetJobId: 'job-a' },
      definition: { version: 'definition-v1', modelVersion: 'qwen-plus' },
    });
    prisma.interviewAnswer.findMany.mockResolvedValueOnce([{
      id: 'answer-1',
      interviewId: 'interview-1',
      questionId: 'question-1',
      content: '我会解释检索、重排和引用。',
      question: { skillId: 'skill-rag', expectedEvidence: ['检索', '重排', '引用'] },
      answerHistories: [{
        score: 0.8,
        completeness: 0.8,
        correctness: 0.8,
        depth: 0.8,
        feedback: '覆盖了检索与引用。',
        llmEvaluated: true,
      }],
    }]);
    prisma.report.findUniqueOrThrow.mockResolvedValueOnce({ id: 'report-1' });
    const service = new EvaluationService(prisma as any, config as any, skillStateAggregation as any);

    await service.completeFinalEvaluation('run-1', {
      overallScore: 80,
      scores: { technical: 80 },
      strengths: ['结构清晰'],
      weaknesses: [],
      suggestions: ['继续练习'],
    });

    expect(tx.evaluationRun.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SUCCEEDED' }),
    }));
    expect(skillStateAggregation.aggregateFinalRun).toHaveBeenCalledWith(tx, {
      id: 'run-1',
      interviewId: 'interview-1',
      interview: { userId: 'user-a', targetJobId: 'job-a' },
    });
    expect(tx.report.upsert).toHaveBeenCalled();
    expect(tx.assessmentEvidence.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ skillId: 'skill-rag', questionId: 'question-1', answerId: 'answer-1' }) }));
  });
});
