jest.mock('../modules/interview/services/question-confirmation.service', () => ({ QuestionConfirmationService: class {} }));
import { BadRequestException, ConflictException } from '@nestjs/common';

jest.mock('../modules/interview/services/resume-rag.service', () => ({
  ResumeRAGService: class ResumeRAGService {},
}));
jest.mock('../modules/agent/interview-agent.service', () => ({
  InterviewAgentService: class InterviewAgentService {},
}));
jest.mock('../modules/agent/multi-agent.service', () => ({
  MultiAgentService: class MultiAgentService {},
}));
jest.mock('../modules/memory/memory.service', () => ({
  MemoryService: class MemoryService {},
}));
jest.mock('../modules/interview/services/evaluation.service', () => ({
  EvaluationService: class EvaluationService {},
}));

import { InterviewLifecycleController } from '../modules/interview/controllers/interview-lifecycle.controller';

describe('InterviewLifecycleController start', () => {
  const prisma = {
    targetJob: { findFirst: jest.fn() },
    jobSkillRequirement: { findFirst: jest.fn() },
    interview: { create: jest.fn(), findFirst: jest.fn(), deleteMany: jest.fn() },
  };
  const resumeRag = { searchByUser: jest.fn() };
  const usage = { assertInterviewAllowed: jest.fn(), recordInterviewStart: jest.fn(), createInterview: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    resumeRag.searchByUser.mockResolvedValue([{ name: 'resume.md' }]);
    usage.assertInterviewAllowed.mockResolvedValue(undefined);
    usage.recordInterviewStart.mockResolvedValue(undefined);
    usage.createInterview.mockImplementation(data => prisma.interview.create({ data }));
    prisma.targetJob.findFirst.mockResolvedValue({
      id: 'job-1',
      title: 'AI Agent Engineer',
      level: 'P5',
      profileVersion: 3,
    });
    prisma.jobSkillRequirement.findFirst.mockResolvedValue({
      skillId: 'skill-1',
      skill: { id: 'skill-1', isActive: true },
    });
    prisma.interview.create.mockResolvedValue({ id: 'interview-1' });
  });

  function controller(redis?: any) {
    return new InterviewLifecycleController(
      {} as any,
      {} as any,
      prisma as any,
      {} as any,
      resumeRag as any,
      {} as any,
      {} as any,
      usage as any,
      {} as any,
      {} as any,
      redis,
    );
  }

  it('persists skill-practice mode with an owned target-job version snapshot', async () => {
    await controller().startInterview({
      userId: 'ignored-by-controller',
      position: 'ignored because target job is used',
      targetJobId: 'job-1',
      mode: 'SKILL_PRACTICE',
      practiceSkillId: 'skill-1',
    }, { user: { userId: 'user-1' } });

    expect(prisma.jobSkillRequirement.findFirst).toHaveBeenCalledWith({
      where: { targetJobId: 'job-1', skillId: 'skill-1' },
      include: { skill: { select: { id: true, isActive: true } } },
    });
    expect(prisma.interview.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        position: 'AI Agent Engineer',
        level: 'P5',
        mode: 'SKILL_PRACTICE',
        targetJobId: 'job-1',
        targetJobProfileVersion: 3,
        practiceSkillId: 'skill-1',
      }),
    });
    expect(usage.createInterview).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1' }));
  });

  it('does not allow skill practice without a target-job skill owned by the user', async () => {
    prisma.targetJob.findFirst.mockResolvedValue(null);

    await expect(controller().startInterview({
      userId: 'ignored-by-controller',
      position: 'AI Agent Engineer',
      targetJobId: 'foreign-job',
      mode: 'SKILL_PRACTICE',
      practiceSkillId: 'skill-1',
    }, { user: { userId: 'user-1' } })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.interview.create).not.toHaveBeenCalled();
  });

  it('rejects before creating an interview when server quota is exhausted', async () => {
    usage.assertInterviewAllowed.mockRejectedValueOnce(new BadRequestException('quota exceeded'));

    await expect(controller().startInterview({
      userId: 'ignored-by-controller',
      position: 'AI Agent Engineer',
      targetJobId: 'job-1',
    }, { user: { userId: 'user-1' } })).rejects.toThrow('quota exceeded');
    expect(prisma.interview.create).not.toHaveBeenCalled();
  });

  it('atomically deletes only empty in-progress owned rooms and rejects non-empty or completed rooms', async () => {
    prisma.interview.findFirst.mockResolvedValue({ id: 'iv-empty', userId: 'user-1' });
    prisma.interview.deleteMany.mockResolvedValueOnce({ count: 1 });

    const deleted = await controller().deleteInterview('iv-empty', { user: { userId: 'user-1' } });
    expect(deleted).toEqual({ deleted: true, reason: 'manual_cleanup' });
    expect(prisma.interview.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'iv-empty',
        userId: 'user-1',
        status: 'IN_PROGRESS',
        messages: { none: {} },
        report: { is: null },
      },
    });

    prisma.interview.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      controller().deleteInterview('iv-empty', { user: { userId: 'user-1' } }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('replays the existing owned interview on duplicate Idempotency-Key without recharging quota', async () => {
    const store = new Map<string, string>();
    const redisClient = {
      set: jest.fn(async (key: string, value: string, _ex: string, _ttl: number, nx?: string) => {
        if (nx === 'NX' && store.has(key)) return null;
        store.set(key, value);
        return 'OK';
      }),
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      del: jest.fn(async (key: string) => { store.delete(key); return 1; }),
    };
    const redis = { getClient: () => redisClient };
    const dto = { userId: 'ignored', position: 'AI Agent Engineer', targetJobId: 'job-1' };
    const req = { user: { userId: 'user-1' } };

    const first = await controller(redis).startInterview(dto, req, 'idem-start-12345678');
    expect(first.interviewId).toBe('interview-1');
    expect(usage.createInterview).toHaveBeenCalledTimes(1);

    prisma.interview.findFirst.mockResolvedValueOnce({ id: 'interview-1', userId: 'user-1', resumeConfirmed: false });
    const replay = await controller(redis).startInterview(dto, req, 'idem-start-12345678');
    expect(replay.interviewId).toBe('interview-1');
    expect((replay as any).idempotentReplay).toBe(true);
    expect(usage.createInterview).toHaveBeenCalledTimes(1);
    expect(usage.assertInterviewAllowed).toHaveBeenCalledTimes(1);
  });

  it('rejects concurrent in-flight start, mismatched payload reuse, and malformed Idempotency-Key', async () => {
    const store = new Map<string, string>();
    const redisClient = {
      set: jest.fn(async (key: string, value: string, _ex: string, _ttl: number, nx?: string) => {
        if (nx === 'NX' && store.has(key)) return null;
        store.set(key, value);
        return 'OK';
      }),
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      del: jest.fn(async (key: string) => { store.delete(key); return 1; }),
    };
    const redis = { getClient: () => redisClient };
    const req = { user: { userId: 'user-1' } };

    // Malformed key
    await expect(
      controller(redis).startInterview({ userId: 'ignored', position: 'FE' }, req, 'bad key!'),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Release pending lock on creation failure so retry succeeds
    usage.assertInterviewAllowed.mockRejectedValueOnce(new BadRequestException('quota exceeded'));
    await expect(
      controller(redis).startInterview({ userId: 'ignored', position: 'FE', targetJobId: 'job-1' }, req, 'idem-retry-12345678'),
    ).rejects.toThrow('quota exceeded');
    expect(store.size).toBe(0);

    // Mismatched payload reuse -> 409 Conflict
    await controller(redis).startInterview({ userId: 'ignored', position: 'FE', targetJobId: 'job-1' }, req, 'idem-reuse-12345678');
    await expect(
      controller(redis).startInterview({ userId: 'ignored', position: 'BE', targetJobId: 'job-2' }, req, 'idem-reuse-12345678'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
