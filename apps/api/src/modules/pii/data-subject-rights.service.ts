import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DataRetentionService } from './data-retention.service';
import { PiiAuditLogService } from './audit-log.service';
import { ResumeRAGService } from '../interview/services/resume-rag.service';

@Injectable()
export class DataSubjectRightsService implements OnModuleInit {
  private readonly logger = new Logger(DataSubjectRightsService.name);
  private resumeRag: ResumeRAGService | null = null;

  constructor(
    private prisma: PrismaService,
    private retentionService: DataRetentionService,
    private auditLog: PiiAuditLogService,
    private moduleRef: ModuleRef,
  ) {}

  onModuleInit() {
    try {
      this.resumeRag = this.moduleRef.get(ResumeRAGService, { strict: false });
    } catch {
      this.resumeRag = null;
    }
  }

  async exportUserData(userId: string): Promise<{
    user: any;
    interviews: any[];
    messages: any[];
    answerHistories: any[];
    reflectionLogs: any[];
    reports: any[];
    preferences: any[];
    consents: any[];
    exportDate: string;
    dataSubject: string;
  }> {
    this.logger.log(`📤 Exporting user data for userId=${userId}`);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const [interviews, messages, answerHistories, reflectionLogs, reports, preferences, consents] =
      await Promise.all([
        this.prisma.interview.findMany({
          where: { userId },
          include: {
            cost: { select: { estimatedCostCny: true, totalTokens: true, llmCalls: true } },
          },
          orderBy: { startedAt: 'desc' },
        }),
        this.prisma.message.findMany({
          where: { interview: { userId } },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.answerHistory.findMany({
          where: { interview: { userId } },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.reflectionLog.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.report.findMany({
          where: { interview: { userId } },
        }),
        this.prisma.userToolPreference.findMany({
          where: { userId },
        }),
        this.prisma.privacyConsent.findMany({
          where: { userId },
        }),
      ]);

    await this.auditLog.log({
      userId,
      action: 'EXPORT',
      dataType: 'user_data',
      dataId: userId,
      fields: ['user', 'interviews', 'messages', 'answer_histories', 'reflection_logs', 'reports', 'preferences', 'consents'],
      reason: 'User data export request (GDPR Art. 15)',
    });

    this.logger.log(`✅ User data exported for ${userId}`);
    return {
      user,
      interviews,
      messages,
      answerHistories,
      reflectionLogs,
      reports,
      preferences,
      consents,
      exportDate: new Date().toISOString(),
      dataSubject: userId,
    };
  }

  async deleteAccount(userId: string): Promise<{ deleted: boolean; deletedAt: string }> {
    this.logger.log(`🗑️  Deleting account for userId=${userId}`);

    await Promise.all([
      this.prisma.$transaction(async (tx) => {
        await tx.message.deleteMany({ where: { interview: { userId } } });
        await tx.answerHistory.deleteMany({ where: { interview: { userId } } });
        await tx.reflectionLog.deleteMany({ where: { userId } });
        await tx.interviewTask.deleteMany({ where: { interview: { userId } } });
        await tx.report.deleteMany({ where: { interview: { userId } } });
        await tx.sessionCost.deleteMany({ where: { interview: { userId } } });
        await tx.interview.deleteMany({ where: { userId } });
        await tx.userToolPreference.deleteMany({ where: { userId } });
        await tx.privacyConsent.deleteMany({ where: { userId } });
        await tx.user.delete({ where: { id: userId } });
      }),
      this.resumeRag?.deleteResumesByUser(userId).catch(() => 0),
    ]);

    await this.auditLog.log({
      userId,
      action: 'DELETE',
      dataType: 'user_account',
      dataId: userId,
      reason: 'Account deletion request (GDPR Art. 17 - Right to be Forgotten)',
    });

    this.logger.log(`✅ Account deleted for ${userId}`);
    return { deleted: true, deletedAt: new Date().toISOString() };
  }

  async anonymizeAccount(userId: string): Promise<{ anonymized: boolean; anonymizedAt: string }> {
    this.logger.log(`👻 Anonymizing account for userId=${userId}`);

    await this.retentionService.anonymizeUser(userId);

    await this.auditLog.log({
      userId,
      action: 'ANONYMIZE',
      dataType: 'user_account',
      dataId: userId,
      reason: 'Account anonymization request (GDPR Art. 17 alternative)',
    });

    this.logger.log(`✅ Account anonymized for ${userId}`);
    return { anonymized: true, anonymizedAt: new Date().toISOString() };
  }

  async getDataPortability(userId: string): Promise<string> {
    const data = await this.exportUserData(userId);
    return JSON.stringify(data, null, 2);
  }
}
