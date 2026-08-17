import { BadRequestException } from '@nestjs/common';

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
    interview: { create: jest.fn() },
  };
  const resumeRag = { searchByUser: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    resumeRag.searchByUser.mockResolvedValue([{ name: 'resume.md' }]);
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

  function controller() {
    return new InterviewLifecycleController(
      {} as any,
      {} as any,
      prisma as any,
      {} as any,
      resumeRag as any,
      {} as any,
      {} as any,
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
});
