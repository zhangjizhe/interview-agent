/**
 * HITL Service - Human-In-The-Loop 最小版
 *
 * P1-5 修复：评分争议时人工介入
 * - Redis 存 interview:{id}:hitl_pending 状态
 * - 评分争议触发 pending，等待 HR 审批
 * - 不做完整 HR 工作流（demo 阶段）
 */

import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../infra/redis/redis.service';

export interface HitlPending {
  interviewId: string;
  sessionId: string;
  question: string;
  answer: string;
  aiScore: number;
  issue: string;
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewerId?: string;
  reviewedAt?: string;
}

@Injectable()
export class HitlService {
  private readonly logger = new Logger(HitlService.name);
  private readonly HITL_TTL = 7 * 24 * 60 * 60; // 7 天过期

  constructor(private redis: RedisService) {}

  /**
   * 创建 HITL pending 状态
   * 当评分争议时调用，存入 Redis
   */
  async createPending(params: {
    interviewId: string;
    sessionId: string;
    question: string;
    answer: string;
    aiScore: number;
    issue: string;
  }): Promise<string> {
    const client = this.redis.getClient();
    const key = this.getKey(params.interviewId);

    const pending: HitlPending = {
      interviewId: params.interviewId,
      sessionId: params.sessionId,
      question: params.question,
      answer: params.answer,
      aiScore: params.aiScore,
      issue: params.issue,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };

    await client.set(key, JSON.stringify(pending), 'EX', this.HITL_TTL);
    this.logger.log(`[HITL] Created pending for interview ${params.interviewId}`);

    return key;
  }

  /**
   * 获取 pending 状态
   */
  async getPending(interviewId: string): Promise<HitlPending | null> {
    const client = this.redis.getClient();
    const key = this.getKey(interviewId);
    const data = await client.get(key);

    if (!data) return null;

    try {
      return JSON.parse(data) as HitlPending;
    } catch {
      return null;
    }
  }

  /**
   * 检查是否有 pending 的 HITL
   */
  async hasPending(interviewId: string): Promise<boolean> {
    const client = this.redis.getClient();
    const key = this.getKey(interviewId);
    const exists = await client.exists(key);
    return exists === 1;
  }

  /**
   * HR 审批通过
   */
  async approve(interviewId: string, reviewerId: string): Promise<boolean> {
    const pending = await this.getPending(interviewId);
    if (!pending || pending.status !== 'pending') {
      return false;
    }

    pending.status = 'approved';
    pending.reviewerId = reviewerId;
    pending.reviewedAt = new Date().toISOString();

    const client = this.redis.getClient();
    const key = this.getKey(interviewId);
    await client.set(key, JSON.stringify(pending), 'EX', this.HITL_TTL);

    this.logger.log(`[HITL] Approved for interview ${interviewId} by ${reviewerId}`);
    return true;
  }

  /**
   * HR 审批拒绝
   */
  async reject(interviewId: string, reviewerId: string): Promise<boolean> {
    const pending = await this.getPending(interviewId);
    if (!pending || pending.status !== 'pending') {
      return false;
    }

    pending.status = 'rejected';
    pending.reviewerId = reviewerId;
    pending.reviewedAt = new Date().toISOString();

    const client = this.redis.getClient();
    const key = this.getKey(interviewId);
    await client.set(key, JSON.stringify(pending), 'EX', this.HITL_TTL);

    this.logger.log(`[HITL] Rejected for interview ${interviewId} by ${reviewerId}`);
    return true;
  }

  /**
   * 获取所有 pending 的 HITL（给 HR dashboard 用）
   */
  async getAllPending(): Promise<HitlPending[]> {
    const client = this.redis.getClient();
    const keys = await client.keys('hitl:*:pending');

    const pending: HitlPending[] = [];
    for (const key of keys) {
      const data = await client.get(key);
      if (data) {
        try {
          const parsed = JSON.parse(data) as HitlPending;
          if (parsed.status === 'pending') {
            pending.push(parsed);
          }
        } catch {}
      }
    }

    return pending;
  }

  /**
   * 清除 pending 状态
   */
  async clear(interviewId: string): Promise<void> {
    const client = this.redis.getClient();
    const key = this.getKey(interviewId);
    await client.del(key);
    this.logger.log(`[HITL] Cleared for interview ${interviewId}`);
  }

  private getKey(interviewId: string): string {
    return `hitl:${interviewId}:pending`;
  }
}
