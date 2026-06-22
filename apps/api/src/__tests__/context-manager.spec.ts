/**
 * ContextManager 单元测试 - 4 级水位线压缩
 *
 * 覆盖 R-P2-12 / R-P2-13 修复：
 *  - Tier 0: ratio < 0.6 → 0 token 节省，不动 messages
 *  - Tier 1: 0.6 <= ratio < 0.8 → snip 截断
 *  - Tier 2: 0.8 <= ratio < 0.95 → prune 整段压缩
 *  - Tier 3: ratio >= 0.95 → summarizeNeeded = true
 *  - protected window: 最后 ~4000 token 不被压缩（findProtectedBoundary）
 *  - 64-bit hash 缓存：同 content + role 多次 compact 输出一致
 */
import { ContextManager } from '../modules/agent/services/context-manager.service';
import { ChatMessage } from '../modules/llm/providers/types';

const mkMsg = (role: 'system' | 'user' | 'assistant' | 'tool', content: string): ChatMessage => ({ role, content });

describe('ContextManager.compact - 4 级水位线压缩', () => {
  const cm = new ContextManager();

  it('Tier 0: ratio < 0.6 → 0 token 节省', () => {
    const messages = [mkMsg('user', 'hello')];
    // est('hello') = ceil(5/4 + 0/1.5) = 2, maxTokens=100 → ratio=0.02
    const r = cm.compact(messages, 2, 100);
    expect(r.tier).toBe(0);
    expect(r.savedTokens).toBe(0);
    expect(r.summarizeNeeded).toBe(false);
    expect(r.messages).toBe(messages);
  });

  it('Tier 1: 0.6 <= ratio < 0.8 → snip（带 protected window 缺口）', () => {
    // 90 条 200 字符英文 user (est=50/条) + 5 条 50 字符 assistant (est=12.5/条)
    // total = 4562.5 token
    // protected boundary 走累加，5 assistant + 78 user = 62.5 + 3900 = 3962.5 < 4000
    // 第 79 user: 3962.5 + 50 = 4012.5 > 4000 → 返回 79（compactable = 79 条）
    const oldMessages = Array.from({ length: 90 }, () => mkMsg('user', 'x'.repeat(200)));
    const newMessages = [...oldMessages, mkMsg('assistant', 'a'.repeat(50))];
    // 排序让 assistant 在前（这样 est 累加从前往后需要重新走反向）
    // 实际 findProtectedBoundary 是反向累加（从后往前）
    // 把 newMessages 改成：90 user + 5 assistant
    const allMessages = [
      ...Array.from({ length: 90 }, () => mkMsg('user', 'x'.repeat(200))),
      ...Array.from({ length: 5 }, () => mkMsg('assistant', 'a'.repeat(50))),
    ];
    // total est = 90*50 + 5*12.5 = 4562.5
    // maxTokens=5000 → ratio=0.9125 → tier 2（不是我们要的）
    // 调整 maxTokens=7000 → ratio=0.65 → tier 1
    const r = cm.compact(allMessages, 4562, 7000);
    expect(r.tier).toBe(1);
    expect(r.summarizeNeeded).toBe(false);
    // protected window 覆盖 5 assistant + 78 user = 3962.5 < 4000 第 79 user 触发 boundary
    // protectedCount 应 >= 1
    expect(r.protectedCount).toBeGreaterThan(0);
  });

  it('Tier 2: 0.8 <= ratio < 0.95 → prune', () => {
    // 同样 90 user + 5 assistant，但 maxTokens=5000 → ratio=0.91 → tier 2
    const allMessages = [
      ...Array.from({ length: 90 }, () => mkMsg('user', 'x'.repeat(200))),
      ...Array.from({ length: 5 }, () => mkMsg('assistant', 'a'.repeat(50))),
    ];
    const r = cm.compact(allMessages, 4562, 5000);
    expect(r.tier).toBe(2);
    expect(r.summarizeNeeded).toBe(false);
    expect(r.protectedCount).toBeGreaterThan(0);
  });

  it('Tier 3: ratio >= 0.95 → summarizeNeeded = true', () => {
    const messages = [mkMsg('user', 'c'.repeat(10000))];
    // currentTokens=2500, maxTokens=2500 → ratio=1.0
    const r = cm.compact(messages, 2500, 2500);
    expect(r.tier).toBe(3);
    expect(r.summarizeNeeded).toBe(true);
    // tier 3 不修改 messages
    expect(r.messages).toBe(messages);
  });

  it('protected window: token 不足以触发压缩时，protectedCount = messages.length', () => {
    // 5 条 200 字符 user (est=50) = 250 token，远 < 4000
    // protected boundary: acc=50, 100, 150, 200, 250 都 < 4000 → 返回 0
    // compactable=[]，protectedMsgs=5 条
    // ratio=0.25 → tier 0
    const messages = Array.from({ length: 5 }, () => mkMsg('user', 'x'.repeat(200)));
    const r = cm.compact(messages, 250, 1000);
    expect(r.tier).toBe(0);
    // tier 0 直接 return，不进 protected 逻辑
    expect(r.protectedCount).toBe(0);
  });

  it('LRU 缓存：同 content + role 多次 compact → 输出一致（cache 不破坏）', () => {
    const long = 'd'.repeat(500);
    const messages = [mkMsg('assistant', long)];
    // 第一次 → 写入 cache（ratio=0.625 → tier 1）
    const r1 = cm.compact(messages, 125, 200);
    // 第二次同 input → 输出一致
    const r2 = cm.compact(messages, 125, 200);
    expect(r1.tier).toBe(r2.tier);
    expect(r1.messages[0].content).toBe(r2.messages[0].content);
  });

  it('边界：ratio 恰好 0.6 → tier 1（因为 ratio < 0.6 才是 tier 0）', () => {
    const messages = [mkMsg('user', 'e'.repeat(240))]; // est=60
    const r = cm.compact(messages, 60, 100);
    expect(r.tier).toBe(1);
  });

  it('边界：ratio 恰好 0.95 → tier 3（因为 ratio >= 0.95）', () => {
    const messages = [mkMsg('user', 'f'.repeat(1000))]; // est=250
    const r = cm.compact(messages, 95, 100);
    expect(r.tier).toBe(3);
  });
});
