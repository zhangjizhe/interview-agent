# 架构设计决策记录

## 1. 去中心化共享上下文 (DeLM 启发)

### 决策背景
中心化多 Agent 架构存在以下问题：
- 主控 Agent 成为瓶颈，等待最慢的执行 Agent
- 信息共享需要经过中心节点，串行通信开销大
- 长上下文推理时调度日志挤占有效推理空间

### 设计方案
借鉴 DeLM (Decentralized Language Models) 论文思想，实现共享上下文白板：

**核心组件**:
1. **共享上下文存储** - gist（精要）+ details（详情）分层
2. **写入验证器** - 确保写入内容被证据支持
3. **过期策略** - TTL + 访问频率清理
4. **审计链** - 记录所有读写操作

**架构优势**:
- Agent 间直接通信，减少主控转发开销
- 分层展开，优化上下文利用率

### 实现位置
`apps/api/src/modules/agent/shared-context.service.ts`

### 已知限制
- v2.0 阶段共享白板为基础实现，v3.0 完整分布式架构仍在规划中
- 多 Agent 节点尚未完全接驳 processMessage 主路径（见 ADR #7）

---

## 2. 记忆层治理

### 决策背景
Agent Memory 存在以下技术债：
- **上下文污染**: 过时信息未及时清理
- **维护成本**: 缺乏管理策略
- **模型退化**: 错误记忆积累导致性能下降
- **场景错配**: 非必要场景使用记忆导致噪音

### 设计方案

**四层记忆架构**:
- L1 工作记忆：Redis Hash，存储面试流程状态（questionIndex/coveredSkills/scoreHistory），跨实例共享，重启不丢
- L2 会话记忆：Redis List，lpush/ltrim(0,49) + TTL 过期
- L3 长期记忆：Mem0 + Milvus 双写，语义去重，30 天过期
- L4 用户画像：Prisma 结构化归档（面试结束写入）

**过期策略**:
- 短期记忆 TTL: 24 小时
- 长期记忆 TTL: 30 天
- 访问频率清理: 7 天未访问自动删除

**验证器**:
- 过滤空内容
- 过滤过长内容 (>10KB)
- 过滤可疑模式（广告、诈骗等）

**审计链**:
- 记录操作类型: create/update/recall/delete/expire
- 记录时间、用户、原因

### 实现位置
`apps/api/src/modules/memory/memory.service.ts`
`apps/api/src/modules/memory/short-term/redis-memory.store.ts`

---

## 3. 动态任务队列

### 决策背景
固定题库面试存在以下局限：
- 无法根据候选人水平调整难度
- 无法深入追问薄弱环节
- 缺乏个性化体验

### 设计方案

**Agent 决策模式**（v2.1 重构，Workflow → Agent）:

> 旧 Workflow: LLM 评分 → `score < 0.5` 规则触发追问 → LLM 生成追问内容（3 步，规则驱动）
> 新 Agent: `agentDecide()` 一次 LLM 调用同时完成评分 + 是否追问 + 追问内容 + 是否进阶 + 进阶内容（1 步，语义驱动）

**AgentDecision Schema**:
- 评分维度：score / completeness / correctness / depth / feedback / keyPoints / missingPoints
- 决策维度：shouldFollowUp + followUpQuestion + followUpReason / shouldAdvance + advancedQuestion
- `shouldFollowUp` 由 LLM 基于回答语义自主判断，不是 `score < 0.5` 硬阈值
- LLM 可在 score=0.6 时决定追问（回答有误导性内容需澄清），也可在 score=0.3 时决定不追问（太离谱不值得追问）

**质量评估维度**:
1. **完整性** - 回答是否覆盖核心要点
2. **正确性** - 内容是否准确
3. **深度** - 是否有细节和原理

**降级策略**:
- LLM 不可用时 → `heuristicDecide()` 启发式回退（此时才用阈值，明确标注为降级逻辑）
- Milvus 不可用时 → 本地题库 `LOCAL_QUESTIONS` 兜底

**题库来源**:
- 主路径：`QuestionBankService`（Milvus 混合检索：Dense + BM25 + RRF + Rerank）
- 回退：本地硬编码题库（frontend / backend / algorithm 各 5 题）

### 实现位置
`apps/api/src/modules/interview/services/dynamic-task-queue.service.ts`

---

## 4. RAG 分层检索

### 决策背景
传统 RAG 存在以下问题：
- 返回内容过长，挤占上下文空间
- 用户可能只需要概要信息

### 设计方案

**分层检索**:
1. **快速检索** - 返回 gist（精要）
2. **按需展开** - 用户需要时获取详情
3. **语义分析** - 意图识别 + 关键词提取

**双引擎**:
- Milvus：Dense + BM25 Sparse + RRF + CrossEncoder Rerank（4 阶段精排）
- Qdrant：142 题知识库轻量通道

