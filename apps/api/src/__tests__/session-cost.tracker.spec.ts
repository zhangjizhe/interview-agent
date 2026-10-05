import { SessionCostTracker } from '../modules/llm/cost/session-cost.tracker';
import { LlmPricingCatalogService } from '../modules/llm/cost/llm-pricing-catalog.service';

describe('SessionCostTracker', () => {
  const prisma = {
    sessionCost: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };
  const redis = {
    del: jest.fn(),
    getClient: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes a new session and clears only its new realtime counter', async () => {
    prisma.sessionCost.findUnique.mockResolvedValue(null);
    const tracker = new SessionCostTracker(prisma as any, redis as any, new LlmPricingCatalogService());

    await tracker.startSession('interview-1');

    expect(prisma.sessionCost.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ interviewId: 'interview-1' }),
    });
    expect(redis.del).toHaveBeenCalledWith('session_cost:interview-1');
  });

  it('does not reset accumulated realtime metrics for an existing session', async () => {
    prisma.sessionCost.findUnique.mockResolvedValue({ interviewId: 'interview-1' });
    const tracker = new SessionCostTracker(prisma as any, redis as any, new LlmPricingCatalogService());

    await tracker.startSession('interview-1');

    expect(prisma.sessionCost.create).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('records per-call versioned cost instead of applying one provider price at flush time', async () => {
    const pipeline: any = {};
    for (const method of ['hincrby', 'hset', 'hsetnx', 'hincrbyfloat']) {
      pipeline[method] = jest.fn().mockReturnValue(pipeline);
    }
    pipeline.exec = jest.fn().mockResolvedValue([]);
    const realtimeRedis = {
      getClient: jest.fn().mockReturnValue({ pipeline: () => pipeline }),
    };
    const tracker = new SessionCostTracker(
      prisma as any,
      realtimeRedis as any,
      new LlmPricingCatalogService(),
    );

    await tracker.recordLlmCall({
      interviewId: 'interview-1', provider: 'deepseek', model: 'deepseek-flash',
      promptTokens: 1000, completionTokens: 500, cachedTokens: 0,
      cacheHit: false, isRetry: false, isFallback: true, durationMs: 100,
    });

    expect(pipeline.hset).toHaveBeenCalledWith(
      'session_cost:interview-1', 'pricingCatalogVersion', '2026-10-05.1',
    );
    expect(pipeline.hsetnx).toHaveBeenCalledWith(
      'session_cost:interview-1', 'costStatus', 'available',
    );
    expect(pipeline.hincrbyfloat).toHaveBeenCalledWith(
      'session_cost:interview-1', 'estimatedCostCny', 0.006,
    );
  });

  it('marks the whole session unavailable when a billable model has no catalog entry', async () => {
    const pipeline: any = {};
    for (const method of ['hincrby', 'hset', 'hsetnx', 'hincrbyfloat']) {
      pipeline[method] = jest.fn().mockReturnValue(pipeline);
    }
    pipeline.exec = jest.fn().mockResolvedValue([]);
    const tracker = new SessionCostTracker(
      prisma as any,
      { getClient: () => ({ pipeline: () => pipeline }) } as any,
      new LlmPricingCatalogService(),
    );

    await tracker.recordLlmCall({
      interviewId: 'interview-1', provider: 'custom', model: 'private-model',
      promptTokens: 100, completionTokens: 20, cachedTokens: 0,
      cacheHit: false, isRetry: false, isFallback: false, durationMs: 100,
    });

    expect(pipeline.hset).toHaveBeenCalledWith(
      'session_cost:interview-1', 'costStatus', 'unavailable',
    );
    expect(pipeline.hincrbyfloat).not.toHaveBeenCalled();
  });
});
