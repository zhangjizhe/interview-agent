/**
 * Citation / Hallucination Suppression 工具（ADR #11）
 *
 * 解决问题：LLM 在面试场景中可能"编造"技术细节（hallucination），
 *          比如引用不存在的 API 名/库版本。
 *
 * 方案（CRAG-lite 简化版）：
 * 1. Retrieval 返回的每条 chunk 加上 [1] [2] 标记
 * 2. Prompt 强制要求 LLM 引用 [N] 标记
 * 3. Reviewer 检测 final_response 是否所有事实都能映射到 [N] 引用
 *
 * 完整 CRAG 需要 Grading 模型 + 文档质量评估 + Web 搜索 fallback，
 * 本简化版聚焦"引用溯源"环节，足以应对 P7 面试追问。
 */
export interface Citation {
  /** 引用编号 [1] [2] ... */
  index: number;
  /** 来源 ID（如 kb item id / memory id / repo full_name） */
  sourceId: string;
  /** 来源类型 */
  sourceType: 'knowledge_bank' | 'memory' | 'github_repo' | 'web_search';
  /** 简短标题（用于 [1] KB: React Fiber 调度机制） */
  title: string;
  /** 完整内容 */
  content: string;
  /** 相关度分数（0-1） */
  score?: number;
}

/**
 * 把检索结果数组转成 LLM 可读的引用 context
 *
 * 输入示例：
 *   [{ sourceId: 'kb-001', title: 'React Fiber', content: '...' }, ...]
 * 输出示例：
 *   【参考来源】
 *   [1] KB: React Fiber (score=0.92)
 *       React Fiber 是 React 16 引入的协调算法...
 *   [2] KB: Reconciliation 阶段 (score=0.85)
 *       Reconciliation 阶段主要做 diff 计算...
 *
 * @param citations 引用数组（已按相关度降序）
 * @param maxContentChars 单条内容最大长度（截断避免 prompt 过长）
 */
export function buildCitationContext(
  citations: Citation[],
  maxContentChars = 500,
): string {
  if (citations.length === 0) return '（无检索结果）';

  const lines: string[] = ['【参考来源】'];
  citations.forEach((c) => {
    const truncated = c.content.length > maxContentChars
      ? c.content.slice(0, maxContentChars) + '...'
      : c.content;
    const typeLabel = {
      knowledge_bank: 'KB',
      memory: 'MEM',
      github_repo: 'GH',
      web_search: 'WEB',
    }[c.sourceType];

    const scoreLabel = typeof c.score === 'number' ? ` (score=${c.score.toFixed(2)})` : '';
    lines.push(`[${c.index}] ${typeLabel}: ${c.title}${scoreLabel}`);
    lines.push(`    ${truncated.replace(/\n/g, ' ')}`);
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Hallucination 启发式检测：检查 final_response 里的事实声明
 * 是否能在引用源中找到对应内容。
 *
 * 简化实现（不是真 NLP 检测）：
 * 1. 提取 final_response 里提到的"硬事实"：带数字的版本号 / 库名 / API 名
 * 2. 检查这些事实是否在 citations 的 content 里出现
 * 3. 缺失的事实视为潜在 hallucination
 *
 * 输出：
 *   - hallucinated: bool（是否检测到潜在幻觉）
 *   - missing_facts: string[]（未在引用中找到的事实）
 *   - cited_count: number（final_response 中引用的 [N] 数量）
 *
 * 面试怎么讲：
 * "我们用启发式方法检测 hallucination：提取回复中的硬事实（版本号、API 名），
 *  检查是否在 retrieval 的引用源里能找到。如果有事实没引用源，打 hallucination 标签，
 *  Layer 1 反思让下一轮重试。"
 */
export function detectHallucination(
  finalResponse: string,
  citations: Citation[],
): { hallucinated: boolean; missingFacts: string[]; citedCount: number } {
  // 1. 提取 final_response 中的引用标记 [N]
  const citedMatches = finalResponse.match(/\[(\d+)\]/g) || [];
  const citedIndices = new Set(
    citedMatches.map((m) => parseInt(m.slice(1, -1), 10)).filter((n) => !isNaN(n)),
  );

  // 2. 提取 final_response 中的"硬事实"
  //    - 数字 + 点号（如 1.0, 16.8, 3.14）
  //    - 大写开头的专有名词（React、Vue、TypeScript、Kubernetes）
  //    - 包含数字的版本模式（v\d+、\d+\.\d+）
  const factPatterns = [
    /\bv?\d+\.\d+(\.\d+)?\b/g,          // 版本号 v1.2.3 / 1.2.3
    /\b[A-Z][a-zA-Z]+(?:[A-Z][a-z]+)+\b/g, // PascalCase: ReactFiber → React Fiber
    /\b[A-Z]{2,}\b/g,                   // 全大写: HTTP / API / SQL
  ];

  const facts = new Set<string>();
  for (const pat of factPatterns) {
    const matches = finalResponse.match(pat);
    if (matches) matches.forEach((m) => facts.add(m));
  }

  // 3. 拼出所有 citation 的 content
  const citationContent = citations.map((c) => c.content).join('\n');

  // 4. 检查每个 fact 是否在 citation content 中出现
  const missingFacts: string[] = [];
  for (const fact of facts) {
    if (!citationContent.includes(fact)) {
      missingFacts.push(fact);
    }
  }

  return {
    hallucinated: missingFacts.length > 0 || (citations.length > 0 && citedIndices.size === 0),
    missingFacts,
    citedCount: citedIndices.size,
  };
}

/**
 * 给 LLM 的 prompt 片段：要求引用 [N] 标记
 */
export const CITATION_INSTRUCTION = `
【引用规则】
- 你的回复必须基于【参考来源】中的内容，不要编造事实
- 提到具体来源时必须用 [N] 标记引用，例如："React Fiber 调度机制 [1] 基于双缓冲..."
- 数字/版本号/API 名称必须与来源一致
- 如果参考来源没有覆盖你的问题，明确说"这个我不确定"，不要硬猜
`.trim();