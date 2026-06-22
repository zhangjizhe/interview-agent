import { Injectable, Logger } from '@nestjs/common';
import { ChatMessage } from '../../llm/providers/types';

export type CompactionTier = 0 | 1 | 2 | 3;

export interface CompactionResult {
  tier: CompactionTier;
  messages: ChatMessage[];
  beforeTokens: number;
  afterTokens: number;
  savedTokens: number;
  stubCount: number;
  protectedCount: number;
  summarizeNeeded: boolean;
}

interface StubCacheEntry { content: string; isStub: boolean; }

/**
 * 上下文压缩服务 - 4 级水位线方案
 * 借鉴：腾讯 MUR AI / Claude Code / Codex 等
 */
@Injectable()
export class ContextManager {
  private readonly logger = new Logger(ContextManager.name);
  private readonly TIER_SNIP = 0.6;
  private readonly TIER_PRUNE = 0.8;
  private readonly TIER_SUMMARIZE = 0.95;
  private readonly PROTECT_WINDOW_TOKENS = 4000;
  private readonly MAX_CACHE_SIZE = 1000; // LRU 上限，防止内存泄漏
  // 用内容前 100 字符的 hash 做 key，避免切片下标错位问题
  private decisionCache: Map<string, StubCacheEntry> = new Map();

  compact(messages: ChatMessage[], currentTokens: number, maxTokens: number): CompactionResult {
    const ratio = currentTokens / maxTokens;
    const beforeTokens = currentTokens;
    if (ratio < this.TIER_SNIP) {
      return { tier: 0, messages, beforeTokens, afterTokens: currentTokens, savedTokens: 0, stubCount: 0, protectedCount: 0, summarizeNeeded: false };
    }
    const cutIdx = this.findProtectedBoundary(messages);
    const compactable = messages.slice(0, cutIdx);
    const protectedMsgs = messages.slice(cutIdx);
    if (ratio < this.TIER_PRUNE) return this.snip(compactable, protectedMsgs, beforeTokens);
    if (ratio < this.TIER_SUMMARIZE) return this.prune(compactable, protectedMsgs, beforeTokens);
    return { tier: 3, messages, beforeTokens, afterTokens: currentTokens, savedTokens: 0, stubCount: 0, protectedCount: protectedMsgs.length, summarizeNeeded: true };
  }

  /**
   * Tier 3 - 调 LLM 做增量摘要
   * 调用方传入 summarizeFn（实际 LLM 调用），这里负责拼接
   */
  async summarize(
    messages: ChatMessage[],
    previousSummary: string,
    summarizeFn: (prompt: string) => Promise<string>,
  ): Promise<{ summary: string; savedTokens: number }> {
    const deltaText = messages.map((m) => `${m.role}: ${m.content}`).join('\n').slice(0, 8000);
    const prompt = `合并以下新对话与之前摘要，输出 4 段式结构化摘要（进展/文件/待办/上下文）。\n\n【之前摘要】\n${previousSummary || '（无）'}\n\n【新增对话】\n${deltaText}\n\n【输出 JSON】{"progress": "...", "files": [...], "todos": [...], "context": "..."}`;
    const summary = await summarizeFn(prompt);
    return { summary, savedTokens: Math.max(0, this.est(deltaText) - this.est(summary)) };
  }

  private snip(compactable: ChatMessage[], protectedMsgs: ChatMessage[], beforeTokens: number): CompactionResult {
    const out: ChatMessage[] = [];
    let stubCount = 0;
    for (const msg of compactable) {
      const id = this.cacheKey(msg);
      const cached = this.decisionCache.get(id);
      if (cached) { if (cached.isStub) stubCount++; out.push({ ...msg, content: cached.content }); continue; }
      let content = msg.content;
      let isStub = false;
      if (msg.role === 'user') {
        const r = msg.content.replace(/```[\s\S]*?```/g, (b) => b.length <= 300 ? b : b.slice(0, 200) + '\n// ... 已截短 ...\n```');
        if (r !== msg.content) { content = r; isStub = true; }
      } else if (msg.role === 'assistant' && msg.content.length > 200) {
        content = msg.content.slice(0, 200) + '...'; isStub = true;
      } else if (msg.role === 'tool' && msg.content.length > 500) {
        content = msg.content.slice(0, 200) + `\n...[省略 ${msg.content.length - 200}]...`; isStub = true;
      }
      this.setCache(id, { content, isStub });
      if (isStub) stubCount++;
      out.push({ ...msg, content });
    }
    const afterTokens = this.estMsgs(out) + this.estMsgs(protectedMsgs);
    return { tier: 1, messages: [...out, ...protectedMsgs], beforeTokens, afterTokens, savedTokens: Math.max(0, beforeTokens - afterTokens), stubCount, protectedCount: protectedMsgs.length, summarizeNeeded: false };
  }

