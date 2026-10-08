import { requireTenant } from '../../organizations/tenant-context';
import { QuotaService, QuotaExceededException } from './quota.service';
import { Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsageLedgerType } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';

@Injectable()
export class UsageService {
  constructor(private prisma: PrismaService, private config: ConfigService, private quota: QuotaService) {}

  createInterview(data: Prisma.InterviewUncheckedCreateInput) {
    return this.quota.createInterview(data);
  }

  async cancelFailedInterview(interviewId: string) {
    await this.prisma.$transaction(async tx => {
      await tx.usageLedger.deleteMany({ where: { interviewId, type: 'INTERVIEW_START' } });
      await tx.interview.delete({ where: { id: interviewId } });
    });
  }

  async assertInterviewAllowed(userId: string): Promise<void> {
    const limit = this.monthlyInterviewLimit();
    if (limit === null) return;
    const used = await this.prisma.usageLedger.aggregate({
      where: { userId, periodStart: this.currentPeriodStart(), type: UsageLedgerType.INTERVIEW_START },
      _sum: { units: true },
    });
    if ((used._sum.units || 0) >= limit) {
      throw new QuotaExceededException();
    }
  }

  async recordInterviewStart(userId: string, interviewId: string): Promise<void> {
    await this.prisma.usageLedger.upsert({
      where: { interviewId_type: { interviewId, type: UsageLedgerType.INTERVIEW_START } },
      create: { userId, interviewId, periodStart: this.currentPeriodStart(), type: UsageLedgerType.INTERVIEW_START },
      update: {},
    });
  }

  async summary(userId: string) {
    const { organizationId } = requireTenant();
    const organization = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, include: { plan: true } });
    const limit = organization.plan.monthlyInterviews;
    const used = await this.prisma.usageLedger.aggregate({
      where: { organizationId, periodStart: this.currentPeriodStart(), type: UsageLedgerType.INTERVIEW_START },
      _sum: { units: true },
    });
    const interviewsUsed = used._sum.units || 0;
    return {
      periodStart: this.currentPeriodStart(),
      quotaScope: 'ORGANIZATION',
      interviewsUsed,
      interviewLimit: limit,
      interviewsRemaining: limit === null ? null : Math.max(0, limit - interviewsUsed),
    };
  }

  private monthlyInterviewLimit(): number | null {
    const raw = this.config.get<string>('quota.monthlyInterviewLimit') || process.env.QUOTA_MONTHLY_INTERVIEW_LIMIT;
    if (!raw) return null;
    const limit = Number(raw);
    return Number.isInteger(limit) && limit > 0 ? limit : null;
  }

  private currentPeriodStart(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }
}
