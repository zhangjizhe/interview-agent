import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../infra/redis/redis.service';
import { ChatMessage } from '../interfaces/memory-store.interface';

export interface WorkingState {
  currentQuestion?: string;
  questionIndex?: number;
  coveredSkills?: string[];
  scoreHistory?: number[];
  followUpDepth?: number;
  lastUpdateAt?: number;
}

/**
 * 短期记忆 - Redis 存储
 * 存当前会话的消息历史 + 工作状态（工作记忆），带 TTL
 */
@Injectable()
export class RedisShortTermMemory {
  private readonly logger = new Logger(RedisShortTermMemory.name);
  private readonly ttl: number;

  constructor(
    private redis: RedisService,
    private config: ConfigService,
  ) {
    this.ttl = this.config.get<number>('redis.sessionTtl');
  }

  private getKey(sessionId: string): string {
    return `session:${sessionId}:messages`;
  }

  private getStateKey(sessionId: string): string {
    return `session:${sessionId}:state`;
  }

  private getSummaryKey(sessionId: string): string {
    return `session:${sessionId}:summary`;
  }

  async appendMessage(sessionId: string, msg: ChatMessage): Promise<void> {
    const key = this.getKey(sessionId);
    await this.redis.lpush(key, JSON.stringify(msg));
    await this.redis.ltrim(key, 0, 49); // 最多保留 50 条
    await this.redis.expire(key, this.ttl);
  }

  async getRecentMessages(sessionId: string, limit = 20): Promise<ChatMessage[]> {
    const key = this.getKey(sessionId);
    const raw = await this.redis.lrange(key, 0, limit - 1);
    return raw
      .map((s) => {
        try {
          return JSON.parse(s) as ChatMessage;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse(); // lpush 是反的，reverse 回来
  }

  async clearSession(sessionId: string): Promise<void> {
    await this.redis.del(this.getKey(sessionId));
    await this.redis.del(this.getStateKey(sessionId));
    await this.redis.del(this.getSummaryKey(sessionId));
  }

  // ========== 工作记忆（Redis Hash）==========

  async getWorkingState(sessionId: string): Promise<WorkingState> {
    const key = this.getStateKey(sessionId);
    const raw = await this.redis.hgetall(key);
    if (!raw || Object.keys(raw).length === 0) {
      return {};
    }
    try {
      return {
        currentQuestion: raw.currentQuestion || undefined,
        questionIndex: raw.questionIndex ? parseInt(raw.questionIndex, 10) : undefined,
        coveredSkills: raw.coveredSkills ? JSON.parse(raw.coveredSkills) : undefined,
        scoreHistory: raw.scoreHistory ? JSON.parse(raw.scoreHistory) : undefined,
        followUpDepth: raw.followUpDepth ? parseInt(raw.followUpDepth, 10) : undefined,
        lastUpdateAt: raw.lastUpdateAt ? parseInt(raw.lastUpdateAt, 10) : undefined,
      };
    } catch (err) {
      this.logger.warn(`Failed to parse working state: ${err.message}`);
      return {};
    }
  }

  async setWorkingState(sessionId: string, state: WorkingState): Promise<void> {
    const key = this.getStateKey(sessionId);
    const hash: Record<string, string> = {};
    if (state.currentQuestion !== undefined) {
      hash.currentQuestion = state.currentQuestion;
    }
    if (state.questionIndex !== undefined) {
      hash.questionIndex = state.questionIndex.toString();
    }
    if (state.coveredSkills !== undefined) {
      hash.coveredSkills = JSON.stringify(state.coveredSkills);
    }
    if (state.scoreHistory !== undefined) {
      hash.scoreHistory = JSON.stringify(state.scoreHistory);
    }
    if (state.followUpDepth !== undefined) {
      hash.followUpDepth = state.followUpDepth.toString();
    }
    hash.lastUpdateAt = Date.now().toString();

    await this.redis.hmset(key, hash);
    await this.redis.expire(key, this.ttl);
  }

  async updateWorkingState(sessionId: string, partialState: Partial<WorkingState>): Promise<void> {
    const current = await this.getWorkingState(sessionId);
    const merged: WorkingState = { ...current, ...partialState };
    await this.setWorkingState(sessionId, merged);
  }

  async clearWorkingState(sessionId: string): Promise<void> {
    await this.redis.del(this.getStateKey(sessionId));
  }

  // ========== 会话摘要（Redis String）==========

  async getSessionSummary(sessionId: string): Promise<string | null> {
    const key = this.getSummaryKey(sessionId);
    const result = await this.redis.get(key);
    return result || null;
  }

  async setSessionSummary(sessionId: string, summary: string): Promise<void> {
    const key = this.getSummaryKey(sessionId);
    await this.redis.set(key, summary);
    await this.redis.expire(key, this.ttl);
  }

  async clearSessionSummary(sessionId: string): Promise<void> {
    await this.redis.del(this.getSummaryKey(sessionId));
  }
}
