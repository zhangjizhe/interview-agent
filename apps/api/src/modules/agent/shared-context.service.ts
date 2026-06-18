import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../infra/redis/redis.service';

interface ContextEntry {
  id: string;
  gist: string;
  details: string;
  timestamp: number;
  validator: boolean;
  sourceAgent: string;
  audit: AuditRecord[];
}

interface AuditRecord {
  action: 'create' | 'update' | 'validate' | 'access';
  timestamp: number;
  agentId: string;
  reason?: string;
}

const CTX_PREFIX = 'shared-ctx:';
const CTX_LIST_KEY = 'shared-ctx:ids';
const MAX_ENTRIES = 100;
const TTL_MS = 30 * 60 * 1000;

@Injectable()
export class SharedContextService {
  private readonly logger = new Logger(SharedContextService.name);

  constructor(private redis: RedisService) {}

  /**
   * 写入共享上下文（Redis Hash，跨实例共享）
   * key = shared-ctx:{id}，id 列表存在 shared-ctx:ids (Redis Set)
   */
  async write(
    agentId: string,
    content: string,
    source: 'thinking' | 'tool_result' | 'summary',
  ): Promise<string> {
    const id = `${agentId}-${Date.now()}`;
    const gist = this.extractGist(content);
    const entry: ContextEntry = {
      id,
      gist,
      details: content,
      timestamp: Date.now(),
      validator: await this.validateContent(content),
      sourceAgent: agentId,
      audit: [{ action: 'create', timestamp: Date.now(), agentId, reason: source }],
    };

    const redisKey = `${CTX_PREFIX}${id}`;
    await this.redis.getClient().hset(redisKey, {
      id,
      gist,
      details: content,
      timestamp: entry.timestamp.toString(),
      validator: entry.validator.toString(),
      sourceAgent: agentId,
      audit: JSON.stringify(entry.audit),
    });
    await this.redis.getClient().expire(redisKey, Math.floor(TTL_MS / 1000));

    // 维护 ID 列表（按时间排序的 Set）
    await this.redis.getClient().zadd(CTX_LIST_KEY, entry.timestamp, id);
    await this.cleanup();

    this.logger.debug(`[SharedContext] Written entry ${id} from ${agentId}`);
    return id;
  }

  async read(id: string): Promise<ContextEntry | undefined> {
    const raw = await this.redis.getClient().hgetall(`${CTX_PREFIX}${id}`);
    if (!raw || !raw.id) return undefined;

    const entry: ContextEntry = {
      id: raw.id,
      gist: raw.gist,
      details: raw.details,
      timestamp: parseInt(raw.timestamp, 10),
      validator: raw.validator === 'true',
      sourceAgent: raw.sourceAgent,
      audit: JSON.parse(raw.audit || '[]'),
    };

    // 追加访问审计
    entry.audit.push({ action: 'access', timestamp: Date.now(), agentId: 'reader' });
    await this.redis.getClient().hset(`${CTX_PREFIX}${id}`, 'audit', JSON.stringify(entry.audit));

    return entry;
  }

  listGists(): Promise<{ id: string; gist: string; timestamp: number }[]> {
    return this.redis.getClient().zrange(CTX_LIST_KEY, 0, -1).then(async (ids) => {
      const results: { id: string; gist: string; timestamp: number }[] = [];
      for (const id of ids) {
        const raw = await this.redis.getClient().hgetall(`${CTX_PREFIX}${id}`);
        if (raw && raw.id) {
          results.push({
            id: raw.id,
            gist: raw.gist,
            timestamp: parseInt(raw.timestamp, 10),
          });
        }
      }
      return results;
    });
  }

  async validateContent(content: string): Promise<boolean> {
    try {
      const trimmed = content.trim();
      if (!trimmed) return false;
      if (trimmed.length > 10000) return false;
      const hasEvidence = trimmed.includes('根据') || trimmed.includes('基于') || trimmed.includes('参考');
      return hasEvidence;
    } catch {
      return false;
    }
  }

  private extractGist(content: string): string {
    const sentences = content.split(/[。！？\n]/).filter((s) => s.trim());
    const firstFew = sentences.slice(0, 3).join('。');
    return firstFew.length > 150 ? firstFew.slice(0, 150) + '...' : firstFew;
  }

  /**
   * 清理过期和超出上限的条目
   */
  private async cleanup(): Promise<void> {
    const client = this.redis.getClient();
    const now = Date.now();

    // 删除超过 TTL 的条目
    const expired = await client.zrangebyscore(CTX_LIST_KEY, 0, now - TTL_MS);
    for (const id of expired) {
      await client.del(`${CTX_PREFIX}${id}`);
      await client.zrem(CTX_LIST_KEY, id);
    }

    // 超出 MAX_ENTRIES 时删除最老的
    const count = await client.zcard(CTX_LIST_KEY);
    if (count > MAX_ENTRIES) {
      const toRemove = count - MAX_ENTRIES;
      const oldest = await client.zrange(CTX_LIST_KEY, 0, toRemove - 1);
      for (const id of oldest) {
        await client.del(`${CTX_PREFIX}${id}`);
        await client.zrem(CTX_LIST_KEY, id);
      }
    }
  }

  getAuditLog(id: string): Promise<AuditRecord[] | undefined> {
    return this.redis.getClient().hget(`${CTX_PREFIX}${id}`, 'audit').then((raw) => {
      if (!raw) return undefined;
      try {
        return JSON.parse(raw) as AuditRecord[];
      } catch {
        return undefined;
      }
    });
  }

  clear(): void {
    // Redis 中的数据靠 TTL 自动过期，此处只清理内存中的引用
    this.logger.debug('[SharedContext] clear() called — Redis data expires via TTL');
  }

  size(): Promise<number> {
    return this.redis.getClient().zcard(CTX_LIST_KEY);
  }
}
