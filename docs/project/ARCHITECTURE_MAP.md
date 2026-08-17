# 架构地图

最后更新：2026-08-15
权威范围：当前默认 NestJS 路径。本文件区分已交付架构和规划能力，不将 `apps/py-api` 视为生产依赖。

## 在线运行时

```text
候选人或管理员
  -> React Web（apps/web）
  -> NestJS API /api（apps/api）
     -> 独立 Migration Job 完成 Baseline / Checkpoint 初始化
     -> JWT Guard、RBAC、资源归属、校验、限流/成本边界
     -> Interview Lifecycle 与 SSE Flow Controller
  -> InterviewAgentService
        -> LangGraph Multi-Agent Runtime（默认）
        -> DeepAgents 降级或 Direct LLM 降级
        -> 统一 LLM Gateway
           -> Qwen 主用 / DeepSeek 备用
           -> Health Check、Circuit Breaker、Exact/Semantic Cache
           -> Langfuse Trace 与 Session Cost Tracking
     -> Resume Parser、Question Bank、Knowledge Base、MCP Registry
     -> Target Job / JD / Job Readiness Service
     -> PostgreSQL / Redis / Milvus / Qdrant
```

## 持久化存储与职责

| 存储 | 当前职责 |
| --- | --- |
| PostgreSQL / Prisma | 用户、目标岗位、技能定义/状态、面试、规范化问题/回答、不可变评估运行/证据、报告展示快照、Session Cost、AnswerHistory、ReflectionLog、任务、工具偏好和 Graph Checkpoint。 |
| Redis | 短期记忆、队列、缓存相关状态和 HITL 协调。 |
| Milvus | 简历与题库向量检索，包括 Hybrid Retrieval 支持。 |
| Qdrant | Knowledge Base 存储与召回。 |
| Langfuse | 配置完成时的外部 Trace/Observability Integration。 |

## 面试请求链路

```text
认证用户回答
  -> 资源归属与面试状态校验
  -> 客户端消息 ID 幂等声明（重放已完成回复或等待首次请求）
  -> 简历上下文与题目检索
  -> Agent Engine 选择
  -> 流式模型/Agent 事件
  -> SSE 返回浏览器
  -> 持久化 Message、模式/岗位版本快照、Question 选择元数据、Answer、兼容 History、Task/Checkpoint、Cost 和 Trace 信号
  -> 结束面试 -> 创建不可变 FINAL EvaluationRun / AssessmentEvidence
  -> 显式切换 Report 当前展示快照
```

浏览器应将事件呈现为专业面试体验。Planner、Executor、Reviewer 和 Tool 细节是实现信号，不是默认候选人内容。

## 候选人 Web Shell

```text
认证候选人
  -> 首页：当前目标岗位 + 真实准备度/证据不足 + 下一步
  -> 岗位设置：TargetJob / 可选文本 JD
  -> 面试记录：继续会话 / 打开评价 / 评价失败重试
  -> 面试房间：问题、回答、简历确认和候选人可见复核状态
```

`/api/interview/target-jobs` 与 `.../:targetJobId/readiness` 是岗位与准备度的唯一前端数据源。
候选人路由不展示 Token、模型、Prompt、RAG、MCP、工具调用、Agent 事件或内部复核输入。

## 离线评估平面

已实现部分：

```text
Golden Dataset + Schema
  -> Eval Runner / Reporter
  -> API Test 与 Benchmark Script
  -> 验收截图与 JSON 证据
```

计划中部分：

```text
Agent/Prompt Version Registry
  -> 可复现实验记录
  -> 失败分析
  -> Agent 改动发布批准
```

## 边界

- 浏览器中的鉴权提示不是安全边界；NestJS Guard 和 Ownership Check 才是。
- 管理员题库/知识写入和 MCP 管理必须保持服务端授权。
- Provider Key 和外部 MCP 配置不能进入源码。
- `EvaluationRun` 是完整评价历史；`Report` 仅是当前候选人展示快照。PREVIEW/PRACTICE 不得写入正式 Report 或技能状态。
- `Interview` 记录完整模拟或单技能练习；单技能练习必须引用用户拥有的 TargetJob 技能。Question 保存选择快照和追问目的，避免依赖自由文本重建面试事实。
- 重试的 `clientMessageId` 由数据库唯一约束保护：完成请求重放已保存回复且不再调用 Agent。它不是逐 token 断点协议，Event ID/Offset 仍是后续工作。
- `JobReadinessService` 只读取当前目标岗位、可检索简历、成功 FINAL EvaluationRun 和其正式技能状态；JD 使用本地有界关键词映射，不调用模型。
- API Docker 镜像必须在 Nest 编译前运行 `prisma generate`，使新增模型和枚举进入编译时 Prisma Client。DDL 仅由独立 migration job 执行；API entrypoint 不执行 `db push`、`migrate deploy` 或 checkpoint setup。
- `/api/health/ready` 必须同时验证 PostgreSQL、Redis 和已完成的 Baseline；依赖或 migration 不可用时返回 503，不能将原始错误发送给客户端。
- 架构改动只有在代码和测试证明后才更新本地图。
