import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../infra/redis/redis.service';
import { ChatMessage } from '../interfaces/memory-store.interface';

/**
 * 短期记忆 - Redis 存储
 * 存当前会话的消息历史，带 TTL
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
  }
}