### 实现位置
`apps/api/src/modules/interview/services/rag.service.ts`
`apps/api/src/modules/interview/services/question-bank.service.ts`

---

## 5. 流式渲染优化

### 决策背景
React batching 导致流式渲染不自然：
- Token 更新被批量处理
- 用户感知不到逐字打字效果

### 设计方案

**forceRender 机制**:
- 在 zustand store 中添加 `_renderCount`
- 每次 token 更新时递增触发重渲染
- 确保实时打字机效果

**SSE 优化**:
- 每条事件后立即 `flush()`
- Multi-Agent 模式通过 `LlmGatewayChatModel` adapter 也经过 LlmGateway，享受 P0 缓存层
- `graph.stream()` → `processMessage()` → SSE 逐 token 推送

### 实现位置
- `apps/api/src/modules/interview/interview.controller.ts`
- `apps/web/src/store/interview-store.ts`
- `apps/web/src/hooks/useInterviewStream.ts`

---

## 6. 架构演进路线图

### 当前状态 (v2.0)
- LangGraph Multi-Agent Supervisor 拓扑（默认启用）
- 四层记忆架构（Redis Hash / Redis List / Mem0+Milvus / Prisma）
- 共享上下文白板（基础版）
- LLM Gateway 双模型路由 + P0 缓存工程

### 下一阶段 (v3.0)

> v3.0 演进路线（与 README 演进路线表对齐）：

1. ~~**Multi-Agent Handoffs**：基于当前 `respond_directly` 节点扩展，使用 LangGraph Command 原语实现 Planner → Specialist Agent 路由~~ ✅ **已实现（v15）**
2. ~~**HITL 中断框架**：interrupt 接入前端，HR 可在多轮面试中实时审批 / 否决~~ ✅ **已实现（v15）**
3. **Redis Cluster 分布式缓存**：主从复制 + 故障自动切换，多实例部署更稳
4. **per-tenant namespace**：Mem0 / Milvus 按租户隔离，为多企业场景准备

### 当前状态 (v3.0)

> v15 新增的两个核心特性：

#### HITL 中断审批（ADR #10）

**设计决策**：Reviewer 评分争议（score < 0.5）时，图执行暂停等待 HR 审批。

**实现路径**：
1. Reviewer 节点检测 `score < HITL_SCORE_THRESHOLD` → 设置 `hitl_pending=true`
2. reviewer 条件路由检测 `hitl_pending` → 路由到 `hitl_review` 节点
3. `hitl_review` 节点调用 `interrupt()` 暂停图执行
4. 前端轮询 `/hitl/graph-status` 检测中断状态，显示审批面板
5. HR 点击"批准/拒绝" → `POST /hitl/graph-resume` → `Command(resume=verdict)` 恢复
6. approved → END（使用 Reviewer 草稿），rejected → Planner（打回重做）

**关键设计**：
- `interrupt()` 是 LangGraph 原生 API，不需要外部消息队列
- `Command(resume)` 是 LangGraph v0.2 提供的恢复原语
- Redis HITL 状态与 LangGraph checkpoint 双写，保证一致性

#### Specialist Handoffs（ADR #11）

**设计决策**：Planner 在规划时指定 `step.specialist`，Executor 按类型路由到不同 system prompt。

**实现路径**：
1. `PlanStepSchema` 新增 `specialist` 字段（interviewer/evaluator/searcher/general）
2. Planner prompt 加入 Specialist 说明，LLM 规划时自动选择
3. Executor 的 `ask_llm` 分支根据 `step.specialist` 选择 `SPECIALIST_PROMPTS[specialist]`
4. `current_specialist` 写入 state，供前端 CoT 面板展示

**Specialist 类型**：
| Specialist | 职责 | system prompt |
|-----------|------|-------------|
| interviewer | 出题、追问、评估 | 面试官角色 |
| evaluator | 评分、反馈、报告 | 评估专家角色 |
| searcher | 搜索、检索 | 信息检索专家 |
| general | 通用处理 | 默认面试官小面 |

### 长期目标 (v4.0)
- 完全去中心化
- 动态 Agent 编排
- 自适应资源调度

---

## 7. Multi-Agent 引擎开关

### 决策背景
项目同时存在 DeepAgents（LangChain 1.x）和 LangGraph Multi-Agent 两套引擎，需要可切换、可灰度、可回滚。

### 设计方案

**引擎选择逻辑**:
```typescript
const agentMode = this.config.get<string>('agent.engine') || 'multi';
const useMultiAgent = agentMode === 'multi' && this.multiAgent.isEnabled();
```

**三种模式**:
| 模式 | 实现 | 用途 |
|------|------|------|
| `multi`（默认） | LangGraph Supervisor | 完整多 Agent 协作 |
| `deepagents` | LangChain 1.x createDeepAgent | 单 Agent 工具调用 |
| `llm-direct` | LLM 直连 | 兜底降级 |

