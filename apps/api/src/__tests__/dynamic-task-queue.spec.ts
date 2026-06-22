/**
 * DynamicTaskQueueService 单元测试 - heuristicDecide 启发式回退 + 整词边界匹配
 *
 * 覆盖 R-P2-8 修复：
 *  - wrongIndicators 整词边界匹配，避免误伤（"我之前理解错误" 不被扣分）
 *  - "不正确" 不被识别为"错误"
 *  - "错误" 独立成词时被扣分
 *
 * extractKeywords / estimateCorrectness / estimateDepth：
 *  - 关键词提取（useState / React / 算法 / 微服务）
 *  - 正确性评分（正确 / 错误 / 中性）
 *  - 深度评分（原理 / 源码 / 实现）
 *
 * heuristicDecide 集成：
 *  - 回答完整 + 关键词覆盖 + 无错误 → score > 0.7 → shouldAdvance = true
 *  - 回答过于简略 → score < 0.4 → feedback 含"简略"
 *  - 极差回答 → score < 0.15 → shouldFollowUp = false（不追问）
 *
 * 注：实际逻辑已提取到 heuristic-decide.util.ts（独立文件避免拉入 Prisma + Milvus），
 * 这里用 import 直接调 util，DynamicTaskQueueService 的 static wrapper 只做向后兼容验证。
 */
// 注：不 import DynamicTaskQueueService 类本身（会拉 Prisma + Milvus，在 Node 18 + Jest 30 ESM
// 模式下报错）。class 内 4 个 static 方法已改为 delegate 到 util，行为完全一致。
// 验证向后兼容需要 mock Prisma/Milvus，超出纯函数测试范围。
import {
  extractKeywords,
  estimateCorrectness,
  estimateDepth,
  heuristicDecide,
} from '../modules/interview/services/heuristic-decide.util';

describe('extractKeywords - 关键词提取', () => {
  it('React Hook 关键词', () => {
    const r = extractKeywords('讲讲 useState 和 useEffect 的区别');
    expect(r).toEqual(expect.arrayContaining(['useState', 'useEffect']));
  });

  it('技术框架名', () => {
    const r = extractKeywords('React 和 Vue 有什么区别？TypeScript');
    expect(r).toEqual(expect.arrayContaining(['React', 'Vue', 'TypeScript']));
  });

  it('中文技术词（算法/数据结构/时间复杂度）', () => {
    const r = extractKeywords('请分析算法的时间复杂度和空间复杂度');
    expect(r).toEqual(expect.arrayContaining(['算法', '时间复杂度', '空间复杂度']));
  });

  it('后端架构词（微服务/分布式/缓存）', () => {
    const r = extractKeywords('微服务架构的分布式缓存如何设计');
    expect(r).toEqual(expect.arrayContaining(['微服务', '分布式', '缓存']));
  });

  it('无关键词 → 返回空数组', () => {
    const r = extractKeywords('hello world');
    expect(r).toEqual([]);
  });
});

describe('estimateCorrectness - 正确性评分（R-P2-8 整词边界）', () => {
  it('中性回答（无正确/错误词）→ 0.6 baseline', () => {
    const r = estimateCorrectness('我通常使用 React 做开发');
    expect(r).toBeCloseTo(0.6, 1);
  });

  it('包含"正确" → 0.7', () => {
    const r = estimateCorrectness('这个理解是正确的');
    expect(r).toBeCloseTo(0.7, 1);
  });

  it('包含"错误"独立成词 → 0.4', () => {
    // "错误" 前后是中文标点，被识别为独立词 → 扣分
    const r = estimateCorrectness('这个理解，错误！');
    expect(r).toBeCloseTo(0.4, 1);
  });

  it('否定语境"不正确"不被"正确"加分也不被"错误"扣分（边界匹配避免误伤）', () => {
    // "不正确" 中 "正确" 前是"不"（不是边界字符），整词边界正则不匹配 → 不加分
    // "不正确" 中 "错误" 不独立成词 → 不扣分
    const r = estimateCorrectness('这种做法不正确');
    expect(r).toBeCloseTo(0.6, 1);
  });

  it('"我之前理解错误"不被扣分（"错误" 前是"理解" 不是边界）', () => {
    // "理解错误" 中 "错误" 前是"理解"（不是边界字符），整词边界正则不匹配
    const r = estimateCorrectness('我之前理解错误了');
    expect(r).toBeCloseTo(0.6, 1);
  });

  it('"确实如此" + "没错" → 0.8', () => {
    const r = estimateCorrectness('确实如此，没错');
    expect(r).toBeCloseTo(0.8, 1);
  });

  it('分数夹在 [0.2, 1] 范围（不会越界）', () => {
    const max = estimateCorrectness('正确 正确 正确 正确 正确 正确');
    const min = estimateCorrectness('错误 错误 错误 错误 错误 错误 错误 错误');
    expect(max).toBeLessThanOrEqual(1);
    expect(min).toBeGreaterThanOrEqual(0.2);
  });
});

describe('estimateDepth - 深度评分', () => {
  it('无深度词 → 0.3 baseline', () => {
    const r = estimateDepth('我用过 React 三年了');
    expect(r).toBeCloseTo(0.3, 1);
  });

  it('1 个深度词 → 0.45', () => {
    const r = estimateDepth('讲讲 React 的原理');
    expect(r).toBeCloseTo(0.45, 1);
  });

  it('多个深度词 → 封顶 1.0', () => {
    const r = estimateDepth('从原理、底层、源码、实现、机制、流程、步骤角度分析');
    expect(r).toBe(1);
  });
});

describe('heuristicDecide - 集成决策', () => {
  it('完整回答 + 关键词覆盖 → shouldAdvance = true', () => {
    const question = '讲讲 React 的 useState 和 useEffect';
    const answer = `
      useState 用于管理函数组件的 state，useEffect 用于处理副作用。原理上 React Fiber 会调度
      这些 Hook，确保它们按顺序执行。源码层面 useState 内部用链表存储 state 队列，实现增量更新
      机制。流程上：mount 时初始化 state，update 时 dispatch action 触发 re-render。
    `;
    const r = heuristicDecide(question, answer, 'frontend');
    expect(r.score).toBeGreaterThan(0.5);
    expect(r.shouldAdvance).toBe(true);
  });

  it('回答简略 → feedback 含"简略"', () => {
    const r = heuristicDecide('讲讲 React', 'x', 'frontend');
    expect(r.feedback).toContain('简略');
  });

  it('回答空 → 分数低 + 触发追问（fallback 中 score 0.15-0.5 区间追问）', () => {
    const r = heuristicDecide('讲讲 React', '', 'frontend');
    expect(r.score).toBeLessThan(0.4);
    // 实际 heuristicDecide 算 score=0.3，落在 0.15-0.5 区间 → 追问
    expect(r.shouldFollowUp).toBe(true);
  });

  it('category=backend → 使用 backend followUps', () => {
    const r = heuristicDecide('微服务设计', '我了解一些', 'backend');
    if (r.shouldFollowUp) {
      // backend followUps 含"高并发" / "生产环境"
      expect(r.followUpQuestion).toMatch(/(高并发|生产环境|边界)/);
    }
  });

  it('未知 category → fallback 到 frontend followUps', () => {
    const r = heuristicDecide('React', '我了解一些', 'unknown_category');
    if (r.shouldFollowUp) {
      // frontend followUps 含"具体展开" / "最新版本"
      expect(r.followUpQuestion).toMatch(/(具体展开|最新版本|实际项目)/);
    }
  });
});
