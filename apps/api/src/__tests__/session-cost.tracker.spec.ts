import { SessionCostTracker } from '../modules/llm/cost/session-cost.tracker';

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
    const tracker = new SessionCostTracker(prisma as any, redis as any);

    await tracker.startSession('interview-1');

    expect(prisma.sessionCost.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ interviewId: 'interview-1' }),
    });
    expect(redis.del).toHaveBeenCalledWith('session_cost:interview-1');
  });

  it('does not reset accumulated realtime metrics for an existing session', async () => {
    prisma.sessionCost.findUnique.mockResolvedValue({ interviewId: 'interview-1' });
    const tracker = new SessionCostTracker(prisma as any, redis as any);

    await tracker.startSession('interview-1');

    expect(prisma.sessionCost.create).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });
});
