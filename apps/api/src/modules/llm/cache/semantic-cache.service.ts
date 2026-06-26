/**
 * 语义缓存服务（P0-2）
 *
 * 作用：相同语义的提问 → 复用之前的 LLM 回复，避免重复推理
 *
 * 关键设计：
 *  - embedding 走 Qwen text-embedding-v3（v13 已有 OpenAI 兼容 client，零新增依赖）
 *  - 向量存 Qdrant（payload 含 role / userId / cacheType / 原文 hash）
 *  - 相似度阈值 0.92（白名单启用：interview_question / general_qa）
 *  - 评分题强制 miss（payload.cacheType === 'scoring' 跳过）
 *  - 异步 set：不阻塞主调用路径
 *  - 埋点：hit / miss 计数走 SessionCostTracker
 *
 * Redis 角色：仍然存"精确 cacheKey 命中"的快速层（Qdrant 查询前先 hash）
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { randomUUID } from 'crypto';
import { QdrantService } from '../../../infra/qdrant/qdrant.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { fnv1a } from './prompt-cache.strategy';

export type SemanticCacheType =
  | 'interview_question' // ✅ 启用（白名单）
  | 'general_qa' // ✅ 启用
  | 'scoring' // ❌ 强制 miss
  | 'tool_result' // ❌ 强制 miss（工具结果不该缓存）
  | 'resume_parse' // ❌ 强制 miss（个性化强）
  | 'report_generate'; // ❌ 强制 miss

export interface SemanticCacheHit {
  hit: true;
  cachedResponse: string;
  similarity: number;
  cacheId: string;
}

export interface SemanticCacheMiss {
  hit: false;
  reason: 'disabled' | 'whitelist' | 'low_similarity' | 'cold';
}

export type SemanticCacheResult = SemanticCacheHit | SemanticCacheMiss;

export interface SemanticCacheSetParams {
  userId: string;
  cacheType: SemanticCacheType;
  query: string;
  response: string;
  metadata?: Record<string, any>;
}

export interface SemanticCacheLookupParams {
  userId: string;
  cacheType: SemanticCacheType;
  query: string;
  /** 命中相似度阈值，默认 0.92 */
  threshold?: number;
}

const COLLECTION = 'semantic_cache';
const VECTOR_SIZE = 1024; // Qwen text-embedding-v3 默认 1024 维
const REDIS_HASH_PREFIX = 'sc:hash:'; // exact-match fast path
const REDIS_TTL_SECONDS = 3600;

@Injectable()
export class SemanticCacheService implements OnModuleInit {
  private readonly logger = new Logger(SemanticCacheService.name);
  private embedder: OpenAI;
  private enabled: boolean;
  private whitelist: Set<SemanticCacheType>;

  /** Provider 无关的强制 miss 类型（涉及个性化、评估、副作用） */
  private readonly blacklist = new Set<SemanticCacheType>([
    'scoring',
    'tool_result',
    'resume_parse',
    'report_generate',
  ]);

  constructor(
    private config: ConfigService,
    private qdrant: QdrantService,
    private redis: RedisService,
  ) {}

  async onModuleInit() {
    this.enabled = this.config.get<string>('semanticCache.enabled') !== 'false';
    const whitelistCfg =
      this.config.get<string>('semanticCache.whitelist') || 'interview_question,general_qa';
    this.whitelist = new Set(whitelistCfg.split(',').map((s) => s.trim()) as SemanticCacheType[]);

    // 复用 Qwen 客户端做 embedding
    this.embedder = new OpenAI({
      apiKey: this.config.get<string>('qwen.apiKey'),
      baseURL: this.config.get<string>('qwen.baseUrl'),
    });

    if (this.enabled) {
      await this.ensureCollection();
    }
    this.logger.log(
      `✅ SemanticCache ready (enabled=${this.enabled}, whitelist=${[...this.whitelist].join(',')})`,
    );
  }

  private async ensureCollection() {
    try {
      const client = this.qdrant.getClient();
      const collections = await client.getCollections();
      const exists = collections.collections?.some((c) => c.name === COLLECTION);
      if (!exists) {
        await client.createCollection(COLLECTION, {
          vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
        });
        // 建索引
        await client.createPayloadIndex(COLLECTION, {
          field_name: 'userId',
          field_schema: 'keyword',
        });
        await client.createPayloadIndex(COLLECTION, {
          field_name: 'cacheType',
          field_schema: 'keyword',
        });
        this.logger.log(`Created Qdrant collection ${COLLECTION}`);
      }
    } catch (err: any) {
      this.logger.warn(`Qdrant collection init failed: ${err.message}`);
    }
  }

