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

**质量评估维度**:
1. **完整性** - 回答长度 + 关键词匹配
2. **正确性** - 内容正确性指标
3. **深度** - 技术深度指标

**自适应策略**:
- `score < 0.5`: 生成跟进问题深入追问
- `score > 0.8`: 生成进阶问题提升难度
- `0.5 <= score <= 0.8`: 正常流程

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
- 禁用阻塞式 Multi-Agent
- 直接走单 Agent 流式路径

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
- 完整 DeLM 分布式架构（多 Agent 并行执行 + 共识机制）
- HITL 中断框架接入前端
- 分布式缓存（Redis Cluster）

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
  questionIndex: number,
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
