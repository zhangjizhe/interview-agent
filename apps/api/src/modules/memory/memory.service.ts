import { Injectable, Logger } from '@nestjs/common';
import { RedisShortTermMemory } from './short-term/redis-memory.store';
import { MilvusLongTermMemory } from './long-term/milvus-memory.store';
import { Mem0CloudMemory } from './long-term/mem0.store';
import { ChatMessage, Memory } from './interfaces/memory-store.interface';

/**
 * 记忆服务 - 写真实 Milvus + Mem0 双引擎
 *
 * - 短期：Redis List（会话上下文，TTL）
 * - 长期：Milvus（自建向量库，写真实） + Mem0（云服务，自动去重）
 *
 * Mem0 启用时：memorize 同时写两边（Milvus 作本地索引，Mem0 作云端去重）
 * Mem0 失败时：自动降级到只写 Milvus
 */
@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    private shortTerm: RedisShortTermMemory,
    private milvus: MilvusLongTermMemory,
    private mem0: Mem0CloudMemory,
  ) {}

  // ===== 短期 =====
  async appendMessage(sessionId: string, msg: ChatMessage): Promise<void> {
    return this.shortTerm.appendMessage(sessionId, msg);
  }

  async getRecentMessages(sessionId: string, limit = 20): Promise<ChatMessage[]> {
    return this.shortTerm.getRecentMessages(sessionId, limit);
  }

  async clearSession(sessionId: string): Promise<void> {
    return this.shortTerm.clearSession(sessionId);
  }

  // ===== 长期 - 双写策略 =====
  async memorize(userId: string, messages: ChatMessage[]): Promise<void> {
    // 写真实：双写 Milvus + Mem0
    const results = await Promise.allSettled([
      this.milvus.memorize(userId, messages, 'conversation'),
      this.mem0.memorize(userId, messages),
    ]);

    results.forEach((r, i) => {
      const target = i === 0 ? 'Milvus' : 'Mem0';
      if (r.status === 'rejected') {
        this.logger.warn(`${target} memorize failed: ${r.reason}`);
      } else {
        this.logger.debug(`${target} memorize ok`);
      }
    });
  }

  async recall(userId: string, query: string, limit = 5): Promise<Memory[]> {
    // 写真实：优先 Milvus（更快），Mem0 作补充
    const results = await Promise.allSettled([
      this.milvus.recall(userId, query, limit),
      this.mem0.recall(userId, query, limit),
    ]);

    const milvusMemories = results[0].status === 'fulfilled' ? results[0].value : [];
    const mem0Memories = results[1].status === 'fulfilled' ? results[1].value : [];

    // 合并去重（按内容前 50 字符）
    const seen = new Set<string>();
    const merged: Memory[] = [];
    for (const m of [...milvusMemories, ...mem0Memories]) {
      const key = m.content.slice(0, 50);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(m);
      }
    }

    return merged.slice(0, limit);
  }

  async getAllMemories(userId: string): Promise<Memory[]> {
    const milvus = await this.milvus.getAll(userId).catch(() => []);
    const mem0 = await this.mem0.getAll(userId).catch(() => []);
    return [...milvus, ...mem0];
  }

  /**
   * 构建上下文 - 短期 + 长期召回
   */
  async buildContext(sessionId: string, userId: string, query: string) {
    const [recent, recalled] = await Promise.all([
      this.shortTerm.getRecentMessages(sessionId, 10),
      this.recall(userId, query, 5),
    ]);

    return {
      longTermContext: recalled.map((m) => m.content).join('\n'),
      shortTermMessages: recent,
      recalledMemories: recalled,
    };
  }
}