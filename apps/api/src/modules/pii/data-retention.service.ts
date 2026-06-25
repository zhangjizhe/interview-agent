import { Injectable, Logger, OnModuleInit, forwardRef, Inject } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ModuleRef } from '@nestjs/core';
import { ResumeRAGService } from '../interview/services/resume-rag.service';

@Injectable()
export class DataRetentionService implements OnModuleInit {
  private readonly logger = new Logger(DataRetentionService.name);
  private resumeRag: ResumeRAGService | null = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private moduleRef: ModuleRef,
  ) {}

  onModuleInit() {
    const enabled = this.config.get<boolean>('pii.retention.enabled');
    this.logger.log(`✅ Data retention service ready (enabled=${enabled})`);
  }

  private getResumeRag(): ResumeRAGService | null {
    if (this.resumeRag) return this.resumeRag;
    try {
      this.resumeRag = this.moduleRef.get(ResumeRAGService, { strict: false });
    } catch {
      this.resumeRag = null;
    }
    return this.resumeRag;
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM, {
    name: 'pii-retention-cleanup',
    timeZone: 'Asia/Shanghai',
  })
  async runRetentionCleanup() {
    const enabled = this.config.get<boolean>('pii.retention.enabled');
    if (!enabled) {
      this.logger.log('Data retention cleanup skipped — disabled by config');
      return;
    }

    this.logger.log('🔄 Starting PII data retention cleanup...');

    const results: Record<string, number> = {};

    results.messages = await this.cleanupMessages();
    results.answerHistories = await this.cleanupAnswerHistories();
    results.reflectionLogs = await this.cleanupReflectionLogs();
    results.interviewTasks = await this.cleanupInterviewTasks();
    results.abandonedInterviews = await this.cleanupAbandonedInterviews();

    const rag = this.getResumeRag();
    if (rag) {
      results.expiredResumes = await rag.cleanExpiredResumes();
    }

    const total = Object.values(results).reduce((a, b) => a + b, 0);
    this.logger.log(`✅ PII retention cleanup complete: ${total} records removed`, results);
  }

  private async cleanupMessages(): Promise<number> {
    const days = this.config.get<number>('pii.retention.messageDays') ?? 90;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await this.prisma.message.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    this.logger.log(`  - Messages: deleted ${result.count} (older than ${days}d)`);
    return result.count;
  }

  private async cleanupAnswerHistories(): Promise<number> {
    const days = this.config.get<number>('pii.retention.answerDays') ?? 90;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await this.prisma.answerHistory.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    this.logger.log(`  - Answer histories: deleted ${result.count} (older than ${days}d)`);
    return result.count;
  }

  private async cleanupReflectionLogs(): Promise<number> {
    const days = this.config.get<number>('pii.retention.reflectionDays') ?? 90;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await this.prisma.reflectionLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    this.logger.log(`  - Reflection logs: deleted ${result.count} (older than ${days}d)`);
    return result.count;
  }

  private async cleanupInterviewTasks(): Promise<number> {
    const days = this.config.get<number>('pii.retention.taskDays') ?? 90;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await this.prisma.interviewTask.deleteMany({
      where: {
        createdAt: { lt: cutoff },
        status: { in: ['COMPLETED', 'SKIPPED'] },
      },
    });

    this.logger.log(`  - Interview tasks: deleted ${result.count} (older than ${days}d)`);
    return result.count;
  }

  private async cleanupAbandonedInterviews(): Promise<number> {
    const days = this.config.get<number>('pii.retention.abandonedDays') ?? 30;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await this.prisma.interview.deleteMany({
      where: {
        status: 'ABANDONED',
        startedAt: { lt: cutoff },
      },
    });

    this.logger.log(`  - Abandoned interviews: deleted ${result.count} (older than ${days}d)`);
    return result.count;
  }

  async getRetentionStats(): Promise<{
    messages: number;
    answerHistories: number;
    reflectionLogs: number;
    interviewTasks: number;
    interviews: number;
    policies: {
      messageDays: number;
      answerDays: number;
      reflectionDays: number;
      taskDays: number;
      abandonedDays: number;
    };
  }> {
    const [messages, answerHistories, reflectionLogs, interviewTasks, interviews] =
      await Promise.all([
        this.prisma.message.count(),
        this.prisma.answerHistory.count(),
        this.prisma.reflectionLog.count(),
        this.prisma.interviewTask.count(),
        this.prisma.interview.count(),
      ]);

    return {
      messages,
      answerHistories,
      reflectionLogs,
      interviewTasks,
      interviews,
      policies: {
        messageDays: this.config.get<number>('pii.retention.messageDays') ?? 90,
        answerDays: this.config.get<number>('pii.retention.answerDays') ?? 90,
        reflectionDays: this.config.get<number>('pii.retention.reflectionDays') ?? 90,
        taskDays: this.config.get<number>('pii.retention.taskDays') ?? 90,
        abandonedDays: this.config.get<number>('pii.retention.abandonedDays') ?? 30,
      },
    };
  }

  async anonymizeUser(userId: string): Promise<void> {
    this.logger.log(`🔄 Anonymizing user data for userId=${userId}`);

    await this.prisma.$transaction(async (tx) => {
      await tx.message.updateMany({
        where: { interview: { userId } },
        data: {
          content: '[ANONYMIZED]',
          metadata: null,
        },
      });

      await tx.answerHistory.updateMany({
        where: { interview: { userId } },
        data: {
          question: '[ANONYMIZED]',
          answer: '[ANONYMIZED]',
          feedback: null,
        },
      });

      await tx.reflectionLog.updateMany({
        where: { userId },
        data: {
          question: '[ANONYMIZED]',
          finalResponse: '[ANONYMIZED]',
          reflection: null,
          reviewIssues: [],
          issueTags: [],
        },
      });

      await tx.interviewTask.updateMany({
        where: { interview: { userId } },
        data: {
          question: '[ANONYMIZED]',
          context: null,
        },
      });

      await tx.report.updateMany({
        where: { interview: { userId } },
        data: {
          strengths: '[ANONYMIZED]',
          weaknesses: '[ANONYMIZED]',
          suggestions: '[ANONYMIZED]',
          scores: {},
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          name: 'Anonymized User',
          email: `anon_${userId.slice(0, 8)}@example.com`,
          avatarUrl: null,
        },
      });
    });

    this.logger.log(`✅ User ${userId} anonymized`);
  }
}
