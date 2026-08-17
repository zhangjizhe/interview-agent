import { NotFoundException } from '@nestjs/common';

jest.mock('../modules/interview/services/job-readiness.service', () => ({
  JobReadinessService: class JobReadinessService {},
}));

import { SkillProfileController } from '../modules/interview/controllers/skill-profile.controller';

describe('SkillProfileController', () => {
  const prisma = {
    interview: { findFirst: jest.fn() },
    targetJob: { findMany: jest.fn() },
    candidateSkillState: { findMany: jest.fn() },
    evaluationRun: { findMany: jest.fn() },
    assessmentEvidence: { findMany: jest.fn() },
  };
  const req = { user: { userId: 'user-a' } };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('filters target jobs and skill states by the authenticated user', async () => {
    const controller = new SkillProfileController(prisma as any, {} as any, {} as any);

    await controller.listTargetJobs(req);
    await controller.listSkillStates(req);

    expect(prisma.targetJob.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-a' },
    }));
    expect(prisma.candidateSkillState.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-a' },
    }));
  });

  it('does not read evidence for a foreign interview', async () => {
    prisma.interview.findFirst.mockResolvedValueOnce(null);
    const controller = new SkillProfileController(prisma as any, {} as any, {} as any);

    await expect(controller.listAssessmentEvidence('interview-b', req))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.assessmentEvidence.findMany).not.toHaveBeenCalled();
  });
});
