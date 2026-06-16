import { Question } from './agent.bank';

export const TEST_QUESTION_BANK: Question[] = [
  {
    id: 'test-e1',
    level: 'easy',
    category: '测试基础',
    question: '什么是测试金字塔？三层分别是什么？',
    keyPoints: [
      '知道三层结构：单元测试 → 集成测试 → E2E 测试',
      '能说出每层的覆盖率/速度/成本权衡',
      '知道反模式（冰淇淋筒：E2E 多、单元少）',
    ],
    referenceAnswer:
      'Mike Cohn 提出的测试金字塔：底层单元测试（快、便宜、覆盖率高）、中间集成测试（验证模块协作）、顶层 E2E 测试（慢、贵、易碎）。健康比例约 70/20/10。反模式"冰淇淋筒"：E2E 多而单元少，CI 慢且不稳。',
  },
  {
    id: 'test-e2',
    level: 'easy',
    category: '测试基础',
    question: '黑盒测试 vs 白盒测试的区别？',
    keyPoints: [
      '黑盒：只看输入输出，不看内部实现',
      '白盒：基于代码逻辑设计用例',
      '灰盒：介于两者之间',
    ],
    referenceAnswer:
      '黑盒测试关注功能行为（等价类、边界值、状态迁移），不依赖代码；白盒测试关注内部逻辑（语句覆盖、分支覆盖、路径覆盖），需读代码。E2E 多用黑盒，单元测试多用白盒。',
  },
  {
    id: 'test-m1',
    level: 'medium',
    category: '自动化测试',
    question: '如何为前端 React 组件写单元测试？',
    keyPoints: [
      '知道工具栈：Jest / Vitest + React Testing Library',
      '能讲 query 优先级（getByRole 优先）',
      '能讲 mock（API、路由、定时器）',
    ],
    referenceAnswer:
      '工具栈：Vitest/Jest（runner）+ React Testing Library（DOM 查询）+ jsdom（环境）。原则：1) 优先 getByRole（贴近用户视角）2) 不要测实现细节（state、className）3) Mock API 用 MSW 4) 异步用 waitFor/findBy。',
  },
  {
    id: 'test-m2',
    level: 'medium',
    category: 'API 测试',
    question: 'REST API 的功能测试你会怎么设计？',
    keyPoints: [
      '正常路径 + 异常路径 + 边界',
      'HTTP 状态码语义',
      '认证 / 鉴权 / 幂等性 / 并发',
      '工具：Postman / Newman / Supertest',
    ],
    referenceAnswer:
      '维度：1) 正常路径（CRUD）2) 异常（404/400/500）3) 鉴权（未登录/越权）4) 边界（空值/超长/特殊字符）5) 幂等性（PUT/DELETE 重复调用）6) 并发（race condition）。NestJS 推荐用 Supertest + Jest 写 e2e。',
  },
  {
    id: 'test-h1',
    level: 'hard',
    category: '高级',
    question: 'AI/LLM 应用怎么测试？传统断言为什么失效？',
    keyPoints: [
      '知道 LLM 输出非确定性（同样输入不同输出）',
      '能讲结构化输出校验（Zod/JSON Schema）',
      '能讲 LLM-as-Judge、Embedding 相似度、人工评测',
      '能讲 Eval 体系（数据集 + 评分函数）',
    ],
    referenceAnswer:
      '传统断言失效原因：输出非确定、可能幻觉、长度不一。方案：1) 结构化校验（Zod）+ 重试 2) LLM-as-Judge（另一个 LLM 评分）3) Embedding 相似度（语义级对比）4) Golden Dataset（人工标注 + 回归）5) Langfuse Dataset 持续追踪。生产 Agent 必须有 Eval pipeline。',
  },
];
