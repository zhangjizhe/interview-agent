import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsageLedgerType } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';

@Injectable()
export class UsageService {
  constructor(private prisma: PrismaService, private config: ConfigService) {}

  async assertInterviewAllowed(userId: string): Promise<void> {
    const limit = this.monthlyInterviewLimit();
    if (limit === null) return;
    const used = await this.prisma.usageLedger.aggregate({
      where: { userId, periodStart: this.currentPeriodStart(), type: UsageLedgerType.INTERVIEW_START },
      _sum: { units: true },
    });
    if ((used._sum.units || 0) >= limit) {
      throw new HttpException('本月面试额度已用完，请在下个周期后重试。', HttpStatus.TOO_MANY_REQUESTS);
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
    const limit = this.monthlyInterviewLimit();
    const used = await this.prisma.usageLedger.aggregate({
      where: { userId, periodStart: this.currentPeriodStart(), type: UsageLedgerType.INTERVIEW_START },
      _sum: { units: true },
    });
    const interviewsUsed = used._sum.units || 0;
    return {
      periodStart: this.currentPeriodStart(),
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