**接入方式**:
- `InterviewAgentService.processMessage` 为统一入口
- Multi-Agent 通过 `MultiAgentService.stream()` 消费 userInput
- PostgresSaver checkpointer 维护 sessionId 线程状态

### 实现位置
`apps/api/src/modules/agent/interview-agent.service.ts`
`apps/api/src/modules/agent/multi-agent.service.ts`

---

## 8. 工作记忆：Redis Hash 跨实例共享

### 决策背景
面试流程状态（questionIndex、coveredSkills、scoreHistory）在多实例部署下必须跨实例共享，原有进程级内存 Map 无法满足。

### 设计方案

**Redis Hash 数据结构**:
```
session:{sessionId}:state {
  currentQuestion: string,
  questionIndex: number,        # ← 与 Prisma InterviewTask.completedCount 同步（P0-2 修复）
  coveredSkills: JSON string,
  scoreHistory: JSON string,
  followUpDepth: number,
  lastUpdateAt: number
}
```

**跨实例安全**:
- 所有实例读写同一个 Redis key
- 每次操作带 TTL 刷新（默认 24h）
- 面试结束统一清理（clearSession 删除 state + messages + summary 三个 key）

**与水位线 ContextManager 配合**:
- ContextManager 管理消息压缩
- Redis Hash 管理流程状态
- 两者正交，互不干扰

### 实现位置
`apps/api/src/modules/memory/short-term/redis-memory.store.ts`
`apps/api/src/modules/memory/memory.service.ts`

---

## 9. ContextManager decisionCache Bug 修复

### 问题描述

**Bug 1: 缓存 key 用切片下标导致错位**
```typescript
// 旧代码
const id = `m-${i}`;  // i 是切片后的下标，不是消息全局 ID
this.decisionCache.set(id, { content, isStub });
```
compact 切片后同一 `i` 可能指向不同消息 → 缓存命中错误内容

**Bug 2: 无 LRU 上限导致内存泄漏**
进程级 Map 无限增长，长跑服务内存持续攀升

### 修复方案

**Bug 1 Fix: 内容 hash 做 key**
```typescript
private cacheKey(msg: ChatMessage): string {
  const anchor = msg.content.slice(0, 100);
  let hash = 0;
  for (let i = 0; i < anchor.length; i++) {
    const char = anchor.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `${msg.role}-${hash}`;
}
```

**Bug 2 Fix: LRU 1000 条上限**
```typescript
private readonly MAX_CACHE_SIZE = 1000;

private setCache(key: string, entry: StubCacheEntry): void {
  if (this.decisionCache.size >= this.MAX_CACHE_SIZE) {
    const keys = this.decisionCache.keys();
    let count = Math.floor(this.MAX_CACHE_SIZE * 0.1);
    for (const k of keys) {
      if (count-- <= 0) break;
      this.decisionCache.delete(k);
    }
  }
  this.decisionCache.set(key, entry);
}
```

### 实现位置
`apps/api/src/modules/agent/services/context-manager.service.ts`

---

## 10. Reflection 自我修正闭环

### 决策背景

当前 Multi-Agent 图拓扑（supervisor → planner → executor → replanner → reviewer）具备**单次重试**能力（reviewer 不通过 → 回到 planner 重新规划，最多 2 次），但**没有跨 session 的反思 / 学习能力**：

| 现状 | 问题 |
|---|---|
| reviewer 评分 < 0.5 → 重试当前 case | 重试用同样的 prompt，retry 同样的错误模式 |
| 失败的 final_response 没有持久化 | 同样的问题用户问第二次，agent 还是会答错 |
| 没有失败模式聚类 | 不知道"哪类问题总是失败" |
| 没有 prompt 自我修正 | prompt 是手写的，不随失败数据演化 |

这是 P7+ 面试官高频问的"你的 agent 怎么自我改进？"的设计点。

### 设计方案：3 层闭环

