# 架构地图

## 2026-09-29 · Phase 2 交接（最新）

新增 OrganizationsModule：JWT 解析数据库组织身份 → TenantInterceptor/AsyncLocalStorage → Prisma 查询过滤与复合外键；知识库/题库按组织使用独立 collection。Plan/UsageLedger → QuotaService 组织行锁 → 模型调用前原子消费；默认网关与 DeepAgents transport 共用额度服务。SessionCost 仍负责观测，不用于准入。详情见 ADR 13/14。

## 2026-09-29 · Phase 1 交接（历史）

认证通过 AuthSessionService 使用 Redis 实现轮换与吊销；限流仍为单实例内存。题库 URL 导入使用 DNS 验证并固定 HTTPS Agent 连接。命令 Guard 与执行器共享 command-policy，OS 级容器隔离见 docs/agent-sandbox-roadmap.md（尚未实现）。


最后更新：2026-08-26
权威范围：当前默认 NestJS 路径。本文件区分已交付架构和规划能力，不将 `apps/py-api` 视为生产依赖。

## 在线运行时

```text
候选人或管理员
  -> React Web（apps/web）
  -> NestJS API /api（apps/api）
     -> 独立 Migration Job 完成 Baseline / Checkpoint 初始化
     -> JWT Guard、RBAC、资源归属、校验、限流/成本边界
     -> Interview Lifecycle 与 SSE Flow Controller
  -> Interview Orchestration / Training Recommendations
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

## Agent Lab 控制面

```text
管理员
  -> apps/agent-lab（独立 5175 控制台与登录会话）
  -> NestJS /api/admin/mcp-servers（ADMIN RBAC）
  -> McpRegistry
  -> NestJS /api/agent-lab（ADMIN RBAC）
     -> Dataset / Agent Version / Run / Failure / Experiment / Release Decision / Operation Log
     -> PostgreSQL
```

Agent Lab 管理系统级 MCP 状态、启停、服务健康检查、配置重载和版本化评测发布事实。运行只保存
数据集版本、输入 Hash、阶段摘要、质量/结构化有效性/延迟/Token/成本指标和 Failure Taxonomy；
候选人原文、Prompt、检索内容、工具原始输入与思维链不能进入控制面。`RECORDED` 运行自动需要
人工发布审查；管理员显式记录的决策不触发自动部署。它不读取候选人领域数据，也不替代 Interview
的运行时或数据模型；候选人 Web 只保留用户级工具偏好。

Interview 与 Agent Lab 共享响应式、可访问性和状态语义，但使用独立 Shell、导航和内容密度。候选人
移动端导航只进入训练闭环；Agent Lab 的静态架构图不代表正在运行的 Agent。

离线 `EvalReport` 经显式 CLI 脱敏为 Receipt 后，提交为 `LabRecordedImport`。控制台只允许管理员
对 `PENDING` Receipt 执行一次导入；服务器通过原子状态声明防重，并审计提交者、执行者、Run 引用
与失败状态。浏览器从不接收报告本机路径或原始报告内容。

管理员可从同一 Dataset 的不同 Agent Version Run 组成 Control/Treatment Experiment。人工发布决策只
接收固定理由代码并保存成受限审计说明；`APPROVE`、`NEEDS_REVIEW`、`REJECT` 均不调用部署、模型或
运行时写路径。

`/api/agent-lab/audit` 是管理员只读审计入口。它只允许 Kind、精确 Dataset/Agent 标识、Kind 对应
状态、日期范围和固定上限分页；服务端按模型映射安全摘要，拒绝任意字段、JSON/文本搜索和候选人数据
检索。

`/api/agent-lab/operation-logs` 独立记录受控管理请求的主体、固定动作、固定对象、结果和时间。它不
保存请求正文、自由文本对象、错误详情、候选人数据或 Prompt，也不替代现有领域审计记录。

## 离线评估平面

已实现部分：

```text
Golden Dataset + Schema
  -> Eval Runner / Reporter
  -> 版本化 Agent Lab Dataset / Run / Failure
  -> 成对 Experiment Comparison
  -> Release Decision Audit Record
  -> API Test 与 Browser Acceptance
```

现有离线 Runner 已可显式提交脱敏 Receipt；自动调度和报告保留策略仍需单独任务，不能用静态 UI
数据或无界 Provider 调用替代。

## 边界

- 浏览器中的鉴权提示不是安全边界；NestJS Guard 和 Ownership Check 才是。
- 管理员题库/知识写入和 MCP 管理必须保持服务端授权。
- Provider Key 和外部 MCP 配置不能进入源码。
- `EvaluationRun` 是完整评价历史；`Report` 仅是当前候选人展示快照。PREVIEW/PRACTICE 不得写入正式 Report 或技能状态。
- `Interview` 记录完整模拟或单技能练习；单技能练习必须引用用户拥有的 TargetJob 技能。Question 保存选择快照和追问目的，避免依赖自由文本重建面试事实。
- TrainingRecommendation 只关联同一用户/岗位的 FINAL Evidence、技能和岗位档案版本；TrainingAttempt 记录完成与复测关联，不能直接修改 CandidateSkillState。
- 重试的 `clientMessageId` 由数据库唯一约束保护：完成请求重放已保存回复且不再调用 Agent。它不是逐 token 断点协议，Event ID/Offset 仍是后续工作。
- `JobReadinessService` 只读取当前目标岗位、可检索简历、成功 FINAL EvaluationRun 和其正式技能状态；JD 使用本地有界关键词映射，不调用模型。
- API Docker 镜像必须在 Nest 编译前运行 `prisma generate`，使新增模型和枚举进入编译时 Prisma Client。DDL 仅由独立 migration job 执行；API entrypoint 不执行 `db push`、`migrate deploy` 或 checkpoint setup。
- `/api/health/ready` 必须同时验证 PostgreSQL、Redis 和已完成的 Baseline；依赖或 migration 不可用时返回 503，不能将原始错误发送给客户端。
- 架构改动只有在代码和测试证明后才更新本地图。
