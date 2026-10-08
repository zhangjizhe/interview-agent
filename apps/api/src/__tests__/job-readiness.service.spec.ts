import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

jest.mock('../modules/interview/services/resume-rag.service', () => ({
  ResumeRAGService: class ResumeRAGService {},
}));

import { JobReadinessService } from '../modules/interview/services/job-readiness.service';

describe('JobReadinessService', () => {
  const prisma = {
    $transaction: jest.fn(),
    targetJob: {
      updateMany: jest.fn(),
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    jobSkillRequirement: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    skillDefinition: { upsert: jest.fn() },
    candidateSkillState: { findMany: jest.fn() },
    evaluationRun: { findFirst: jest.fn() },
  };
  const resumeRag = { searchByUser: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
    prisma.targetJob.create.mockResolvedValue({
      id: 'job-1',
      title: 'AI Agent 工程师',
      level: 'P5',
      jobDescription: '负责 RAG、Agent、Evaluation 与系统设计。',
    });
    prisma.skillDefinition.upsert.mockResolvedValue({ id: 'skill-1' });
    prisma.targetJob.findUniqueOrThrow.mockResolvedValue({
      id: 'job-1',
      title: 'AI Agent 工程师',
      level: 'P5',
      skillRequirements: [],
    });
  });

  it('activates the new target job and derives requirements without an LLM call', async () => {
    const service = new JobReadinessService(prisma as any, resumeRag as any);

    await service.createTargetJob('user-a', {
      title: 'AI Agent 工程师',
      level: 'P5',
      jobDescription: '负责 RAG、Agent、Evaluation 与系统设计。',
    });

    expect(prisma.targetJob.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-a', isActive: true },
      data: { isActive: false },
    });
    expect(prisma.targetJob.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: 'user-a',
        isActive: true,
        source: 'jd-keyword-v1',
        jobDescriptionHash: expect.any(String),
      }),
    }));
    expect(prisma.skillDefinition.upsert).toHaveBeenCalled();
    expect(prisma.jobSkillRequirement.create).toHaveBeenCalled();
  });

  it('rejects a JD that is too short before persistence', async () => {
    const service = new JobReadinessService(prisma as any, resumeRag as any);

    await expect(service.createTargetJob('user-a', {
      title: '前端工程师',
      jobDescription: '太短',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.targetJob.create).not.toHaveBeenCalled();
  });

  it('returns insufficient evidence instead of a fabricated readiness score', async () => {
    prisma.targetJob.findFirst.mockResolvedValue({
      id: 'job-1',
      title: 'AI Agent 工程师',
      level: 'P5',
      company: null,
      jobDescription: null,
      skillRequirements: [{
        skillId: 'skill-1',
        importance: 5,
        expectedLevel: 'P5',
        source: 'role-baseline-v1',
        skill: { id: 'skill-1', slug: 'agent-architecture', name: 'Agent 架构', taxonomyVersion: 'v1' },
      }],
    });
    resumeRag.searchByUser.mockResolvedValue([]);
    prisma.candidateSkillState.findMany.mockResolvedValue([]);
    prisma.evaluationRun.findFirst.mockResolvedValue(null);
    const service = new JobReadinessService(prisma as any, resumeRag as any);

    const result = await service.getReadiness('user-a', 'job-1');

    expect(result.available).toBe(false);
    expect(result.overallScore).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.missingReasons).toEqual(expect.arrayContaining([
      '尚未找到可用简历证据',
      '尚未完成可用于准备度的正式面试评价',
    ]));
  });

  it('does not disclose a foreign target job', async () => {
    prisma.targetJob.findFirst.mockResolvedValue(null);
    const service = new JobReadinessService(prisma as any, resumeRag as any);

    await expect(service.getReadiness('user-a', 'job-b'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('increments the target-job profile version when requirements are rebuilt', async () => {
    prisma.targetJob.findFirst.mockResolvedValueOnce({
      id: 'job-1',
      title: 'AI Agent 工程师',
      level: 'P5',
      company: null,
      jobDescription: null,
    });
    prisma.targetJob.update.mockResolvedValueOnce({
      id: 'job-1',
      title: 'AI Agent 工程师',
      level: 'P6',
      jobDescription: null,
    });
    const service = new JobReadinessService(prisma as any, resumeRag as any);

    await service.updateTargetJob('user-a', 'job-1', { level: 'P6' });

    expect(prisma.targetJob.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ profileVersion: { increment: 1 } }),
    }));
  });

  it('maps the database single-active-job conflict to a retryable business error', async () => {
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
    const service = new JobReadinessService(prisma as any, resumeRag as any);

    await expect(service.createTargetJob('user-a', { title: 'AI Agent 工程师' }))
      .rejects.toBeInstanceOf(ConflictException);
  });
});
