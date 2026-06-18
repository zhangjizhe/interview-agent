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

  /** 用内容前 100 字符的 hash 作为缓存 key，避免切片下标错位 */
  private cacheKey(msg: ChatMessage): string {
    const anchor = msg.content.slice(0, 100);
    let hash = 0;
    for (let i = 0; i < anchor.length; i++) {
      const char = anchor.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `${msg.role}-${hash}`;
  }

  /** 带 LRU 上限的缓存写入 */
  private setCache(key: string, entry: StubCacheEntry): void {
    if (this.decisionCache.size >= this.MAX_CACHE_SIZE) {
      // 简单策略：清除最早的 10% 条目
      const keys = this.decisionCache.keys();
      let count = Math.floor(this.MAX_CACHE_SIZE * 0.1);
      for (const k of keys) {
        if (count-- <= 0) break;
        this.decisionCache.delete(k);
      }
    }
    this.decisionCache.set(key, entry);
  }
}
