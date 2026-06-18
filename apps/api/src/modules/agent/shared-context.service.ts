import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../infra/redis/redis.service';

export interface ContextEntry {
  id: string;
  gist: string;
  details: string;
  timestamp: number;
  validator: boolean;
  sourceAgent: string;
  audit: AuditRecord[];
}

export interface AuditRecord {
  action: 'create' | 'update' | 'validate' | 'access';
  timestamp: number;
  agentId: string;
  reason?: string;
}

@Injectable()
export class SharedContextService {
  private readonly logger = new Logger(SharedContextService.name);
  private readonly ttlSeconds = 30 * 60;
  private readonly maxEntries = 100;

  constructor(private redis: RedisService) {}

  private getSessionKey(sessionId: string): string {
    return `shared-ctx:${sessionId}`;
  }

  private getAllEntriesKey(): string {
    return 'shared-ctx:all-entries';
  }

  async write(
    sessionId: string,
    agentId: string,
    content: string,
    source: 'thinking' | 'tool_result' | 'summary',
  ): Promise<string> {
    const id = `${sessionId}-${Date.now()}`;
    
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

    const client = this.redis.getClient();
    const sessionKey = this.getSessionKey(sessionId);
    
    await client.hset(sessionKey, id, JSON.stringify(entry));
    await client.expire(sessionKey, this.ttlSeconds);
    
    await client.lpush(this.getAllEntriesKey(), id);
    await client.ltrim(this.getAllEntriesKey(), 0, this.maxEntries - 1);

    this.logger.debug(`[SharedContext] Written entry ${id} from ${agentId} for session ${sessionId}`);
    return id;
  }

  async read(sessionId: string, id: string): Promise<ContextEntry | undefined> {
    const client = this.redis.getClient();
    const sessionKey = this.getSessionKey(sessionId);
    const entryStr = await client.hget(sessionKey, id);
    
    if (!entryStr) return undefined;
    
    try {
      const entry: ContextEntry = JSON.parse(entryStr);
      entry.audit.push({ action: 'access', timestamp: Date.now(), agentId: 'reader' });
      await client.hset(sessionKey, id, JSON.stringify(entry));
      await client.expire(sessionKey, this.ttlSeconds);
      return entry;
    } catch {
      return undefined;
    }
  }

  async listGists(sessionId: string): Promise<{ id: string; gist: string; timestamp: number }[]> {
    const client = this.redis.getClient();
    const sessionKey = this.getSessionKey(sessionId);
    const entries = await client.hgetall(sessionKey);
    
    if (!entries) return [];
    
    return Object.values(entries)
      .map((entryStr) => {
        try {
          const entry: ContextEntry = JSON.parse(entryStr);
          return { id: entry.id, gist: entry.gist, timestamp: entry.timestamp };
        } catch {
          return null;
        }
      })
      .filter((item): item is { id: string; gist: string; timestamp: number } => item !== null);
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

  async getAuditLog(sessionId: string, id: string): Promise<AuditRecord[] | undefined> {
    const entry = await this.read(sessionId, id);
    return entry?.audit;
  }

  async clear(sessionId?: string): Promise<void> {
    const client = this.redis.getClient();
    if (sessionId) {
      await client.del(this.getSessionKey(sessionId));
      this.logger.debug(`[SharedContext] Cleared context for session ${sessionId}`);
    } else {
      const keys = await client.keys('shared-ctx:*');
      if (keys.length > 0) {
        await client.del(...keys);
      }
      this.logger.debug('[SharedContext] Cleared all contexts');
    }
  }

  async size(sessionId?: string): Promise<number> {
    const client = this.redis.getClient();
    if (sessionId) {
      const count = await client.hlen(this.getSessionKey(sessionId));
      return count;
    }
    const keys = await client.keys('shared-ctx:*');
    return keys.length;
  }

  async cleanupExpired(): Promise<void> {
    const client = this.redis.getClient();
    const keys = await client.keys('shared-ctx:*');
    for (const key of keys) {
      const ttl = await client.ttl(key);
      if (ttl === -2) {
        await client.del(key);
        this.logger.debug(`[SharedContext] Cleaned up expired key ${key}`);
      }
    }
  }
}
