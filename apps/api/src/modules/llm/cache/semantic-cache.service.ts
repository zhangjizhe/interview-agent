/**
 * Compatibility name for the Gateway answer cache. v2 requires a complete
 * request fingerprint and uses Redis exact matching with a one-hour TTL.
 * Legacy query-only Redis/Qdrant entries are never read or modified.
 * Provider prompt/input caching remains a separate layer.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { RedisService } from '../../../infra/redis/redis.service';

export type SemanticCacheType =
  | 'interview_question' | 'general_qa' | 'scoring'
  | 'tool_result' | 'resume_parse' | 'report_generate';

export type SemanticCacheResult =
  | { hit: true; cachedResponse: string; similarity: number; cacheId: string }
  | { hit: false; reason: 'disabled' | 'whitelist' | 'context' | 'cold' };

export interface SemanticCacheLookupParams {
  cacheType: SemanticCacheType;
  fingerprint: string;
}
export interface SemanticCacheSetParams extends SemanticCacheLookupParams {
  response: string;
}

export const ANSWER_CACHE_PREFIX = 'sc:answer:v2:';
export const ANSWER_CACHE_TTL_SECONDS = 3600;

@Injectable()
export class SemanticCacheService implements OnModuleInit {
  private readonly logger = new Logger(SemanticCacheService.name);
  private enabled = false;
  private whitelist = new Set<SemanticCacheType>();
  private readonly blacklist = new Set<SemanticCacheType>([
    'scoring', 'tool_result', 'resume_parse', 'report_generate',
  ]);

  constructor(private config: ConfigService, private redis: RedisService) {}

  onModuleInit() {
    this.enabled = this.config.get<string>('semanticCache.enabled') !== 'false';
    this.whitelist = new Set((this.config.get<string>('semanticCache.whitelist') ||
      'interview_question,general_qa').split(',').map(s => s.trim()) as SemanticCacheType[]);
    this.logger.log({ event: 'answer_cache_ready', enabled: this.enabled, contract: 'answer-cache/v2' });
  }

  private rejection(params: SemanticCacheLookupParams): 'disabled' | 'whitelist' | 'context' | undefined {
    if (!this.enabled) return 'disabled';
    if (this.blacklist.has(params.cacheType) || !this.whitelist.has(params.cacheType)) return 'whitelist';
    if (!/^[a-f0-9]{64}$/.test(params.fingerprint || '')) return 'context';
  }

  async lookup(params: SemanticCacheLookupParams): Promise<SemanticCacheResult> {
    const reason = this.rejection(params);
    if (reason) return { hit: false, reason };
    try {
      const exact = await this.redis.get(this.key(params));
      if (exact) {
        const entry = JSON.parse(exact);
        if (entry.contract === 'answer-cache/v2' && entry.fingerprint === params.fingerprint &&
            typeof entry.response === 'string' && entry.response.length > 0 &&
            typeof entry.cacheId === 'string' && entry.cacheId.length > 0) {
          return { hit: true, cachedResponse: entry.response, similarity: 1, cacheId: entry.cacheId };
        }
      }
    } catch {
      this.logger.debug({ event: 'answer_cache_read_unavailable' });
    }
    return { hit: false, reason: 'cold' };
  }

  setAsync(params: SemanticCacheSetParams): void {
    if (this.rejection(params) || !params.response) return;
    // Snapshot before scheduling: callers cannot mutate a pending write.
    const entry = JSON.stringify({ fingerprint: params.fingerprint, response: params.response,
      contract: 'answer-cache/v2', cacheId: randomUUID() });
    const key = this.key(params);
    setImmediate(() => {
      this.redis.set(key, entry, ANSWER_CACHE_TTL_SECONDS).catch(() => {
        this.logger.debug({ event: 'answer_cache_write_unavailable' });
      });
    });
  }

  private key(params: SemanticCacheLookupParams): string {
    return `${ANSWER_CACHE_PREFIX}${params.cacheType}:${params.fingerprint}`;
  }
}
