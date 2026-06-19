import { Injectable, Logger } from '@nestjs/common';
import { RedisShortTermMemory, type WorkingState } from './short-term/redis-memory.store';
import { MilvusLongTermMemory } from './long-term/milvus-memory.store';
import { Mem0CloudMemory } from './long-term/mem0.store';
import { ChatMessage, Memory } from './interfaces/memory-store.interface';

export type { WorkingState };

interface AuditEntry {
  action: 'create' | 'update' | 'recall' | 'delete' | 'expire';
  timestamp: number;
  userId: string;
  sessionId?: string;
  memoryId?: string;
  reason?: string;
}

interface MemoryMetadata {
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  validated: boolean;
  audit: AuditEntry[];
}

/**
 * 记忆服务 - 四层记忆架构
 *
 * - 工作记忆：Redis Hash（面试流程状态，跨实例安全）
 * - 会话记忆：Redis List（会话上下文，TTL）
 * - 长期记忆：Milvus（向量检索）+ Mem0（语义去重）
 * - 用户画像：Prisma 结构化（面试结果归档）
 *
 * 写入策略：每轮对话 → 工作记忆更新；面试结束 → 结构化归档到长期
 */
@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private memoryMetadata = new Map<string, MemoryMetadata>();
  private readonly TTL_SHORT_TERM = 24 * 60 * 60 * 1000;
  private readonly TTL_LONG_TERM = 30 * 24 * 60 * 60 * 1000;
  private readonly MAX_ACCESS_AGE = 7 * 24 * 60 * 60 * 1000;

  constructor(
    private shortTerm: RedisShortTermMemory,
    private milvus: MilvusLongTermMemory,
    private mem0: Mem0CloudMemory,
  ) {}

  private getMemoryKey(userId: string, content: string): string {
    return `${userId}-${content.slice(0, 50).hashCode()}`;
  }

  private validateMemoryContent(content: string): boolean {
    if (!content || content.trim().length === 0) return false;
    if (content.length > 10000) return false;
    const suspiciousPatterns = [
      /(最新消息|内部消息|机密)/i,
      /(投资|理财|股票|加密货币)/i,
      /(点击这里|立即购买|扫码)/i,
    ];
    return !suspiciousPatterns.some((pattern) => pattern.test(content));
  }

  private recordAudit(memoryKey: string, entry: Omit<AuditEntry, 'timestamp'>): void {
    const metadata = this.memoryMetadata.get(memoryKey) || {
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: 0,
      validated: false,
      audit: [],
    };
    metadata.audit.push({ ...entry, timestamp: Date.now() });
    this.memoryMetadata.set(memoryKey, metadata);
  }

  private async cleanupExpiredMemories(userId: string): Promise<void> {
    const now = Date.now();
    const expiredKeys: string[] = [];

    this.memoryMetadata.forEach((metadata, key) => {
      if (key.startsWith(userId) && now - metadata.lastAccessedAt > this.MAX_ACCESS_AGE) {
        expiredKeys.push(key);
        this.recordAudit(key, { action: 'expire', userId, reason: '长期未访问' });
      }
    });

    expiredKeys.forEach((key) => {
      this.memoryMetadata.delete(key);
    });

    if (expiredKeys.length > 0) {
      this.logger.debug(`[Memory] Cleaned up ${expiredKeys.length} expired memories for ${userId}`);
    }
  }

  // ===== 短期（会话记忆）=====
  async appendMessage(sessionId: string, msg: ChatMessage): Promise<void> {
    const isValid = this.validateMemoryContent(msg.content);
    if (!isValid) {
      this.logger.warn(`[Memory] Invalid content rejected for session ${sessionId}`);
      return;
    }
    await this.shortTerm.appendMessage(sessionId, msg);
  }

  async getRecentMessages(sessionId: string, limit = 20): Promise<ChatMessage[]> {
    return this.shortTerm.getRecentMessages(sessionId, limit);
  }

  async clearSession(sessionId: string): Promise<void> {
    this.recordAudit(sessionId, { action: 'delete', userId: 'unknown', reason: 'session cleared' });
    return this.shortTerm.clearSession(sessionId);
  }

  // ===== 工作记忆（Redis Hash）=====
  async getWorkingState(sessionId: string): Promise<WorkingState> {
    return this.shortTerm.getWorkingState(sessionId);
  }

  async setWorkingState(sessionId: string, state: WorkingState): Promise<void> {
    return this.shortTerm.setWorkingState(sessionId, state);
  }

  async updateWorkingState(sessionId: string, partialState: Partial<WorkingState>): Promise<void> {
    return this.shortTerm.updateWorkingState(sessionId, partialState);
  }

  async clearWorkingState(sessionId: string): Promise<void> {
    return this.shortTerm.clearWorkingState(sessionId);
  }

  // ===== 会话摘要（Redis String）=====
  async getSessionSummary(sessionId: string): Promise<string | null> {
    return this.shortTerm.getSessionSummary(sessionId);
  }

  async setSessionSummary(sessionId: string, summary: string): Promise<void> {
    return this.shortTerm.setSessionSummary(sessionId, summary);
  }

  async clearSessionSummary(sessionId: string): Promise<void> {
    return this.shortTerm.clearSessionSummary(sessionId);
  }

  // ===== 长期 - 双写策略 =====
  async memorize(userId: string, messages: ChatMessage[]): Promise<void> {
    const validMessages = messages.filter((m) => this.validateMemoryContent(m.content));
    if (validMessages.length !== messages.length) {
      this.logger.warn(`[Memory] Filtered ${messages.length - validMessages.length} invalid messages`);
    }

    const memoryKey = this.getMemoryKey(userId, validMessages.map((m) => m.content).join('|'));
    this.recordAudit(memoryKey, { action: 'create', userId, reason: 'memorize' });

    const results = await Promise.allSettled([
      this.milvus.memorize(userId, validMessages, 'conversation'),
      this.mem0.memorize(userId, validMessages),
    ]);

    results.forEach((r, i) => {
      const target = i === 0 ? 'Milvus' : 'Mem0';
      if (r.status === 'rejected') {
        this.logger.warn(`${target} memorize failed: ${r.reason}`);
      } else {
        this.logger.debug(`${target} memorize ok`);
      }
    });

    await this.cleanupExpiredMemories(userId);
  }

  async recall(userId: string, query: string, limit = 5): Promise<Memory[]> {
    if (!this.validateMemoryContent(query)) {
      this.logger.warn(`[Memory] Invalid query rejected for user ${userId}`);
      return [];
    }

    const results = await Promise.allSettled([
      this.milvus.recall(userId, query, limit),
      this.mem0.recall(userId, query, limit),
    ]);

    const milvusMemories = results[0].status === 'fulfilled' ? results[0].value : [];
    const mem0Memories = results[1].status === 'fulfilled' ? results[1].value : [];

    const seen = new Set<string>();
    const merged: Memory[] = [];
    for (const m of [...milvusMemories, ...mem0Memories]) {
      const key = m.content.slice(0, 50);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(m);

        const memoryKey = this.getMemoryKey(userId, m.content);
        const metadata = this.memoryMetadata.get(memoryKey);
        if (metadata) {
          metadata.lastAccessedAt = Date.now();
          metadata.accessCount++;
          this.memoryMetadata.set(memoryKey, metadata);
        }
        this.recordAudit(memoryKey, { action: 'recall', userId, reason: 'query' });
      }
    }

    return merged.slice(0, limit);
  }

  async getAllMemories(userId: string): Promise<Memory[]> {
    const milvus = await this.milvus.getAll(userId).catch(() => []);
    const mem0 = await this.mem0.getAll(userId).catch(() => []);
    return [...milvus, ...mem0];
  }

  async buildContext(sessionId: string, userId: string, query: string) {
    const [recent, recalled] = await Promise.all([
      this.shortTerm.getRecentMessages(sessionId, 10),
      this.recall(userId, query, 5),
    ]);

    const freshRecalled = recalled.filter((m) => {
      const age = Date.now() - ((m as any).timestamp || 0);
      return age < this.TTL_LONG_TERM;
    });

    return {
      longTermContext: freshRecalled.map((m) => m.content).join('\n'),
      shortTermMessages: recent,
      recalledMemories: freshRecalled,
    };
  }

  async getAuditLog(userId: string): Promise<AuditEntry[]> {
    const logs: AuditEntry[] = [];
    this.memoryMetadata.forEach((metadata, key) => {
      if (key.startsWith(userId)) {
        logs.push(...metadata.audit);
      }
    });
    return logs.sort((a, b) => b.timestamp - a.timestamp);
  }

  async invalidateMemory(userId: string, content: string): Promise<void> {
    const memoryKey = this.getMemoryKey(userId, content);
    this.recordAudit(memoryKey, { action: 'delete', userId, reason: 'invalidated' });
    this.memoryMetadata.delete(memoryKey);
  }
}

declare global {
  interface String {
    hashCode(): number;
  }
}

String.prototype.hashCode = function (): number {
  let hash = 0;
  for (let i = 0; i < this.length; i++) {
    const char = this.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash;
};
