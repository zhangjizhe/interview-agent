/**
 * ContextManager 4 级水位线边界测试（任务 1 候选 spec 之一）
 *
 * 覆盖 P0-2 4 级水位线压缩：
 *  - tier=0（0-60%）：不压缩
 *  - tier=1（60-80%）：SNIP（剪裁单条消息尾部）
 *  - tier=2（80-95%）：PRUNE（删除中间消息）
 *  - tier=3（95%+）：SUMMARIZE（标记需要 LLM 摘要）
 *
 * 设计要点：
 *  - REPL 实测确认字段名：实际返回是 `messages` + `tier`（不是现有 spec 用的 `keptMessages` + `compressionLevel`）
 *  - 直接 new ContextManager（0 NestJS 依赖）
 *  - 测试 4 级水位线触发边界 + savedTokens + summarizeNeeded 标志
 *
 * 已知问题（不在本 commit 范围）：现有 context-manager.watermark.spec.ts 用错误字段名
 * keptMessages/compressionLevel，jest 实际运行时是否抛错待确认。
 */
import { ContextManager } from '../modules/agent/services/context-manager.service';

describe('ContextManager 4-Level Waterline Boundaries（正确字段名）', () => {
  const svc = new ContextManager();
  const MAX_TOKENS = 128000;

  /**
   * 构造 N 条相同 token 的消息
   */
  function buildMessages(count: number, tokensPerMsg: number) {
    const msgs: any[] = [];
    for (let i = 0; i < count; i++) {
      msgs.push({
        role: i % 2 === 0 ? 'user' : 'assistant' as any,
        content: `Message ${i}`,
        createdAt: new Date().toISOString(),
        _estimatedTokens: tokensPerMsg,
      });
    }
    return msgs;
  }

  it('tier=0（< 60%）：不压缩，messages 全保留', () => {
    // 50% of 128000 = 64000 tokens, 100 msgs * 640 each
    const msgs = buildMessages(100, 640);
    const r = svc.compact(msgs, 64000, MAX_TOKENS);
    expect(r.tier).toBe(0);
    expect(r.messages.length).toBe(100);
    expect(r.savedTokens).toBe(0);
    expect(r.summarizeNeeded).toBe(false);
  });

  it('tier=1（60-80%）：SNIP（剪裁尾部，savedTokens > 0）', () => {
    // 72% of 128000 = 92160 tokens
    const msgs = buildMessages(100, 922);
    const r = svc.compact(msgs, 92160, MAX_TOKENS);
    expect(r.tier).toBe(1);
    expect(r.savedTokens).toBeGreaterThan(0);  // 实际剪裁掉了 token
    expect(r.summarizeNeeded).toBe(false);
  });

  it('tier=2（80-95%）：PRUNE（删除中间消息，savedTokens > 0）', () => {
    // 87% of 128000 = 111360 tokens
    const msgs = buildMessages(100, 1114);
    const r = svc.compact(msgs, 111360, MAX_TOKENS);
    expect(r.tier).toBe(2);
    expect(r.savedTokens).toBeGreaterThan(0);
    expect(r.summarizeNeeded).toBe(false);
  });

  it('tier=3（≥ 95%）：SUMMARIZE（标记需要 LLM 摘要）', () => {
    // 95% of 128000 = 121600 tokens
    const msgs = buildMessages(100, 1216);
    const r = svc.compact(msgs, 121600, MAX_TOKENS);
    expect(r.tier).toBe(3);
    expect(r.summarizeNeeded).toBe(true);
  });

  it('边界 case：极低 ratio（10%）→ tier=0，messages 全保留', () => {
    const msgs = buildMessages(100, 128);  // 12800 tokens = 10%
    const r = svc.compact(msgs, 12800, MAX_TOKENS);
    expect(r.tier).toBe(0);
    expect(r.messages.length).toBe(100);
    expect(r.savedTokens).toBe(0);
  });

  it('边界 case：超满（100%）→ tier=3，summarize 触发', () => {
    const msgs = buildMessages(100, 1280);  // 128000 tokens = 100%
    const r = svc.compact(msgs, 128000, MAX_TOKENS);
    expect(r.tier).toBe(3);
    expect(r.summarizeNeeded).toBe(true);
  });
});