```
┌─────────────────────────────────────────────────────────────┐
│                    Layer 1: Online 反思                       │
│   (单 session 内，每次失败立即调整)                              │
│                                                              │
│   reviewer 评分 < 0.5                                         │
│     ↓                                                        │
│   触发 reviewer 内部 reflection 步骤：                          │
│     "为什么 score=0.3? 是事实错误/格式问题/逻辑跳跃?"           │
│     ↓                                                       │
│   生成 issue_tags: ['factual_error', 'incomplete']            │
│     ↓                                                       │
│   路由到 planner 时**带 issue_tags 上 prompt**                │
│     "上次出现 factual_error 和 incomplete，重点避免"            │
└─────────────────────────────────────────────────────────────┘
                              ↕ (数据下沉)
┌─────────────────────────────────────────────────────────────┐
│                    Layer 2: Offline 模式聚类                    │
│   (cron job，分析过去 N 天的失败 case)                           │
│                                                              │
│   reflection_log 表：                                         │
│     - session_id, question, final_response                    │
│     - review_score, review_issues, issue_tags                 │
│     - retry_count, hitl_pending                              │
│                                                              │
│   每 24h cron：                                               │
│     SELECT issue_tags, COUNT(*) FROM reflection_log           │
│       WHERE review_score < 0.5                               │
│       GROUP BY issue_tags                                     │
│     ↓                                                       │
│     Top 3 高频 issue：'factual_error: 35%'                      │
│                      'incomplete: 22%'                       │
│                      'wrong_persona: 18%'                    │
│     ↓                                                       │
│     自动生成"系统性弱点报告"，推送给开发者                         │
└─────────────────────────────────────────────────────────────┘
                              ↕ (演化)
┌─────────────────────────────────────────────────────────────┐
│                    Layer 3: Prompt Evolution                  │
│   (人工 + LLM 协作，每 2 周一次)                                │
│                                                              │
│   输入：Layer 2 的高频 issue + 典型 bad case (5-10 条)          │
│     ↓                                                       │
│   LLM 生成 prompt patch 建议：                                 │
│     "在 system prompt 加入：'避免编造没出现过的 API 名称，      │
│      不确定时回答"我不确定"而不是硬猜"'"                         │
│     ↓                                                       │
│   开发者审核 + A/B 测试                                       │
│     ↓                                                       │
│   合并到 reviewer prompt 的负面清单                             │
└─────────────────────────────────────────────────────────────┘
```

### 关键数据流（Layer 1 详细设计）

```typescript
// reviewer 节点扩展：失败时输出 issue_tags
interface ReviewResult {
  verdict: 'approved' | 'revise';
  score: number;          // 0-1
  issues: string[];       // 自由文本
  suggestion: string;
  confidence: number;
  // 新增 ↓
  issue_tags?: IssueTag[]; // 结构化标签
  reflection?: string;     // 自我反思文本（Layer 1 反馈给 planner）
}

type IssueTag =
  | 'factual_error'      // 编造了不存在的事实
  | 'incomplete'         // 漏答关键要点
  | 'wrong_persona'      // 偏离面试官人设
  | 'format_violation'   // Markdown / 标题违规
  | 'too_long'           // 超过字数限制
  | 'too_short'          // 回答不充分
  | 'off_topic';         // 答非所问

// replanner 节点扩展：路由到 planner 时带 reflection
const replannerNode = async (state) => {
  if (state.review_score < 0.5) {
    return {
      next_action: 'revise',
      retry_count: state.retry_count + 1,
      // 新增 ↓
      injection: {
        reflection: state.review_suggestion,  // 上一轮的反思
        issue_tags: state.issue_tags,          // 上一轮的问题标签
      },
    };
  }
  return { next_action: 'reviewer' };
};

// planner 节点扩展：把 injection 拼进 system prompt
const plannerSystemPrompt = `
  ${basePrompt}
  
  ${state.injection ? `
  【上一轮反思（重点避免）】
  ${state.injection.reflection}
  
  【历史问题标签】
  ${state.injection.issue_tags.join(', ')}
  ` : ''}
`;
```

### 失败日志持久化

新增 `reflection_log` 表（Prisma schema）：

```prisma
model ReflectionLog {
  id              String   @id @default(cuid())
  sessionId       String
  userId          String
  question        String   @db.Text
  finalResponse   String   @db.Text
  reviewScore     Float
  reviewIssues    String[] // 自由文本 issues 列表
  issueTags       String[] // 结构化标签（factual_error 等）
  retryCount      Int      @default(0)
  hitlPending     Boolean  @default(false)
  modelName       String   // qwen-plus / deepseek-chat
  createdAt       DateTime @default(now())
  
  @@index([createdAt])
  @@index([reviewScore])
  @@index([issueTags], type: Gin)
}
```

### Layer 2 离线聚类（未来迭代）

```typescript
// apps/api/scripts/reflect-cron.ts
// 每 24h 执行
const recent = await prisma.reflectionLog.findMany({
  where: {
    reviewScore: { lt: 0.5 },
    createdAt: { gte: subDays(new Date(), 7) },
  },
});

const tagCount = countBy(recent.flatMap(r => r.issueTags));
const topIssues = Object.entries(tagCount)
  .sort(([,a], [,b]) => b - a)
  .slice(0, 5);

// 输出 Markdown 报告
const report = `
## 过去 7 天失败模式 Top 5
${topIssues.map(([tag, count]) => `- ${tag}: ${count} 次 (${(count/recent.length*100).toFixed(1)}%)`).join('\n')}
`;
await fs.writeFile(`docs/reflect-${formatDate(new Date())}.md`, report);
```

### 评估价值

