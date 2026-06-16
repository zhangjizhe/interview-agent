/**
 * 面试知识库 - Agent 工程师方向
 * 结构：分类 → 难度递进 → 题目 + 参考答案 + 评分要点
 */

export interface Question {
  id: string;
  level: 'easy' | 'medium' | 'hard';
  category: string;
  question: string;
  keyPoints: string[]; // 评分要点
  referenceAnswer: string; // 参考答案
}

export const AGENT_QUESTION_BANK: Question[] = [
  {
    id: 'agent-e1',
    level: 'easy',
    category: '基础概念',
    question: '什么是 LLM Agent？和单纯的 LLM 调用有什么区别？',
    keyPoints: [
      '能说出 Agent = LLM + 规划 + 工具调用 + 记忆',
      '区分 ReAct / Plan-Execute 等范式',
      '能举出至少一个框架（LangChain/AutoGen/AutoGen）',
    ],
    referenceAnswer:
      'Agent 是具备自主决策能力的 LLM 应用。普通 LLM 调用是单次问答，Agent 能：1) 规划任务拆解 2) 调用外部工具 3) 维护长期/短期记忆 4) 多轮迭代直到目标完成。代表框架：ReAct、LangChain、AutoGen、LangGraph。',
  },
  {
    id: 'agent-e2',
    level: 'easy',
    category: '基础概念',
    question: '什么是 Function Calling / Tool Use？',
    keyPoints: [
      '理解模型输出结构化 JSON 调用外部函数',
      '知道 OpenAI 协议 / Anthropic 协议 / 国产模型协议',
      '知道工具描述用 JSON Schema',
    ],
    referenceAnswer:
      'Tool Use 是让 LLM 在对话中输出结构化的"调用请求"（函数名 + 参数），应用层执行后将结果回传 LLM，实现 LLM 与外部世界的交互。协议上 OpenAI 兼容协议最通用，工具定义用 JSON Schema 描述。',
  },
  {
    id: 'agent-m1',
    level: 'medium',
    category: '工程实现',
    question: 'Agent 的短期记忆和长期记忆如何设计？为什么需要分层？',
    keyPoints: [
      '短期存当前会话上下文（Redis）',
      '长期存用户偏好/历史（向量库+Mem0）',
      '性能与语义的权衡',
      '能讲出协调机制（注入到 system prompt）',
    ],
    referenceAnswer:
      '短期记忆用 Redis 存当前会话消息，TTL 到期即丢，O(1) 读写。长期记忆用 Mem0 + 向量库，自动从对话提取"用户偏好/历史"，跨会话持久。分层是为了性能和语义的平衡——单一存储要么慢、要么召回不准。',
  },
  {
    id: 'agent-m2',
    level: 'medium',
    category: '工程实现',
    question: '多 Agent 协作（Multi-Agent）和单 Agent 相比有什么优劣？',
    keyPoints: [
      '职责分离（Planner / Executor / Reviewer）',
      '降低单个 prompt 复杂度',
      '代价：通信开销、调试困难',
      '能举出例子（AutoGen、CrewAI）',
    ],
    referenceAnswer:
      '多 Agent 适合复杂任务，职责分离降低单 prompt 复杂度，但通信开销大、状态难追踪、调试地狱。简单任务用单 Agent + 工具链性价比更高。代表框架：AutoGen（微软）、CrewAI。',
  },
  {
    id: 'agent-h1',
    level: 'hard',
    category: '高级',
    question: 'Agent 在生产环境落地最大的挑战是什么？你怎么解决？',
    keyPoints: [
      '幻觉与可控性（结构化输出校验、Guardrails）',
      '成本控制（缓存、路由、小模型）',
      '可观测（Trace、Token 计量、失败定位）',
      '能讲出具体方案',
    ],
    referenceAnswer:
      '三大挑战：1) 幻觉 → Zod 强校验 + 重试 + 兜底文案 2) 成本 → LLM 网关 + 多模型路由 + 语义缓存 3) 可观测 → Langfuse Trace/Span 三层埋点。生产 Agent 必须有 fail-safe 机制。',
  },
];