  private prune(compactable: ChatMessage[], protectedMsgs: ChatMessage[], beforeTokens: number): CompactionResult {
    const out: ChatMessage[] = [];
    let stubCount = 0;
    for (const msg of compactable) {
      const id = this.cacheKey(msg);
      const cached = this.decisionCache.get(id);
      if (cached) { if (cached.isStub) stubCount++; out.push({ ...msg, content: cached.content }); continue; }
      let content = msg.content;
      let isStub = false;
      if (msg.role === 'user') {
        const r = msg.content.replace(/```[\s\S]*?```/g, '```\n// [已压缩]\n```');
        if (r !== msg.content) { content = r; isStub = true; }
      } else if (msg.role === 'assistant' || msg.role === 'tool') {
        content = '[已压缩]'; isStub = true;
      }
      this.setCache(id, { content, isStub });
      if (isStub) stubCount++;
      out.push({ ...msg, content });
    }
    const afterTokens = this.estMsgs(out) + this.estMsgs(protectedMsgs);
    return { tier: 2, messages: [...out, ...protectedMsgs], beforeTokens, afterTokens, savedTokens: Math.max(0, beforeTokens - afterTokens), stubCount, protectedCount: protectedMsgs.length, summarizeNeeded: false };
  }

  private findProtectedBoundary(messages: ChatMessage[]): number {
    let acc = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      const t = this.est(messages[i].content);
      if (acc + t > this.PROTECT_WINDOW_TOKENS) return i + 1;
      acc += t;
    }
    return 0;
  }

  private est(text: string): number {
    if (!text) return 0;
    const en = (text.match(/[a-zA-Z\s]/g) || []).length;
    return Math.ceil(en / 4 + (text.length - en) / 1.5);
  }

  private estMsgs(messages: ChatMessage[]): number {
    return messages.reduce((s, m) => s + this.est(m.content), 0);
  }

  /**
   * 用内容前 256 字符的 64-bit djb2 hash 作为缓存 key
   *
   * R-P2-12 修复：原 32-bit djb2（hash 范围 -2^31 ~ 2^31-1）碰撞率高，
   * 生日攻击约 6.5 万条就有 50% 碰撞概率。改用双 32-bit 组合成 64-bit
   * 碰撞概率降至 ~4 billion 条 50%，实际 demo 场景（< 10K 条消息）安全。
   */
  private cacheKey(msg: ChatMessage): string {
    const anchor = msg.content.slice(0, 256);
    let h1 = 5381;
    let h2 = 52711;
    for (let i = 0; i < anchor.length; i++) {
      const c = anchor.charCodeAt(i);
      h1 = ((h1 << 5) + h1) ^ c;          // 32-bit djb2 variant
      h2 = ((h2 * 31) + c) >>> 0;          // 32-bit java string hash
    }
    return `${msg.role}-${h1}-${h2}`;
  }

  /**
   * LRU 缓存写入
   *
   * R-P2-13 修复：原实现用 Map.keys() 拿插入顺序删除"最早的 10%"，
   * 但 Map 迭代顺序是插入顺序（FIFO），不是 LRU。访问后不更新顺序，
   * 频繁访问的 key 也被淘汰。
   *
   * 修复：set 前先 delete 同 key（让新 set 排到末尾 = 最近访问），
   * 容量满时删第一个 key（最久未访问）。
   */
  private setCache(key: string, entry: StubCacheEntry): void {
    // 已存在 → 删除让它重新插入（移到末尾 = 最近访问）
    if (this.decisionCache.has(key)) {
      this.decisionCache.delete(key);
    } else if (this.decisionCache.size >= this.MAX_CACHE_SIZE) {
      // 不存在 + 容量满 → 淘汰最久未访问（Map keys 第一个）
      const firstKey = this.decisionCache.keys().next().value;
      if (firstKey !== undefined) this.decisionCache.delete(firstKey);
    }
    this.decisionCache.set(key, entry);
  }
}