| 面试问题 | 当前能答 | 加 Reflection 后 |
|---|---|---|
| "你的 agent 怎么自我改进？" | "没有，靠 prompt engineering 调优" | "3 层闭环：单 session 反思 + 离线模式聚类 + prompt 演化" |
| "如何避免重试同样的错误？" | "LLM 概率性问题，重试就好" | "issue_tags 路由给下一轮 planner，prompt 注入历史反思" |
| "如何做 Agent 评测？" | "bench 50 轮真实 LLM 调用，cost-baseline.png" | "+ reflection_log 失败聚类 + LLM-as-judge 自动评估" |
| "Agent 设计 tradeoff？" | "靠 reviewer 重试兜底" | "trade-off：在线反思消耗 token vs 离线聚合不实时" |

### 实施优先级

| Phase | 内容 | 工期 | ROI |
|---|---|---|---|
| Phase 1 | reviewer 加 issue_tags + reflection 字段 | 2-3 天 | 高（面试必问） |
| Phase 2 | reflection_log 表 + 失败日志持久化 | 1-2 天 | 中（数据积累） |
| Phase 3 | Layer 1 prompt injection 闭环 | 3-5 天 | 高（用户可感知） |
| Phase 4 | Layer 2 cron 聚类 | 2-3 天 | 中（开发者收益） |
| Phase 5 | Layer 3 prompt evolution | 1-2 周 | 低（边际收益递减） |

### 计划实现位置

- **Phase 1-3**: `apps/api/src/agents/multi-agent/nodes/reviewer.ts` + `replanner.ts` + `planner.ts`
- **Phase 2**: `apps/api/prisma/schema.prisma` + `apps/api/src/modules/reflection/`
- **Phase 4**: `apps/api/scripts/reflect-cron.ts` + Langfuse 报表
- **Phase 5**: `docs/prompt-evolution/` + 开发者 review 流程

---

## 11. 已知短板与改进路线（v15 评估师反馈）

> 本节来自 2026-06-21 v15 代码评估报告，逐项分析客观性 + 是否值得更新。

### 4.1 Reflection 自我修正闭环缺失

**客观性**：✅ 客观（见 ADR #10，已有设计方案）
**优先级**：P0（面试必问）
**工期**：2-3 周全量；先做 Phase 1-3 即可讲清楚

### 4.2 MCP 工具仅基础接入，未拓展外部第三方工具

**客观性**：✅ 客观
**现状**：`McpRegistry` 注册了 `memory_recall / knowledge_search / bocha_search` 3 个内部 tool，**没有接入外部 MCP server**（如 GitHub MCP / Notion MCP / Slack MCP）
**改造方案**：
1. 引入 `@modelcontextprotocol/sdk` 的 `Client` 类（已在 dependencies）
2. 配置 GitHub MCP server endpoint（`https://api.githubcopilot.com/mcp/`）
3. 把外部 tool 注册进 `McpRegistry`
4. 候选人可让 agent 读自己 GitHub 仓库代码作为面试材料

**工期**：2-3 天
**面试价值**：高（差异化亮点，国内 MCP 网关项目稀缺）

### 4.3 幻觉抑制 + 检索结果溯源引用

**客观性**：✅ 客观
**现状**：planner / executor 节点的 tool 调用结果直接拼到 prompt，没有 [1]/[2] 引用标记；reviewer 也没检查"是否引用了检索结果"
**改造方案**：
1. tool 返回结构化加 `source: {docId, chunkId, score}`
2. prompt 模板要求 LLM 输出 `[1] [2]` 引用标记
3. reviewer 加 hallucination 检测：`final_response 中的事实是否能在 retrieved_chunks 中找到对应来源`
4. 失败时打回并提示"请基于以下检索结果回答：[1] [2]"

**工期**：1-2 周
**面试价值**：中（P7 高频，但工程量大）

### 4.4 缓存自适应阈值

**客观性**：✅ 客观
**现状**：Semantic Cache 用 Qwen embedding-v3 + Qdrant cosine 阈值 0.92（黑白名单硬编码）
**改造方案**：
1. 每小时统计 cache hit rate / 误命中率（用户反馈"答非所问"）
2. 误命中 > 5% 时自动提升阈值到 0.95
3. 误命中 < 1% 时自动降低阈值到 0.88
4. 持久化阈值到 Redis，cron 任务调优

**工期**：1-2 天
**面试价值**：低（锦上添花）

### 优先级判断（P9 视角）

| 短板 | 评估师建议 | 我的判断 | 理由 |
|---|---|---|---|
| Reflection | 必做 | **P0 先做设计方案**（ADR #10）+ 后续 Phase 1-3 | 面试必问，设计能讲 15 分钟 |
| MCP 第三方 | 必做 | **P1 做 2-3 天接 GitHub MCP** | 差异化亮点，性价比最高 |
| 幻觉抑制 | 必做 | **P2 看时间** | 工程量大，简历主轴用现有 Langfuse trace 更稳 |
| 缓存自适应 | 必做 | **P3 不做** | 边际收益低，1-2 天换 5% 命中率提升不划算 |

## 12. Phase 1：可吊销的 JWT 会话

