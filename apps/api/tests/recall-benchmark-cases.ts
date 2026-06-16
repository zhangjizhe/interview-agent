/**
 * 召回率 benchmark 测试用例
 *
 * 每个 case: { query, expectedItemIds: string[], topic?: string, weight: 1-3 }
 * - 期望命中:从 knowledge-base.json 里手工挑的"标准答案"
 * - weight: 重要性,1=普通 2=高频 3=必须命中
 *
 * 跑法:
 *   curl -X POST http://localhost:3001/api/knowledge-base/benchmark \
 *     -H "Content-Type: application/json" \
 *     -d @apps/api/tests/recall-benchmark-cases.json
 */

import * as fs from 'fs';
import * as path from 'path';

export interface BenchmarkCase {
  query: string;
  expectedItemIds: string[]; // 期望被命中的题 id（itemId 字段,即 "01-Q01" 形式）
  topic?: string; // 可选,指定 topic 过滤
  weight: 1 | 2 | 3; // 重要性
  note?: string; // 备注
}

export const BENCHMARK_CASES: BenchmarkCase[] = [
  // ===== Agent 基础架构 (01) =====
  {
    query: '什么是 LLM Agent？和单次 LLM 调用有什么本质区别？',
    expectedItemIds: ['01-Q01'],
    topic: 'Agent 基础架构（ReAct、记忆、Multi-Agent、规划）',
    weight: 3,
    note: 'P0 必背',
  },
  {
    query: 'ReAct 是怎么工作的？思考和行动怎么交替？',
    expectedItemIds: ['01-Q05', '01-Q06', '01-Q07'],
    topic: 'Agent 基础架构（ReAct、记忆、Multi-Agent、规划）',
    weight: 2,
  },
  {
    query: 'Multi Agent 协作与切换 怎么设计',
    expectedItemIds: ['01-Q18', '01-Q09'],
    topic: 'Agent 基础架构（ReAct、记忆、Multi-Agent、规划）',
    weight: 3,
  },
  {
    query: 'Agent 的反思 reflection 机制',
    expectedItemIds: ['01-Q17'],
    topic: 'Agent 基础架构（ReAct、记忆、Multi-Agent、规划）',
    weight: 2,
  },

  // ===== RAG 检索增强 (02) =====
  {
    query: 'RAG 切片策略 chunk size 怎么选',
    expectedItemIds: ['02-Q05', '02-Q06'],
    topic: 'RAG 检索增强（切片、Embedding、向量库）',
    weight: 2,
  },
  {
    query: 'Embedding 是什么 怎么选',
    expectedItemIds: ['02-Q08', '02-Q09'],
    topic: 'RAG 检索增强（切片、Embedding、向量库）',
    weight: 2,
  },
  {
    query: '向量数据库 Milvus Qdrant 性能 瓶颈',
    expectedItemIds: ['02-Q11'],
    topic: 'RAG 检索增强（切片、Embedding、向量库）',
    weight: 3,
  },
  {
    query: 'Rerank 重排序的必要性',
    expectedItemIds: ['02-Q16'],
    topic: 'RAG 检索增强（切片、Embedding、向量库）',
    weight: 2,
  },

  // ===== 工具调用 MCP (03) =====
  {
    query: 'MCP 协议通信方式 stdio SSE Streamable HTTP',
    expectedItemIds: ['03-Q14'],
    topic: '工具调用 & MCP 协议（Function Call、Skill、A2A）',
    weight: 3,
  },
  {
    query: 'Tool schema 设计原则 错误处理',
    expectedItemIds: ['03-Q04', '03-Q19'],
    topic: '工具调用 & MCP 协议（Function Call、Skill、A2A）',
    weight: 2,
  },
  {
    query: 'MCP vs Function Calling 场景选型',
    expectedItemIds: ['03-Q08'],
    topic: '工具调用 & MCP 协议（Function Call、Skill、A2A）',
    weight: 2,
  },

  // ===== LangGraph (04) =====
  {
    query: 'LangGraph Checkpoint 中断恢复',
    expectedItemIds: ['04-Q01', '04-Q04'],
    topic: 'LangGraph 状态机（Checkpoint、interrupt）',
    weight: 3,
    note: 'P0 必背',
  },
  {
    query: 'LangGraph interrupt HITL 怎么实现',
    expectedItemIds: ['04-Q12'],
    topic: 'LangGraph 状态机（Checkpoint、interrupt）',
    weight: 3,
  },

  // ===== 系统设计 (05) =====
  {
    query: 'RAG 系统怎么设计',
    expectedItemIds: ['05-Q01', '05-Q02'],
    topic: '系统设计（RAG 系统、客服系统、Code Agent、高并发）',
    weight: 2,
  },
  {
    query: 'Code Agent 架构',
    expectedItemIds: ['05-Q04', '05-Q05'],
    topic: '系统设计（RAG 系统、客服系统、Code Agent、高并发）',
    weight: 2,
  },

  // ===== 大模型工程 (06) =====
  {
    query: 'Transformer 架构 Encoder Decoder 自注意力',
    expectedItemIds: ['06-Q02', '06-Q03'],
    topic: '大模型工程（Transformer、训练、量化、MoE、vLLM）',
    weight: 3,
    note: '八股必问',
  },
  {
    query: 'KV Cache Prompt Caching 原理',
    expectedItemIds: ['06-Q14'],
    topic: '大模型工程（Transformer、训练、量化、MoE、vLLM）',
    weight: 2,
  },

  // ===== 项目深挖 (08) =====
  {
    query: '你的 interview-agent 项目介绍 4 级水位线 ContextManager',
    expectedItemIds: ['08-Q01', '08-Q07'],
    topic: '项目深挖（interview-agent 追问）',
    weight: 3,
    note: '简历必问',
  },
  {
    query: '为什么用 LangGraph Multi-Agent 而不是单 Agent',
    expectedItemIds: ['08-Q02'],
    topic: '项目深挖（interview-agent 追问）',
    weight: 3,
  },
  {
    query: '你们的 MCP Registry 怎么设计 三层记忆',
    expectedItemIds: ['08-Q05', '08-Q06'],
    topic: '项目深挖（interview-agent 追问）',
    weight: 2,
  },

  // ===== 软素质 (09) =====
  {
    query: '自我介绍',
    expectedItemIds: ['09-Q01', '09-Q02'],
    topic: '软素质与行为面试（自我介绍、挑战、规划）',
    weight: 2,
  },
  {
    query: '最有挑战的一个技术问题',
    expectedItemIds: ['09-Q04'],
    topic: '软素质与行为面试（自我介绍、挑战、规划）',
    weight: 2,
  },

  // ===== 跨主题 / 难例 =====
  {
    query: 'function calling 实现原理 json schema',
    expectedItemIds: ['03-Q01', '03-Q02'],
    weight: 2,
    note: '不带 topic 过滤,测全局检索能力',
  },
  {
    query: 'Agent 记忆压缩方法',
    expectedItemIds: ['01-Q14'],
    weight: 2,
    note: '跨主题检索',
  },
];

if (require.main === module) {
  // 写到 json 方便 curl 用
  const out = path.join(__dirname, 'recall-benchmark-cases.json');
  fs.writeFileSync(out, JSON.stringify({ cases: BENCHMARK_CASES }, null, 2));
  console.log(`✅ Wrote ${BENCHMARK_CASES.length} benchmark cases to ${out}`);
}
