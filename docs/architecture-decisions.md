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