- 日期：2026-09-29；默认产品为 NestJS，不引入新运行时或数据库表。
- access token 默认 30 分钟，包含随机 jti、会话 sid 与用户版本；refresh token 为 256 位随机值，Redis 仅保存哈希索引及用户/会话版本，7 天过期。
- refresh 使用 Lua 原子消费，版本校验与下一张白名单写入原子执行；logout 写入剩余有效期的 jti 黑名单并吊销整个 sid。无 jti 的旧 token 使用 SHA-256 索引，未显式吊销时继续自然过期。
- 修改密码使用 Redis 用户级锁与 Prisma 条件更新，完成后原子递增版本并释放锁，所有设备立即失效。锁不自动过期，异常中断优先拒绝访问，由运维确认数据库结果后恢复。
- Redis 是认证状态存储，必须持久化、不淘汰 auth:* 键。故障返回 503，不退化为放行。重建/丢失状态需要轮换 JWT 密钥强制重登。
- 取舍：每个鉴权请求增加 Redis 读取；当前为单 Redis 部署，不宣称 Redis Cluster 兼容。前端自动续期不在此次后端 API 交付范围，现有客户端到期仍重新登录；浏览器后续应采用 HttpOnly/Secure refresh cookie 与 CSRF 防护，不将 refresh token 放入 localStorage。

## 13. Phase 2：组织边界与存量数据

- 日期：2026-09-29；复用模块化单体与 Prisma 5 middleware，不引入租户框架。
- User 单组织归属；存量业务记录统一回填默认组织，新注册创建独立组织。组织身份每次从数据库读取，不信任 JWT 中过期归属、请求头或请求体。
- 服务端 interceptor 通过 AsyncLocalStorage 传递组织上下文。Prisma 统一过滤业务读取/聚合/更新/删除，创建及嵌套创建写入组织；没有上下文拒绝访问。共享技能/评估定义的反向列表及计数仍过滤组织。后台作业必须显式建立组织上下文。
- 核心根记录与附属记录均增加 organizationId，防止 Trace/报告/审计旁路查询。数据库以附加复合外键阻止跨组织引用，保留原外键的删除生命周期；仅资源所有者检查不能替代组织隔离。
- 组织创建与成员指派需要数据库 ADMIN 且在现有 auth.adminUserIds 平台管理名单。禁止带历史资源直接转组织，返回 409；数据迁移另行制定方案。现有个人 ownership 继续有效，不自动开放同组织成员的私人面试。
- 知识库实际位于 Qdrant/Milvus 而非 PostgreSQL，不创建空置的知识表：新组织使用哈希命名的独立 collection；旧 collection 仅归默认组织；内存兜底和导入标志同样分组织。此方案适合当前小规模部署，组织规模扩大前需评估集合数量和索引成本。
- 取舍：保留旧全局唯一业务键，跨组织使用相同旧控制面版本/Receipt Hash 可能发生冲突，但不会返回另一组织数据；后续需要单独兼容迁移消除这一可用性限制。Prisma 裸 SQL 不得出现在租户请求中；外部数据库维护工具属于独立特权边界。

## 14. Phase 2：套餐与并发额度

- 日期：2026-09-29。Plan 是运营数据，预置 free/pro；不在业务代码按套餐名分支。平台 ADMIN 可修改上限与指派组织套餐，当前没有支付或订阅自动升级。
- 复用 UsageLedger；UTC 自然月按组织统计面试次数和文本模型调用尝试次数。每次调用在组织行锁事务内检查并记账，提交后才联网；失败尝试仍占次数，备用模型另计一次。面试创建与记账同事务，普通删除不会返还额度。
- 单次输入 UTF-8 字节和最大输出 token 同时受套餐限制；这不是精确 token 月账单。SessionCost 继续承担观测用途，不能作为并发准入依据。90% 阈值首次跨越输出结构化警告。
- 默认 Multi/Direct 与题库提取通过 LlmGateway。现有 DeepAgents 工具协议需要 ChatOpenAI，文本版 Gateway adapter 尚不支持 bindTools：为避免破坏工具循环，在其 HTTP transport 复用同一 QuotaService，每次实际请求计数并限制输出；SDK/LangChain 隐式重试关闭。后续扩展网关工具协议后再合并适配器。
- 缺失组织/额度数据库不可用时拒绝调用；耗尽返回 429/QUOTA_EXCEEDED，已建立 SSE 返回同名 code 的 error 事件。请求上下文保留额度错误，防止业务兜底将拒绝伪装为成功。
- 边界：embedding、外部工具、运维启动健康探测和 standalone 离线工厂不属于本次文本调用额度；不能宣称总费用硬预算。共享默认组织的存量用户共用套餐，上线前必须核对历史用量并配置合适套餐。旧环境用户面试上限仍作为额外限制。

## 15. Phase 3：低基数指标与实际部署就绪

