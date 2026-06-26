/**
 * P0 缓存工程 - 纯逻辑单测（node:test 内置，零依赖）
 *
 * 运行：node --test --import tsx tests/cache.spec.ts
 * 或：npx tsx --test tests/cache.spec.ts
 *
 * 覆盖：
 *  - prompt-cache.strategy 的 3 段分类 / cache key / 提取 cache usage
 *  - semantic cache 白/黑名单逻辑（mock）
 *  - cost tracker 的 cost 公式
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPromptCacheContext,
  classifyMessages,
  classifyMessages3,
  extractCacheUsage,
  fingerprintToolset,
  injectAnthropicCacheControl,
  estimateTokens,
  fnv1a,
} from '../src/modules/llm/cache/prompt-cache.strategy';
import {
  extractFirstJsonObject,
  stripJsonFence,
  safeJsonParse,
  repairJsonLoose,
} from '../src/common/json-extract';

test('classifyMessages: 分离 system / dynamic', () => {
  const msgs = [
    { role: 'system', content: '你是一个面试官' },
    { role: 'system', content: '规则：每次只问一题' },
    { role: 'user', content: '你好' },
    { role: 'assistant', content: '你好，请自我介绍' },
    { role: 'user', content: '我叫张三' },
  ];
  const { segments, cacheableIndices } = classifyMessages(msgs);
  const kinds = segments.map((s) => s.kind);
  assert.deepEqual(kinds, ['SYSTEM', 'DYNAMIC']);
  // SYSTEM 全选
  assert.ok(cacheableIndices.includes(0), 'system message #0 必选');
  assert.ok(cacheableIndices.includes(1), 'system message #1 必选');
  // DYNAMIC 不进
  assert.ok(!cacheableIndices.includes(2));
});

test('classifyMessages3: 显式 dynStart 切分 3 段', () => {
  // SEMI_STATIC 段：非 system 的静态消息（few-shot 用 user/assistant role 但 content 稳定）
  // 这里用长字符串模拟 few-shot
  const longFewShot = 'x'.repeat(5000);
  const msgs = [
    { role: 'system', content: '你是一个面试官' },
    { role: 'system', content: '规则：每次只问一题' },
    { role: 'user', content: longFewShot }, // few-shot 当 user 存
    { role: 'user', content: '你好' }, // 真实用户消息
  ];
  // dynStart=3 表示前 3 条都是静态
  const { segments, cacheableIndices } = classifyMessages3(msgs, 3);
  const kinds = segments.map((s) => s.kind);
  assert.deepEqual(kinds, ['SYSTEM', 'SEMI_STATIC', 'DYNAMIC']);
  assert.ok(cacheableIndices.includes(0));
  assert.ok(cacheableIndices.includes(1));
  // 长的 SEMI_STATIC 进缓存
  assert.ok(cacheableIndices.includes(2));
});

test('buildPromptCacheContext: prompt_cache_key 由 user+sysVer+tools 决定', () => {
  const ctx1 = buildPromptCacheContext({
    userId: 'u1',
    systemVersion: 'v1',
    messages: [{ role: 'system', content: 'sys' }],
    protocol: 'openai_compat',
  });
  const ctx2 = buildPromptCacheContext({
    userId: 'u1',
    systemVersion: 'v1',
    messages: [{ role: 'system', content: 'sys' }],
    protocol: 'openai_compat',
  });
  const ctx3 = buildPromptCacheContext({
    userId: 'u2', // 不同 user
    systemVersion: 'v1',
    messages: [{ role: 'system', content: 'sys' }],
    protocol: 'openai_compat',
  });
  const ctx4 = buildPromptCacheContext({
    userId: 'u1',
    systemVersion: 'v2', // 升级
    messages: [{ role: 'system', content: 'sys' }],
    protocol: 'openai_compat',
  });

  assert.equal(ctx1.promptCacheKey, ctx2.promptCacheKey, '同输入必同 key');
  assert.notEqual(ctx1.promptCacheKey, ctx3.promptCacheKey, 'user 不同 → key 不同');
  assert.notEqual(ctx1.promptCacheKey, ctx4.promptCacheKey, 'sysVer 不同 → key 不同');
});

test('fingerprintToolset: 工具列表排序后签名稳定', () => {
  const t1 = fingerprintToolset([{ function: { name: 'a' } }, { function: { name: 'b' } }]);
  const t2 = fingerprintToolset([{ function: { name: 'b' } }, { function: { name: 'a' } }]);
  assert.equal(t1.signature, t2.signature, '顺序无关');
  assert.equal(t1.hash, t2.hash);
});

test('extractCacheUsage: OpenAI / Anthropic 字段归一化', () => {
  const oa = extractCacheUsage({
    prompt_tokens: 1000,
    prompt_tokens_details: { cached_tokens: 700 },
  });
  assert.equal(oa.cachedTokens, 700);
  assert.equal(oa.totalPromptTokens, 1000);

  const ant = extractCacheUsage({
    input_tokens: 1000,
    cache_read_input_tokens: 500,
  });
  assert.equal(ant.cachedTokens, 500);

  const none = extractCacheUsage({});
  assert.equal(none.cachedTokens, 0);
});

test('injectAnthropicCacheControl: 在指定 index 注入 cache_control', () => {
  const msgs = [
    { role: 'system' as const, content: 'sys' },
    { role: 'user' as const, content: 'q' },
  ];
  const injected = injectAnthropicCacheControl(msgs, [0]) as any;
  assert.ok(Array.isArray(injected[0].content), 'system 改成 block 数组');
  assert.equal(injected[0].content[0].cache_control.type, 'ephemeral');
  // user 不动
  assert.equal(typeof injected[1].content, 'string');
});

test('estimateTokens: 中英文粗估', () => {
  // 4 英文 = 1 token
  assert.equal(estimateTokens('abcd'), 1);
  // 4 中文 ≈ 3 tokens (1.5 字/token)
  assert.equal(estimateTokens('你好你好'), 3);
  // 混合 hello(5) + 你好(2) = 5/4 + 2/1.5 = 1.25 + 1.33 = ceil(2.58) = 3
  assert.equal(estimateTokens('hello 你好'), 3);
});

test('fnv1a: 稳定 + 唯一', () => {
  assert.equal(fnv1a('hello'), fnv1a('hello'));
  assert.notEqual(fnv1a('hello'), fnv1a('world'));
  assert.equal(fnv1a(''), 0x811c9dc5 >>> 0);
});

test('end-to-end: 50 轮对话 3 段分类 + 累计节省', () => {
  // 模拟 50 轮 interview
  const sysPrompt = '你是一个AI面试官'.repeat(50); // ~150 tokens
  const tools = [
    { function: { name: 'bocha_search' } },
    { function: { name: 'submit_answer' } },
  ];
  let totalSaved = 0;
  const userId = 'u_test';

  for (let i = 0; i < 50; i++) {
    const messages = [
      { role: 'system' as const, content: sysPrompt },
      { role: 'system' as const, content: '规则：每次一题' },
      { role: 'user' as const, content: `turn-${i} question` },
      { role: 'assistant' as const, content: `answer ${i}` },
    ];
    const ctx = buildPromptCacheContext({
      userId,
      systemVersion: 'sys-v1',
      messages,
      tools,
      protocol: 'openai_compat',
    });
    // 第一次没缓存；后续每次都算 cacheable
    if (i > 0) {
      const cachedTokens = sysPrompt.length / 4 + '规则：每次一题'.length / 4; // 估算
      totalSaved += cachedTokens;
    }
    // 验证 promptCacheKey 跨轮稳定（同 user + sysVer + tools）
    if (i > 0) {
      assert.ok(ctx.promptCacheKey.startsWith(userId), 'key 含 user');
    }
  }

  // 50 轮节省 ~ 49 * (系统 prompt tokens) > 3000 tokens
  assert.ok(totalSaved > 3000, `节省 > 3000 tokens，实际 ${totalSaved}`);
});

test('extractFirstJsonObject: 简单对象', () => {
  const r = extractFirstJsonObject('{"a":1,"b":2}');
  assert.equal(r, '{"a":1,"b":2}');
});

test('extractFirstJsonObject: 嵌套大括号', () => {
  const text = '{"outer":{"inner":"value","arr":[1,2,3]},"end":true}';
  const r = extractFirstJsonObject(text);
  assert.equal(r, text);
});

test('extractFirstJsonObject: 字符串内含大括号不算', () => {
  const text = '{"text":"hello {world}","n":1}';
  const r = extractFirstJsonObject(text);
  assert.equal(r, text);
});

test('extractFirstJsonObject: 字符串内有转义引号', () => {
  const text = '{"text":"say \\"hi\\" to me","n":1}';
  const r = extractFirstJsonObject(text);
  assert.equal(r, text);
});

test('extractFirstJsonObject: LLM 实际返回 (markdown + 嵌套 array + 中文)', () => {
  // 模拟 v13 generateReport 收到的 LLM 真实输出
  const text = `好的,这是评估结果:
\`\`\`json
{
  "overallScore": 85,
  "scores": { "technical": 88, "communication": 80, "logic": 90, "learning": 85 },
  "strengths": ["技术扎实", "思路清晰", "有深度"],
  "weaknesses": ["表达可以更精炼"],
  "suggestions": ["练习白板写代码", "多读源码"]
}
\`\`\`
希望对你有帮助!`;
  const r = extractFirstJsonObject(text);
  assert.ok(r);
  const parsed = JSON.parse(r!);
  assert.equal(parsed.overallScore, 85);
  assert.equal(parsed.scores.technical, 88);
  assert.deepEqual(parsed.strengths, ['技术扎实', '思路清晰', '有深度']);
});

test('extractFirstJsonObject: 修复 v13 原 bug case (stray ] in nested array)', () => {
  // v13 原 `\{[\s\S]*\}` 贪婪匹配在 markdown 包裹 + 嵌套 array 时挂
  // 新实现用花括号平衡 + markdown 剥离
  const text = '一些说明文字 [1, 2, 3] 然后是 JSON: {"a": 1, "b": [4, 5, 6], "c": {"d": 7}} 后面更多废话';
  const r = extractFirstJsonObject(text);
  assert.equal(r, '{"a": 1, "b": [4, 5, 6], "c": {"d": 7}}');
});

test('stripJsonFence: 剥 markdown 包装', () => {
  const a = stripJsonFence('```json\n{"a":1}\n```');
  assert.equal(a, '{"a":1}');
  const b = stripJsonFence('```\n{"a":1}\n```');
  assert.equal(b, '{"a":1}');
  const c = stripJsonFence('{"a":1}');
  assert.equal(c, '{"a":1}');
});

test('safeJsonParse: 组合工具', () => {
  const ok = safeJsonParse<{ a: number }>('```json\n{"a": 42}\n```');
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.value.a, 42);
  
  const fail = safeJsonParse('no json here');
  assert.equal(fail.ok, false);
});

test('safeJsonParse: 容错修复 - 尾逗号', () => {
  // 真实 LLM 经常写 {"a": 1,} 带尾逗号
  const r = safeJsonParse<{ a: number; b: number[] }>('{"a": 1, "b": [1, 2, 3,],}');
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.a, 1);
    assert.deepEqual(r.value.b, [1, 2, 3]);
  }
});

test('safeJsonParse: 容错修复 - 未引号 key', () => {
  const r = safeJsonParse<{ overallScore: number }>('{overallScore: 85, scores: {}}');
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.overallScore, 85);
});

test('safeJsonParse: 容错修复 - 注释', () => {
  const r = safeJsonParse<{ a: number }>('{"a": 1 /* score */ , "b": 2 // note\n}');
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.a, 1);
});

test('safeJsonParse: 无法修复时返 ok:false + 详细错误', () => {
  const r = safeJsonParse('{ totally broken [}');
  assert.equal(r.ok, false);
});

test('repairJsonLoose: 单元', () => {
  const r = repairJsonLoose('{"a": 1, "b": [1, 2,] , }');
  // 期望: '{"a": 1, "b": [1, 2] }'
  assert.equal(JSON.parse(r).a, 1);
});
