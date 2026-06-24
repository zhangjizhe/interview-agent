/**
 * 会话级成本面板（P0 配套）
 *
 * 入口：
 *  - startSession(interviewId)   - 面试开始
 *  - recordLlmCall(interviewId, data) - 每次 LLM 调用埋点
 *  - endSession(interviewId)    - 面试结束
 *
 * 存储：Prisma SessionCost + Redis 实时 counter（防 DB 抖动）
 *
 * 响应字段（GET /api/session/:id/cost）：
 *  {
 *    sessionId, totalTokens, llmCalls, promptCacheHits, semanticCacheHits,
 *    cacheSavedTokens, retryRate, fallbackRate, estimatedCostCny, durationMs
 *  }
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RedisService } from '../../../infra/redis/redis.service';

const REDIS_KEY_PREFIX = 'session_cost:';
const REDIS_FLUSH_EVERY = 5; // 每 5 次调用刷一次 DB（防抖）

export interface LlmCallMetric {
  interviewId: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number; // prompt cache 命中 token
  cacheHit: boolean; // semantic cache 命中
  isRetry: boolean;
  isFallback: boolean;
  isError?: boolean;
  durationMs: number;
}

@Injectable()
export class SessionCostTracker implements OnModuleInit {
  private readonly logger = new Logger(SessionCostTracker.name);
  /** 内存 buffer：interviewId → 未刷盘计数 */
  private buffer: Map<string, number> = new Map();

  constructor(private prisma: PrismaService, private redis: RedisService) {}

  async onModuleInit() {
    // 启动时从 Redis 恢复 buffer（用于崩溃恢复）
    // 实际可省略：buffer 是临时累加，崩溃丢失可接受
  }

  async startSession(interviewId: string): Promise<void> {
    // 幂等创建
    await this.prisma.sessionCost.upsert({
      where: { interviewId },
      create: { interviewId, startedAt: new Date() },
      update: { startedAt: new Date() },
    });
    // 清 Redis counter
    await this.redis.del(this.redisKey(interviewId));
  }

  /**
   * 每次 LLM 调用后调用
   * 写入 Redis counter（实时读）+ 累计 N 次后刷 Prisma
   */
  async recordLlmCall(m: LlmCallMetric): Promise<void> {
    // 2026-06-24 防御性修复：interviewId='unknown' / 空值直接 skip
    // （不写 Redis、不累计 buffer、不触发 FK flush）。
    // 调用方已修（dynamic-task-queue / generateReport 显式传 ctx.sessionId），
    // 这层兜底防止将来再有漏传。
    if (!m.interviewId || m.interviewId === 'unknown' || m.interviewId === 'anonymous') {
      this.logger.warn(`[recordLlmCall] skip invalid interviewId=${m.interviewId} (cost tracking only)`);
      return;
    }
    const key = this.redisKey(m.interviewId);
    const redis = this.redis.getClient();

    // Redis HINCRBY pipeline - 实时 counter
    const pipe = redis.pipeline();
    pipe.hincrby(key, 'llmCalls', 1);
    pipe.hincrby(key, 'totalPromptTokens', m.promptTokens);
    pipe.hincrby(key, 'totalCompletionTokens', m.completionTokens);
    pipe.hincrby(key, 'totalTokens', m.promptTokens + m.completionTokens);
    if (m.cachedTokens > 0) {
      pipe.hincrby(key, 'promptCacheHits', 1);
      pipe.hincrby(key, 'cachedTokens', m.cachedTokens);
      // 节省的 token ≈ 命中部分按 input 价 + 实际按 cache 折扣计 → 差值即节省
      pipe.hincrby(key, 'cacheSavedTokens', m.cachedTokens);
    } else if (!m.cacheHit) {
      // 既不是 prompt cache 命中，也不是 semantic cache 命中 → 算 prompt cache miss
      // 但只有同 user 的稳定前缀调用才算 miss；流式首包不算
      // 简化：除 semantic hit 外的都算 miss
      if (m.provider === 'qwen' || m.provider === 'deepseek') {
        pipe.hincrby(key, 'promptCacheMisses', 1);
      }
    }
    if (m.cacheHit) pipe.hincrby(key, 'semanticCacheHits', 1);
    if (m.isRetry) pipe.hincrby(key, 'retries', 1);
    if (m.isFallback) pipe.hincrby(key, 'fallbacks', 1);
    if (m.isError) pipe.hincrby(key, 'errors', 1);
    await pipe.exec();

    // buffer 累加，5 次刷一次 DB
    const buf = (this.buffer.get(m.interviewId) || 0) + 1;
    this.buffer.set(m.interviewId, buf);
    if (buf >= REDIS_FLUSH_EVERY) {
      await this.flushToDb(m.interviewId);
      this.buffer.set(m.interviewId, 0);
    }
  }

  async endSession(interviewId: string): Promise<void> {
    await this.flushToDb(interviewId);
    await this.prisma.sessionCost.update({
      where: { interviewId },
      data: { endedAt: new Date() },
    });
  }

  /** 强刷：用于 GET endpoint 调用时拿到最新值 */
  async flushToDb(interviewId: string): Promise<void> {
    this.logger.warn(`[FLUSH] start interviewId=${interviewId}`);
    // 2026-06-24 防御性修复：interviewId='unknown' 或空值直接 return，
    // 避免对 session_costs 表触发 FK 违反 + 抛错中断主流程。
    // 这是兜底：调用方（dynamic-task-queue / generateReport）现在已修，
    // 不会漏传 interviewId；但如果将来又有调用方漏传，不至于把整个 end
    // 流程炸成"生成报告失败"占位报告。
    if (!interviewId || interviewId === 'unknown' || interviewId === 'anonymous') {
      this.logger.warn(`[FLUSH] skip invalid interviewId=${interviewId} (cost tracking only)`);
      return;
    }
    const key = this.redisKey(interviewId);
    const raw = await this.redis.getClient().hgetall(key);
    if (!raw || Object.keys(raw).length === 0) return;

    // 计算 cost（按 provider 单价，可从 env 读）
    const inputPrice = parseFloat(process.env.QWEN_INPUT_PRICE || '0.004'); // 元/1k tokens
    const outputPrice = parseFloat(process.env.QWEN_OUTPUT_PRICE || '0.012');
    const cacheDiscount = 0.4; // Qwen context cache 折扣

    const totalPrompt = Number(raw.totalPromptTokens || 0);
    const totalCompletion = Number(raw.totalCompletionTokens || 0);
    const cachedTokens = Number(raw.cachedTokens || 0);
    const uncachedPrompt = totalPrompt - cachedTokens;
    const cost =
      (uncachedPrompt / 1000) * inputPrice +
      (cachedTokens / 1000) * inputPrice * cacheDiscount +
      (totalCompletion / 1000) * outputPrice;

    await this.prisma.sessionCost.upsert({
      where: { interviewId },
      create: {
        interviewId,
        llmCalls: Number(raw.llmCalls || 0),
        totalPromptTokens: totalPrompt,
        totalCompletionTokens: totalCompletion,
        totalTokens: totalPrompt + totalCompletion, // 冗余字段，写入时计算
        promptCacheHits: Number(raw.promptCacheHits || 0),
        promptCacheMisses: Number(raw.promptCacheMisses || 0),
        cachedTokens,
        semanticCacheHits: Number(raw.semanticCacheHits || 0),
        semanticCacheMisses: Number(raw.semanticCacheMisses || 0),
        cacheSavedTokens: Number(raw.cacheSavedTokens || 0),
        retries: Number(raw.retries || 0),
        fallbacks: Number(raw.fallbacks || 0),
        errors: Number(raw.errors || 0),
        inputCostPer1k: inputPrice,
        outputCostPer1k: outputPrice,
        cacheDiscount,
        estimatedCostCny: cost,
      },
      update: {
        llmCalls: Number(raw.llmCalls || 0),
        totalPromptTokens: totalPrompt,
        totalCompletionTokens: totalCompletion,
        totalTokens: totalPrompt + totalCompletion, // 同步刷新
        promptCacheHits: Number(raw.promptCacheHits || 0),
        promptCacheMisses: Number(raw.promptCacheMisses || 0),
        cachedTokens,
        semanticCacheHits: Number(raw.semanticCacheHits || 0),
        semanticCacheMisses: Number(raw.semanticCacheMisses || 0),
        cacheSavedTokens: Number(raw.cacheSavedTokens || 0),
        retries: Number(raw.retries || 0),
        fallbacks: Number(raw.fallbacks || 0),
        errors: Number(raw.errors || 0),
        estimatedCostCny: cost,
      },
    }).then(() => {
      this.logger.warn(`[FLUSH] OK interviewId=${interviewId}`);
    }).catch((e) => {
      this.logger.error(`[FLUSH] FAIL interviewId=${interviewId} err=${e.message} code=${e.code} meta=${JSON.stringify(e.meta)}`);
      throw e;
    });
  }

  /**
   * GET /api/session/:id/cost 用的快路径
   * 先 flush 再读 Prisma，1s 内返回
   */
  async getCostPanel(interviewId: string) {
    await this.flushToDb(interviewId);
    const row = await this.prisma.sessionCost.findUnique({ where: { interviewId } });
    if (!row) {
      return {
        sessionId: interviewId,
        totalTokens: 0,
        llmCalls: 0,
        promptCacheHits: 0,
        promptCacheMisses: 0,
        promptCacheHitRate: 0,
        semanticCacheHits: 0,
        semanticCacheMisses: 0,
        semanticCacheHitRate: 0,
        cacheSavedTokens: 0,
        retryRate: 0,
        fallbackRate: 0,
        estimatedCostCny: 0,
        durationMs: 0,
      };
    }

    const promptTotal = row.promptCacheHits + row.promptCacheMisses;
    const semanticTotal = row.semanticCacheHits + row.semanticCacheMisses;
    const durationMs = row.endedAt
      ? row.endedAt.getTime() - row.startedAt.getTime()
      : Date.now() - row.startedAt.getTime();

    return {
      sessionId: interviewId,
      totalTokens: row.totalTokens,
      llmCalls: row.llmCalls,
      promptCacheHits: row.promptCacheHits,
      promptCacheMisses: row.promptCacheMisses,
      promptCacheHitRate: promptTotal > 0 ? +(row.promptCacheHits / promptTotal).toFixed(4) : 0,
      semanticCacheHits: row.semanticCacheHits,
      semanticCacheMisses: row.semanticCacheMisses,
      semanticCacheHitRate: semanticTotal > 0 ? +(row.semanticCacheHits / semanticTotal).toFixed(4) : 0,
      cacheSavedTokens: row.cacheSavedTokens,
      retryRate: row.llmCalls > 0 ? +(row.retries / row.llmCalls).toFixed(4) : 0,
      fallbackRate: row.llmCalls > 0 ? +(row.fallbacks / row.llmCalls).toFixed(4) : 0,
      errors: row.errors,
      estimatedCostCny: +row.estimatedCostCny.toFixed(4),
      durationMs,
    };
  }

  private redisKey(interviewId: string): string {
    return `${REDIS_KEY_PREFIX}${interviewId}`;
  }
}