- 日期：2026-09-30；扩展现有 MetricsModule，使用原计划指定的 prom-client 和 Helmet，不引入另一套可观测运行时。
- 模型指标在 Provider HTTP transport 边界采集，兼容 chat、stream、fallback 和 DeepAgents；不记录正文，仅使用固定 provider/mode/outcome 标签。实际 usage 与缺失 usage 分开，避免以估算支撑成本结论。
- Prometheus 使用独立凭据抓取，Grafana/Prometheus 仅显式 profile 启用且本地端口绑定 loopback。用户 JWT 不具有跨组织基础设施指标读取权限。
- 保留 Nest Logger 接口，改用 JSON sink 并接管主进程 console；敏感结构字段和已知字符串凭据脱敏。自由文本日志的语义隐私仍需调用方保证。
- 部署实测发现两个非单元路径问题：局部 JWT Guard 的 AuthSessionService 未导出；migration 使用了与新 API 不一致的旧镜像。修复模块导出，API/migration 共享镜像，并要求 readiness 校验全部打包迁移。补 Nest 模块装配及旧迁移拒绝回归。
- 取舍：进程内指标重启归零，由 Prometheus 保留时序；此阶段没有分布式日志存储或总费用账单。安装时 prom-client 元数据提示后继包 @prometheus-io/client，暂按用户明确清单保持当前依赖，后续迁移需独立兼容验收。

## 16. 版本评测必须隔离答案缓存

- 日期：2026-10-07。真实评测发现基线部分样本和候选全部样本命中答案语义缓存；现有缓存仅按用户消息复用，忽略版本策略，满分与零成本不足以支撑候选效果结论。
- 决策：复用 EvaluationService → AgentRuntime → MultiAgent → Gateway adapter；服务端内部选项与 AsyncLocalStorage 在每个 Lab 评测上下文中禁止答案缓存读写，不增加客户端开关或全局可变状态。普通 Interview 路径保持现有配置，产品缓存的上下文指纹治理另行处理。
- 发布门升级为 v4，要求两版都有 `semantic-cache-bypass/v1` 证据。历史运行不删除或改写，但不能进入新发布门；任何重跑仍受数据批准、样本上限、额度和成本阈值约束。
- 替代方案：清空共享缓存会影响其他请求且无法保护后续重复运行；只按版本分桶仍会令三次重复样本复用第一次答案，均不适合作为本次策略评测。
- 成本：真实 Provider 调用和延迟会高于答案缓存命中；Provider Prompt 输入缓存仍可使用，因为它保留本次答案生成及真实 usage。该合同不等于关闭 Provider 所有缓存，也不意味着已通过财务对账。

## 17. 产品答案缓存只复用完整请求的文本结果

- 日期：2026-10-08。旧缓存按最后一句用户问题和语义相似度复用，会忽略历史、系统策略、模型及生成限制；面试中相似问题不构成可安全复用的证据。
- 决策：保留 Gateway 内部 `semanticCacheType`、白黑名单及 `semantic_cache` 遥测兼容名，存储升级为 `answer-cache/v2`。SHA-256 指纹覆盖完整消息（保持大小写/空白与顺序）、其他模型输入、有效 temperature/maxTokens、当前主路由 Provider/Model、认证组织/用户、面试和当前套餐输入/输出限制；同步与流式分桶。追踪 ID 与调用方身份不参与安全边界。
- 复用 Redis 精确层，TTL 为一小时；不再执行答案 embedding/Qdrant 相似检索。旧 Redis/Qdrant 数据既不读取也不删除，新 key 不包含原文或身份明文。缓存值只包含文本结果、指纹与随机 ID。
- 工具请求/工具历史、非 JSON 或不支持的上下文、缺失认证用户、黑名单、策略不可用、套餐禁用或超大输入均不能命中。仅主路由 `stop` 完整文本写缓存；截断、异常、工具结果和 fallback 不写。写入前核对原子额度预留的实际输出限制，避免套餐变化污染旧桶。
- 套餐约束通过既有 Prisma 只读查询获取，不消费 LLM_CALL；miss 后仍执行原子额度预留。命中不调用模型、不新增模型账本，记录零 Token；流式命中也提供真实的零 usage。缓存读取/写入故障只影响优化路径。
- 取舍：精确匹配与面试隔离降低命中率，miss 可能提高模型调用、延迟与费用；每次缓存候选新增一次只读套餐查询。避免答案 embedding 的额外费用，但不宣称净成本下降或模型质量改善。Lab 评测继续无条件绕过答案缓存，不能用产品缓存结果做质量证据。
- 无表、迁移、公开 API、UI 或依赖变化。旧 Qdrant 数据保留策略、真实费用/延迟 Benchmark 及 Provider 模型别名更新治理另行处理；固定别名背后模型变更不能被本地指纹实时发现，TTL 仅限制复用窗口。

## 18. 持久化评测任务与禁止自动付费重放

