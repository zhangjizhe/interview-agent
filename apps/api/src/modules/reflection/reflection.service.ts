/**
 * Reflection 日志服务（ADR #10 Phase 1）
 *
 * 职责：
 * - Reviewer 节点执行后，把反思日志写入 Prisma reflection_logs 表
 * - 提供 Layer 2 离线聚合（cron job 用）：按 issue_tag 聚合失败模式
 *
 * 设计原则：
 * - 写入失败不抛：日志是辅助能力，不应阻塞主流程
 * - 异步 fire-and-forget：调用方不需要 await
 * - 索引完整：createdAt + reviewScore + issueTags 三个高频过滤维度
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface ReflectionLogInput {
  interviewId: string;
  userId: string;
  question: string;
  finalResponse: string;
  reviewScore: number;
  reviewIssues: string[];
  issueTags: string[];
  reflection?: string;
  retryCount?: number;
  hitlPending?: boolean;
  modelName: string;
  nodeName?: string;
}

@Injectable()
export class ReflectionService {
  private readonly logger = new Logger(ReflectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 记录一次反思日志。失败仅记录日志，不抛错（fire-and-forget）。
   */
  async record(input: ReflectionLogInput): Promise<void> {
    try {
      await this.prisma.reflectionLog.create({
        data: {
          interviewId: input.interviewId,
          userId: input.userId,
          question: input.question,
          finalResponse: input.finalResponse,
          reviewScore: input.reviewScore,
          reviewIssues: input.reviewIssues,
          issueTags: input.issueTags,
          reflection: input.reflection,
          retryCount: input.retryCount ?? 0,
          hitlPending: input.hitlPending ?? false,
          modelName: input.modelName,
          nodeName: input.nodeName ?? 'reviewer',
        },
      });
    } catch (e: any) {
      // 写入失败不阻塞主流程
      this.logger.warn(`reflection_log insert failed: ${e.message}`);
    }
  }

  /**
   * Layer 2 离线聚合（cron 调用）：过去 N 天的高频 issue_tags
   */
  async aggregateTopIssues(days = 7): Promise<Array<{ tag: string; count: number; pct: number }>> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const recent = await this.prisma.reflectionLog.findMany({
      where: {
        createdAt: { gte: since },
        reviewScore: { lt: 0.7 },
      },
      select: { issueTags: true },
    });

    const tagCount: Record<string, number> = {};
    for (const r of recent) {
      for (const tag of r.issueTags) {
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      }
    }

    const total = recent.length || 1;
    return Object.entries(tagCount)
      .map(([tag, count]) => ({ tag, count, pct: (count / total) * 100 }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Layer 2 离线聚合：抽取最严重的 K 条 bad case（reviewScore < 0.4）
   */
  async getTopBadCases(days = 7, limit = 10): Promise<any[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.prisma.reflectionLog.findMany({
      where: {
        createdAt: { gte: since },
        reviewScore: { lt: 0.4 },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}