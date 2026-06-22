/**
 * citation.ts 单元测试 - Hallucination 启发式检测 + 引用 context 构建
 *
 * 覆盖 P1-5 修复（审查员反馈幻觉检测误报率高）：
 *  - 白名单词（API/SQL/HTTP/React/Vue 等）不触发 hallucination
 *  - 版本号模式（v\d+、\d+\.\d+）触发 hallucination 当 citation 不包含时
 *  - 引用 [N] 标记 → citedCount 正确
 *  - 无 citation 但有引用 → hallucinated
 *
 * buildCitationContext：
 *  - 空数组 → "（无检索结果）"
 *  - 长 content 截断
 *  - 按输入数组顺序输出
 */
import { detectHallucination, buildCitationContext, Citation } from '../agents/multi-agent/citation';

const sampleCitations: Citation[] = [
  {
    index: 1,
    sourceId: 'kb-001',
    sourceType: 'knowledge_bank',
    title: 'React Fiber 调度机制',
    content: 'React Fiber 是 React 16 引入的协调算法，基于双缓冲和优先级调度。',
    score: 0.92,
  },
  {
    index: 2,
    sourceId: 'kb-002',
    sourceType: 'knowledge_bank',
    title: 'Vue 3 响应式原理',
    content: 'Vue 3 使用 Proxy 实现响应式，相比 Vue 2 的 Object.defineProperty 更强大。',
    score: 0.85,
  },
];

describe('detectHallucination - 启发式幻觉检测（P1-5 修复）', () => {
  it('白名单词（API/SQL/HTTP/React/Vue）不触发 hallucination', () => {
    // 必须有 [N] 引用，否则 "无引用" 分支会触发 hallucination（设计行为）
    const r = detectHallucination('这是关于 API 和 React 的回答 [1]，使用了 SQL 和 HTTP 协议。', sampleCitations);
    expect(r.hallucinated).toBe(false);
    expect(r.missingFacts).toEqual([]);
  });

  it('版本号在 citation 中能找到 → 不触发', () => {
    // React 16 在 kb-001 content 中能找到
    const r = detectHallucination('React 16 引入的协调算法是 Fiber 机制 [1]。', sampleCitations);
    expect(r.hallucinated).toBe(false);
  });

  it('版本号在 citation 中找不到 → 触发 hallucination', () => {
    // 正则 \d+\.\d+ 提取出 "20.0"（不包含 "React" 前缀）
    const r = detectHallucination('React 20.0 引入了全新调度 [1]。', sampleCitations);
    expect(r.hallucinated).toBe(true);
    expect(r.missingFacts).toContain('20.0');
  });

  it('引用 [1] → citedCount = 1', () => {
    const r = detectHallucination('如 [1] 所述，React Fiber 是协调算法。', sampleCitations);
    expect(r.citedCount).toBe(1);
  });

  it('无 [N] 引用但有 citation → 触发 hallucination', () => {
    const r = detectHallucination('React Fiber 是协调算法。', sampleCitations);
    expect(r.hallucinated).toBe(true);
    expect(r.citedCount).toBe(0);
  });

  it('多个引用 [1] [2] → citedCount = 2', () => {
    const r = detectHallucination('React Fiber [1] 基于双缓冲，Vue 3 [2] 使用 Proxy。', sampleCitations);
    expect(r.citedCount).toBe(2);
  });

  it('无 citation + 无事实 → 不触发', () => {
    const r = detectHallucination('这是一段普通文本，没有技术内容。', []);
    expect(r.hallucinated).toBe(false);
    expect(r.citedCount).toBe(0);
  });

  it('大小写不敏感：白名单匹配 "Api" / "react" 等', () => {
    // 必须有引用才能测白名单效果
    const r = detectHallucination('使用 Api 和 react 框架 [1]。', sampleCitations);
    expect(r.hallucinated).toBe(false);
  });
});

describe('buildCitationContext - 引用 context 构建', () => {
  it('空 citations → "（无检索结果）"', () => {
    expect(buildCitationContext([])).toBe('（无检索结果）');
  });

  it('单条 citation → [1] KB: 标题 (score=0.92)', () => {
    const r = buildCitationContext([sampleCitations[0]]);
    expect(r).toContain('【参考来源】');
    expect(r).toContain('[1] KB: React Fiber 调度机制');
    expect(r).toContain('(score=0.92)');
  });

  it('长 content 截断到 maxContentChars（默认 500）', () => {
    const long: Citation = {
      ...sampleCitations[0],
      content: 'a'.repeat(1000),
    };
    const r = buildCitationContext([long], 100);
    expect(r).toContain('a'.repeat(100) + '...');
    expect(r).not.toContain('a'.repeat(101));
  });

  it('sourceType 标签：KB / MEM / GH / WEB', () => {
    const r = buildCitationContext([
      { index: 1, sourceId: 'a', sourceType: 'memory', title: 'M', content: 'c' },
      { index: 2, sourceId: 'b', sourceType: 'github_repo', title: 'G', content: 'c' },
      { index: 3, sourceId: 'c', sourceType: 'web_search', title: 'W', content: 'c' },
    ]);
    expect(r).toContain('[1] MEM:');
    expect(r).toContain('[2] GH:');
    expect(r).toContain('[3] WEB:');
  });

  it('多行 content 转为单行（\\n → 空格）', () => {
    const c: Citation = {
      ...sampleCitations[0],
      content: 'line1\nline2\nline3',
    };
    const r = buildCitationContext([c]);
    expect(r).toContain('line1 line2 line3');
    expect(r).not.toContain('\nline2');
  });

  it('按输入数组顺序输出（forEach 顺序）', () => {
    const r = buildCitationContext([sampleCitations[0], sampleCitations[1]]);
    const idx1 = r.indexOf('[1]');
    const idx2 = r.indexOf('[2]');
    expect(idx1).toBeGreaterThan(-1);
    expect(idx2).toBeGreaterThan(idx1);
  });
});
