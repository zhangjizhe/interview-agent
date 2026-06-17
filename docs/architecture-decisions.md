# 架构设计决策记录

## 1. 去中心化共享上下文 (DeLM 启发)

### 决策背景
中心化多 Agent 架构存在以下问题：
- 主控 Agent 成为瓶颈，等待最慢的执行 Agent
- 信息共享需要经过中心节点，串行通信开销大
- 长上下文推理时调度日志挤占有效推理空间

### 设计方案
借鉴 DeLM (Decentralized Language Models) 论文，实现共享上下文白板：

**核心组件**:
1. **共享上下文存储** - gist（精要）+ details（详情）分层
2. **写入验证器** - 确保写入内容被证据支持
3. **过期策略** - TTL + 访问频率清理
4. **审计链** - 记录所有读写操作

**架构优势**:
- 消除中心控制器瓶颈
- Agent 间直接通信，无需主控转发
- 按需展开，优化上下文利用率

### 实现位置
`apps/api/src/modules/agent/shared-context.service.ts`

---

## 2. 记忆层治理

### 决策背景
Agent Memory 存在以下技术债：
- **上下文污染**: 过时信息未及时清理
- **维护成本**: 缺乏管理策略
- **模型退化**: 错误记忆积累导致性能下降
- **场景错配**: 非必要场景使用记忆导致噪音

### 设计方案

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

**优势**:
- 减少上下文占用
- 提高检索效率
- 更好的用户体验

### 实现位置
`apps/api/src/modules/interview/services/rag.service.ts`

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
- 中心化架构 + DeLM 启发的共享上下文
- 单 Agent 流式对话
- 基础记忆治理

### 下一阶段 (v3.0)
- 完整 DeLM 分布式架构
- 多 Agent 并行执行
- 共识机制保证一致性

### 长期目标 (v4.0)
- 完全去中心化
- 动态 Agent 编排
- 自适应资源调度