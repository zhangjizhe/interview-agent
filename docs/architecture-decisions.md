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
