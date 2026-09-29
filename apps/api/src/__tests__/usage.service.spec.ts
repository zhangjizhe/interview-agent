import { tenantContext } from '../modules/organizations/tenant-context';
import { HttpStatus } from '@nestjs/common';
import { UsageService } from '../modules/llm/usage/usage.service';

describe('UsageService', () => {
  const prisma = {
    organization: { findUniqueOrThrow: async () => ({ plan: { monthlyInterviews: 2 } }) },
    usageLedger: { aggregate: jest.fn(), upsert: jest.fn() },
  };
  const config = { get: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockReturnValue('2');
    prisma.usageLedger.aggregate.mockResolvedValue({ _sum: { units: 0 } });
  });

  it('records each interview start once', async () => {
    const service = new UsageService(prisma as any, config as any, {} as any);
    await service.recordInterviewStart('user-a', 'interview-a');
    await service.recordInterviewStart('user-a', 'interview-a');
    expect(prisma.usageLedger.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.usageLedger.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { interviewId_type: { interviewId: 'interview-a', type: 'INTERVIEW_START' } },
    }));
  });

  it('rejects an exhausted monthly interview quota server-side', async () => {
    prisma.usageLedger.aggregate.mockResolvedValueOnce({ _sum: { units: 2 } });
    const service = new UsageService(prisma as any, config as any, {} as any);
    await expect(service.assertInterviewAllowed('user-a')).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  it('returns a candidate-safe usage summary', async () => {
    prisma.usageLedger.aggregate.mockResolvedValueOnce({ _sum: { units: 1 } });
    const service = new UsageService(prisma as any, config as any, {} as any);
    await expect(tenantContext.run({ organizationId: 'org-a', userId: 'user-a' }, async () => await service.summary('user-a'))).resolves.toMatchObject({
      interviewsUsed: 1,
      interviewLimit: 2,
      interviewsRemaining: 1,
    });
  });
});
