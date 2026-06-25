/**
 * DynamicTaskQueueService 启发式决策工具（独立文件）
 *
 * 独立文件：避免 dynamic-task-queue.service.ts 拉入 PrismaService + QuestionBankService
 * （后者依赖 @zilliz/milvus2-sdk-node，在 Node 18 + Jest 30 ESM 模式下 thrift ESM 报错）。
 *
 * 启发式评分是 LLM agent decision 的 fallback 路径：
 *  - LLM 调用成功 → 主路径（agentDecide）
 *  - LLM 调用失败 → fallback 到这里的纯函数评分
 */

export interface AgentDecision {
  score: number;
  completeness: number;
  correctness: number;
  depth: number;
  feedback: string;
  keyPoints: string[];
  missingPoints: string[];
  shouldFollowUp: boolean;
  followUpQuestion: string | null;
  followUpReason: string | null;
  shouldAdvance: boolean;
  advancedQuestion: string | null;
}

/**
 * 提取问题中的技术关键词（用于 fallback 评分）
 */
export function extractKeywords(question: string): string[] {
  const keywords: string[] = [];
  const patterns = [
    /(useState|useEffect|useRef|useContext|useReducer)/g,
    /(React|Vue|Angular|Node\.js|TypeScript)/g,
    /(算法|数据结构|时间复杂度|空间复杂度)/g,
    /(微服务|分布式|高并发|缓存)/g,
  ];
  patterns.forEach((pattern) => {
    const matches = question.match(pattern);
    if (matches) keywords.push(...matches);
  });
  return [...new Set(keywords)];
}

/**
 * 评估回答正确性（启发式）
 *
 * R-P2-8 修复：wrongIndicators 和 correctIndicators 都改为整词边界匹配。
 * 原 includes() 子串匹配："这种做法不正确"会匹配到"正确"加分；
 * "我之前理解错误"会匹配到"错误"扣分。改用 word boundary 风格正则
 * （中文标点作为分隔符），让指标词只在作为独立词时生效。
 */
export function estimateCorrectness(answer: string): number {
  const correctIndicators = ['正确', '确实如此', '这个理解是对的', '是的', '没错'];
  const wrongIndicators = ['错误', '不对', '不是这样'];

  // 中文词边界正则：前后缀允许中文标点/空白/行首行尾
  // 前缀额外允许"是/为/很/最/不"等修饰词（"是正确的"→"正确"独立出现）
  // 后缀额外允许"的/了/地/得"等助词
  // 注意："不正确"中"正确"前是"不"，不应匹配——但"不"在修饰词列表中会误匹配，
  // 所以"不"需要排除。改用否定先行：前缀不能是中文字符（排除"不/理解"等），
  // 但允许标点/空白/行首/是/为/很/最。
  const boundaryRegex = (words: string[]) =>
    new RegExp(`(?:[，。！？；：、\\s是为何很最]|^)(${words.join('|')})(?:[的了地得，。！？；：、\\s]|$)`);

  let score = 0.6;
  // 逐词匹配，每个独立出现的指标词加减分（与原 forEach + includes 语义一致）
  for (const indicator of correctIndicators) {
    const re = new RegExp(`(?:[，。！？；：、\\s是为何很最]|^)${indicator}(?:[的了地得，。！？；：、\\s]|$)`);
    if (re.test(answer)) score += 0.1;
  }
  for (const indicator of wrongIndicators) {
    const re = new RegExp(`(?:[，。！？；：、\\s是为何很最]|^)${indicator}(?:[的了地得，。！？；：、\\s]|$)`);
    if (re.test(answer)) score -= 0.2;
  }

  return Math.max(0.2, Math.min(1, score));
}

/**
 * 评估回答深度（启发式）
 */
export function estimateDepth(answer: string): number {
  const depthIndicators = ['原理', '底层', '源码', '实现', '机制', '流程', '步骤'];
  const count = depthIndicators.filter((i) => answer.includes(i)).length;
  return Math.min(1, 0.3 + count * 0.15);
}

const FALLBACK_FOLLOW_UPS: Record<string, string[]> = {
  frontend: [
    '能具体展开你刚才提到的那个点吗？在实际项目中遇到过什么问题？',
    '你提到的这个概念，在最新版本中有什么变化？对实际开发有什么影响？',
  ],
  backend: [
    '你刚才提到的方案，在高并发场景下会有什么问题？如何优化？',
    '生产环境中使用这个方案，需要注意哪些边界情况？',
  ],
  algorithm: [
    '你给出的解法，有没有更优的方式？时间复杂度能进一步降低吗？',
    '这个解法在最坏情况下表现如何？有没有退化风险？',
  ],
};

/**
 * 启发式决策（fallback）
 *
 * @param question 题目
 * @param answer 用户回答
 * @param category frontend / backend / algorithm
 */
export function heuristicDecide(
  question: string,
  answer: string,
  category: string,
): AgentDecision {
  const lengthScore = Math.min(answer.length / 200, 1);
  const keywords = extractKeywords(question);
  const keywordMatch = keywords.length > 0
    ? keywords.filter((k) => answer.includes(k)).length / keywords.length
    : 0.5;

  const completeness = 0.6 * lengthScore + 0.4 * keywordMatch;
  const correctness = estimateCorrectness(answer);
  const depth = estimateDepth(answer);
  const score = (completeness + correctness + depth) / 3;

  let feedback = '';
  if (score < 0.4) feedback = '回答较为简略，建议深入阐述';
  else if (score < 0.7) feedback = '回答基本覆盖要点，部分细节可补充';
  else feedback = '回答完整且深入';

  // fallback 规则：LLM 不可用时才用阈值
  const shouldFollowUp = score < 0.5 && score > 0.15; // 太差也不追问
  const shouldAdvance = score > 0.8;

  const categoryFollowUps = FALLBACK_FOLLOW_UPS[category] || FALLBACK_FOLLOW_UPS.frontend;

  return {
    score,
    completeness,
    correctness,
    depth,
    feedback,
    keyPoints: keywords,
    missingPoints: [],
    shouldFollowUp,
    followUpQuestion: shouldFollowUp
      ? categoryFollowUps[Math.floor(Math.random() * categoryFollowUps.length)]
      : null,
    followUpReason: shouldFollowUp ? 'fallback: 回答质量偏低，需要追问' : null,
    shouldAdvance,
    advancedQuestion: null, // fallback 不生成进阶题
  };
}
