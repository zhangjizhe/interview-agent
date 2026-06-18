/**
 * 烟囱测试 - 验证 jest 链路 + 核心纯函数(无 Nest 依赖,单测友好)
 *
 * 设计原则:
 *  - 只测纯函数,无 mock、无 DI、最小依赖
 *  - 让 `npm test` 在没有真实 DB / Redis / LLM 时也能跑过
 *  - 复杂链路测试见 tests/cache.spec.ts (node:test) 与 __tests__/*.spec.ts (TODO: 重写)
 */
import {
  classifyMessages,
  classifyMessages3,
  buildPromptCacheContext,
  extractCacheUsage,
  fingerprintToolset,
  fnv1a,
  estimateTokens,
} from '../modules/llm/cache/prompt-cache.strategy';
import {
  extractFirstJsonObject,
  safeJsonParse,
  stripJsonFence,
} from '../common/json-extract';

describe('jest smoke - prompt-cache 纯函数', () => {
  it('classifyMessages: system 进 SYSTEM,其他进 DYNAMIC', () => {
    const msgs = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'a' },
    ];
    const r = classifyMessages(msgs);
    const kinds = r.segments.map((s) => s.kind);
    expect(kinds).toEqual(['SYSTEM', 'DYNAMIC']);
    expect(r.cacheableIndices).toEqual([0]);
  });

  it('classifyMessages3: dynStart 切分 3 段', () => {
    const msgs = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'few-shot-1' },
      { role: 'user', content: 'real-q' },
    ];
    const r = classifyMessages3(msgs, 2); // 前 2 条为静态
    const kinds = r.segments.map((s) => s.kind);
    expect(kinds).toContain('SYSTEM');
    expect(kinds).toContain('SEMI_STATIC');
    expect(kinds).toContain('DYNAMIC');
  });

  it('buildPromptCacheContext: 同输入同 key', () => {
    const a = buildPromptCacheContext({
      userId: 'u1',
      systemVersion: 'v1',
      messages: [{ role: 'system', content: 'sys' }],
      protocol: 'openai_compat',
    });
    const b = buildPromptCacheContext({
      userId: 'u1',
      systemVersion: 'v1',
      messages: [{ role: 'system', content: 'sys' }],
      protocol: 'openai_compat',
    });
    expect(a.promptCacheKey).toBe(b.promptCacheKey);
  });

  it('extractCacheUsage: OpenAI cached_tokens', () => {
    const r = extractCacheUsage({
      prompt_tokens: 1000,
      prompt_tokens_details: { cached_tokens: 700 },
    });
    expect(r.cachedTokens).toBe(700);
    expect(r.totalPromptTokens).toBe(1000);
  });

  it('fingerprintToolset: 顺序无关', () => {
    const t1 = fingerprintToolset([{ function: { name: 'a' } }, { function: { name: 'b' } }]);
    const t2 = fingerprintToolset([{ function: { name: 'b' } }, { function: { name: 'a' } }]);
    expect(t1.hash).toBe(t2.hash);
  });

  it('fnv1a: 稳定 + 空串', () => {
    expect(fnv1a('hello')).toBe(fnv1a('hello'));
    expect(fnv1a('')).toBe(0x811c9dc5 >>> 0);
  });

  it('estimateTokens: 中英文粗估', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('你好你好')).toBe(3);
  });
});

describe('jest smoke - json-extract 纯函数', () => {
  it('extractFirstJsonObject: 简单对象', () => {
    expect(extractFirstJsonObject('{"a":1}')).toBe('{"a":1}');
  });

  it('extractFirstJsonObject: 嵌套大括号', () => {
    const text = '{"a":1,"b":{"c":2}}';
    expect(extractFirstJsonObject(text)).toBe(text);
  });

  it('safeJsonParse: 成功路径', () => {
    const r = safeJsonParse<{ a: number }>('{"a":42}');
    expect(r.ok).toBe(true);
  });

  it('safeJsonParse: 失败路径', () => {
    const r = safeJsonParse('not json');
    expect(r.ok).toBe(false);
  });

  it('stripJsonFence: 剥 markdown 包装', () => {
    expect(stripJsonFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
});