- 日期：2026-10-08。同步 HTTP 评测可能超时；连接中断不能证明任务取消，重复提交可能重复计费。
- 决策：复用 AgentEvaluationRun、Prisma、PostgreSQL 和 EvaluationService，不引入队列依赖。POST 要求 16–100 字符 requestKey，先持久化 PENDING，返回 202 和查询地址；同组织/工作区相同键与指纹复用已有任务，不同内容返回 409。指纹固定版本、数据集、评估器、重复次数、有效预算及资产内容。
- 加性迁移增加请求/租约字段、进度及唯一索引；部分唯一索引限制每个组织/工作区/Agent 同时一个新任务。历史同步记录不消费、不重放。每两秒轮询并按组织轮转，条件更新原子领取；每进程串行执行，副本由数据库竞争保护。
- 每十秒续心跳，六分钟过期标记 FAILED，保留结果与费用小计，标注中断费用不可用。不自动重试、重新排队或续跑；管理员核验费用后须显式创建新请求。失效执行器不能覆盖终态，已发出的在途请求不能被本地租约取消。
- 后台恢复认证用户和组织范围，执行前及每个样本边界重查数据库 ADMIN。资产变更在模型调用前拒绝；仍经现有额度、缓存隔离和预算检查。没有模型调用绕过入口，不保存额外候选人正文。
- UI 轮询真实进度，网络重试保留原键；未知总数不推算百分比，未知成绩/费用不显示为零。比较限定 Dataset/Evaluator，条件变化清除旧比较。
- 取舍：增加数据库轮询与进度写入；不是高吞吐队列，没有取消接口、跨进程暂停或崩溃精确结算。预算仍是软停止阈值，最多超出一个在途样本。规模扩大再评估专用队列；离线 fixture 不证明真实质量或账单一致。

## 19. 冻结兼容依赖与可追溯本地安全补丁

- 日期：2026-10-08。生产依赖审计发现 critical/high 项，原 CI 还存在失败 lint 被吞掉和 npm/pnpm 合同不一致。
- 决策：三端统一 pnpm 9.0.0、官方 registry 与 frozen-lockfile；兼容升级 Multer、MCP SDK 等依赖，CI 严格执行 lint/type/test、真实 Redis、专用 PostgreSQL 升级及三端 Docker 构建。不将离线 fixture、历史 Benchmark 或本地构建当作当前商业效果/远端成功。
- braces 3.0.3 无上游修复，使用 pnpm patch 在字符串解析前限制嵌套深度 32，并沿实际 DeepAgents 依赖链验证深层模式拒绝与正常模式兼容。补丁进入锁文件与所有 Docker 构建；不修改审计版本或隐藏 high。不保证恶意手工 AST 路径，主版本升级须重新审查。
- 取舍：超深模式被拒绝；需承担补丁维护。NestJS / Router 等剩余项跨主版本，列为独立迁移，不在兼容修复中推倒现有架构。审计仍为 0 critical / 1 high / 6 moderate；没有已批准的风险豁免或零漏洞结论。
- 无新增 schema、公开 API 或模型调用路径；上传依赖变化用真实 multipart HTTP 回归。main 合并与生产安全验收分开记录，剩余风险不能被 CI 工程绿灯替代。

## 20. 安全主版本迁移与完整 AST 防护

- 日期：2026-10-08。用户要求完成剩余优化后合并；沿用模块化单体，将 NestJS 固定为 11.2.7 / Config 4.0.4、Router 7.18.4，mem0ai 的 uuid 定向覆写为支持 CommonJS 的 11.1.1。保持 Node 20 与 React 18，不扩大到 NestJS 12 或 Router 8。迁移依据为 [NestJS 11 发布说明](https://github.com/nestjs/nest/releases/tag/v11.0.0)和 [Router 7 发布说明](https://github.com/remix-run/react-router/releases/tag/react-router@7.0.0)。
- 原 braces 补丁只保护字符串。新增回归先在旧补丁复现失败，再以迭代 AST 验证保护公开和 lib 编译、展开、字符串化入口：深度 33（根为 0、32 层块及叶节点）、20,000 节点、祖先循环拒绝；展开过程的 parent 链另设有界检查，允许正常解析器反向引用及非循环共享节点。字符串解析的 32 层上限保持不变。
- 官方生产审计降为 0 critical / 1 high / 0 moderate / 0 low。唯一 high 是 [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)，仍无上游发布修复；审计如实保留。此为指定漏洞的本地代码修复，不能宣称上游零漏洞或独立第三方审计。补丁 SHA-256 固定于 CI；新 advisory、补丁变动或防护回归失败均阻止交付。
- 无数据库迁移、API 签名或业务模型策略变化。上传、SSE 注入、SDK 模式及双端导航实际验收；主版本变化需全量类型、测试、构建及冻结镜像 CI 通过后合并。维护成本为本地补丁与框架兼容复验。
