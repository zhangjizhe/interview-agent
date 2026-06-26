import { Question } from './agent.bank';

export const ALGO_QUESTION_BANK: Question[] = [
  {
    id: 'algo-e1',
    level: 'easy',
    category: '数据结构',
    question: '数组和链表有什么区别？各自适合什么场景？',
    keyPoints: [
      '数组连续内存，O(1) 随机访问',
      '链表离散内存，O(n) 访问，O(1) 插入删除',
      '缓存友好性差异',
    ],
    referenceAnswer:
      '数组：连续内存，支持 O(1) 随机访问，插入/删除 O(n)，缓存友好。链表：节点离散，插入/删除 O(1)，访问 O(n)，额外指针开销。数组适合读多写少+频繁随机访问；链表适合频繁插入删除。',
  },
  {
    id: 'algo-e2',
    level: 'easy',
    category: '算法基础',
    question: '解释一下时间复杂度和空间复杂度，常见量级有哪些？',
    keyPoints: [
      '大 O 记号含义',
      '常见量级：O(1) < O(log n) < O(n) < O(n log n) < O(n²)',
      '能分析简单代码的复杂度',
    ],
    referenceAnswer:
      '时间复杂度衡量算法执行时间随输入规模增长的速率，空间复杂度衡量额外内存消耗。常见量级从优到劣：O(1) < O(log n) < O(n) < O(n log n) < O(n²) < O(2ⁿ)。通常追求时间 O(n log n) 以内。',
  },
  {
    id: 'algo-m1',
    level: 'medium',
    category: '排序与查找',
    question: '快速排序的原理是什么？最坏情况如何避免？',
    keyPoints: [
      '分治思想 + 分区操作',
      'pivot 选择策略',
      '最坏情况 O(n²) 及优化',
      '不稳定排序',
    ],
    referenceAnswer:
      '快排：选 pivot，将数组分为 < pivot 和 > pivot 两部分，递归排序。平均 O(n log n)，最坏 O(n²)（已排序数组选首元素为 pivot）。优化：1) 随机 pivot 2) 三数取中 3) 小区间切插入排序。原地排序，空间 O(log n)。',
  },
  {
    id: 'algo-m2',
    level: 'medium',
    category: '动态规划',
    question: '动态规划的核心思想是什么？如何判断一个问题能否用 DP 解决？',
    keyPoints: [
      '最优子结构',
      '重叠子问题',
      '状态定义 + 状态转移方程',
      '记忆化搜索 vs 递推',
    ],
    referenceAnswer:
      'DP 核心：1) 最优子结构（大问题最优解包含子问题最优解）2) 重叠子问题（递归中大量重复计算）。解题步骤：定义状态 → 写转移方程 → 确定边界 → 选择实现方式（自顶向下记忆化 / 自底向上递推）。经典：背包、最长公共子序列、编辑距离。',
  },
  {
    id: 'algo-h1',
    level: 'hard',
    category: '系统设计',
    question: '如何设计一个高效的 LRU Cache？',
    keyPoints: [
      '哈希表 + 双向链表组合',
      'O(1) get 和 put 操作',
      '淘汰策略（最近最少使用）',
      '线程安全考虑',
    ],
    referenceAnswer:
      'LRU Cache 用 HashMap + 双向链表实现。HashMap 存 key → Node 映射，双向链表维护访问顺序（最新放头部，最旧放尾部）。get 时命中则移到头部，put 时满则淘汰尾部。两者都是 O(1)。Java 有 LinkedHashMap，Python 有 OrderedDict。',
  },
];