  /**
   * 查缓存
   * 1. 黑名单直接 miss
   * 2. 不在白名单直接 miss
   * 3. 先查 Redis hash 精确桶
   * 4. 桶未命中则 embedding + Qdrant cosine
   */
  async lookup(params: SemanticCacheLookupParams): Promise<SemanticCacheResult> {
    if (!this.enabled) return { hit: false, reason: 'disabled' };
    if (this.blacklist.has(params.cacheType)) return { hit: false, reason: 'whitelist' };
    if (!this.whitelist.has(params.cacheType)) return { hit: false, reason: 'whitelist' };

    // Fast path:精确 hash
    const fastKey = this.fastKey(params.userId, params.cacheType, params.query);
    try {
      const exact = await this.redis.get(fastKey);
      if (exact) {
        const parsed = JSON.parse(exact) as { response: string; cacheId: string };
        return { hit: true, cachedResponse: parsed.response, similarity: 1.0, cacheId: parsed.cacheId };
      }
    } catch (e) {
      // Redis 故障不阻塞主流程
    }

    // Slow path:embedding 检索
    let vector: number[];
    try {
      vector = await this.embed(params.query);
    } catch (err: any) {
      this.logger.warn(`embedding failed, miss: ${err.message}`);
      return { hit: false, reason: 'cold' };
    }

    try {
      const client = this.qdrant.getClient();
      const threshold = params.threshold ?? 0.92;
      const search = await client.search(COLLECTION, {
        vector,
        limit: 1,
        score_threshold: threshold,
        filter: {
          must: [
            { key: 'userId', match: { value: params.userId } },
            { key: 'cacheType', match: { value: params.cacheType } },
          ],
        },
        with_payload: true,
      });

      if (search.length === 0) return { hit: false, reason: 'low_similarity' };

      const top = search[0];
      const payload = top.payload as { response: string; cacheId: string };
      return {
        hit: true,
        cachedResponse: payload.response,
        similarity: top.score,
        cacheId: payload.cacheId,
      };
    } catch (err: any) {
      this.logger.warn(`Qdrant search failed, miss: ${err.message}`);
      return { hit: false, reason: 'cold' };
    }
  }

  /**
   * 写缓存 - 异步，不阻塞主调用
   * 失败也不抛（缓存是优化路径，不应影响主流程）
   */
  setAsync(params: SemanticCacheSetParams): void {
    if (!this.enabled) return;
    if (this.blacklist.has(params.cacheType)) return;
    if (!this.whitelist.has(params.cacheType)) return;

    // 异步：setImmediate 让出当前 tick
    setImmediate(() => {
      this.setInternal(params).catch((err) => {
        this.logger.debug(`semantic-cache set failed (silent): ${err.message}`);
      });
    });
  }

  private async setInternal(params: SemanticCacheSetParams): Promise<void> {
    const vector = await this.embed(params.query);
    const cacheId = randomUUID();
    const client = this.qdrant.getClient();
    await client.upsert(COLLECTION, {
      wait: false,
      points: [
        {
          id: cacheId,
          vector,
          payload: {
            userId: params.userId,
            cacheType: params.cacheType,
            query: params.query,
            response: params.response,
            createdAt: Date.now(),
            ...params.metadata,
          },
        },
      ],
    });
    // Redis 精确层
    const fastKey = this.fastKey(params.userId, params.cacheType, params.query);
    await this.redis.set(
      fastKey,
      JSON.stringify({ response: params.response, cacheId }),
      REDIS_TTL_SECONDS,
    );
  }

  private async embed(text: string): Promise<number[]> {
    const res = await this.embedder.embeddings.create({
      model: 'text-embedding-v3',
      input: text.slice(0, 2048),
      encoding_format: 'float',
      dimensions: VECTOR_SIZE,
    } as any);
    return res.data[0].embedding as number[];
  }

  private fastKey(userId: string, cacheType: SemanticCacheType, query: string): string {
    const hash = fnv1a(`${userId}::${cacheType}::${query.trim().toLowerCase()}`).toString(16);
    return `${REDIS_HASH_PREFIX}${cacheType}:${userId}:${hash}`;
  }
}
