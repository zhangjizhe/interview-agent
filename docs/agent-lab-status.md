# AgentLab 能力与迁移边界


本项目正在从 AI 面试应用逐步演化为 AgentLab。Interview Agent 是 AgentLab 的第一个真实应用，而不是平台边界。

当前已完成 Phase 1、Phase 2 与 Phase 3 的基础能力：

- 以 NestJS `apps/api` 作为唯一主线。
- 新增默认 Workspace、Agent、AgentVersion 的领域模型和数据库迁移。
- 提供 Agent Registry：创建、查看、编辑、删除、克隆 Agent；创建、发布和回滚 AgentVersion。
- 通过 `POST /api/agent-lab/bootstrap/interview-agent` 幂等注册当前 `Interview Agent v1.0.0`。
- 新增 `Application` 与 `ApplicationRun`：`POST /api/agent-lab/applications/bootstrap/interview` 幂等注册 Interview Application。每轮既有 Interview SSE 在不改变 RAG、记忆、任务队列和流式响应的前提下，旁路创建和完成对应的 Lab Run，并通过 `externalRunId` / `externalSessionId` 关联原始面试。
- 提供独立运行接口 `POST /api/agent-lab/agents/:agentId/run`，并持久化 Run 与有序 TraceEvent。
- 提供 Run 列表、详情和 Trace 查询接口。首个适配器复用现有 `MultiAgentService`，不改变 Interview 控制器。
- TraceEvent 采用追加式事件契约：包含 `formatVersion`、单调 `seq`、`turnId`、`step`、`callId`、JSON-safe payload 与模型可见标记。支持 `turn.start/end`、`user.message`、`assistant.message`、`tool.call/result`、审批与失败事件。
- 提供版本化 `EvaluationDataset`、`EvaluationCase`、`Evaluator`、`EvaluationRun` 和 `EvaluationResult`。评测结果关联实际 Agent Run，按 AgentVersion 与 Dataset 版本可回溯。
- 首版评测器为确定性规则：`KEYWORD` 检查输出关键词、`JSON_SCHEMA` 检查输出字段、`LATENCY` 检查运行耗时。每条结果保存分数、阈值、断言明细、输出摘要和失败原因。

评测 API 位于 `/api/agent-lab`：创建 Dataset 与 Case、创建 Evaluator 后，可调用 `POST /agents/:agentId/evaluations` 同步执行已发布版本；`GET /agents/:agentId/evaluations` 查看汇总，`GET /evaluations/:evaluationId` 查看逐用例结果。输入用例必须满足目标 Agent 的输入契约，首个 Interview 适配器要求 `input.message` 非空。

当前阶段不会替换既有 Interview 接口和 LangGraph 面试流程。Run 已记录状态、输入、输出、耗时和错误；Token 与成本仍依赖现有 Interview 会话统计，独立 Run 会明确标记该指标暂不可用。评测不以不稳定的 LLM Judge 作为基础契约，尚未导入现有 Golden Dataset JSON。部署前必须运行 `pnpm db:deploy`。

Docker API 启动时只执行 `prisma migrate deploy`，迁移失败会阻止服务接收流量，不再使用 `db push --accept-data-loss` 或吞掉 schema 错误。`20260817110000_add_interview_workflow_persistence` 为历史上由 `db push` 创建的面试任务、答题历史、反思日志与简历确认字段补齐版本化契约，对已存在对象保持幂等。升级已有开发库前应先比对当前 schema，再使用 `prisma migrate resolve --applied` 登记已验证存在的历史 migration；不要以删除业务表的方式强行对齐。

Web 端新增 `/lab` 工作台，包含概览、Application、Agent、Run/Trace 和离线评测视图；Trace 的 JSONL 导出仍使用受 JWT 保护的 API 请求。数据集可从页面创建并录入 Interview 输入用例，评测器仅支持 `KEYWORD`、`JSON_SCHEMA`、`LATENCY` 三种确定性规则。当前工作台不提供版本编辑器、批量导入或 LLM Judge，这些能力不能被视为已交付。

Trace 查询继续使用 `GET /api/agent-lab/runs/:runId/trace`，并新增 `GET /api/agent-lab/runs/:runId/trace.jsonl` 供离线回放。运行时只追加事件，不会原地覆盖历史；模型历史只从 `user.message`、`assistant.message`、`tool.result` 事件投影，标准模型可见事件不能被静默标记为不可见。当前保留策略遵循数据库生命周期，尚未提供归档或脱敏清理任务；大 payload 仍存于 PostgreSQL JSON 字段，尚未接入对象存储引用。

AgentLab 新增独立 `ToolRunner` 契约，供后续 MCP、插件和工作区 provider 接入：每次调用均写入 `tool.call`，依次经过只读 hook、只可拒绝的 guard、强制审批和 provider，最终无论成功、拒绝、取消、超时或异常均写入唯一 `tool.result`。审批默认拒绝，缺少处理器、超时或处理异常不会放行；审批请求和决定持久化到 `ToolApproval` 并通过 `callId` 关联。

首版本地执行能力只提供 `plan`（只读）和 `workspace-write`（受控工作区写入）预设，使用最小环境变量、受控临时目录、相对路径与符号链接边界检查、超时和输出大小上限。它不是 OS 级沙箱，网络放行默认拒绝，本地部署不应将其用于不受信任的任意命令；生产环境应改用受限容器或远程 worker。现有 Interview/MCP 调用尚未迁移到该管道，以避免改变已有业务流程。

可观测性与扩展前置能力：`GET /api/agent-lab/runs/:runId/trace.bundle` 导出带运行元数据、按序事件和大 payload 引用的本地 Trace bundle，可由离线 reducer 还原模型会话、工具调用/结果、终态与错误关联。生命周期遥测尽力写入，不会因为遥测异常中断 Agent Run；模型可见历史和 ToolRunner 安全审计仍为强制事件。插件使用版本化 manifest 与 capability provider，可卸载/重载且不会遗留注册；MCP 仅作为 provider，必须由调用方交给 ToolRunner 后才会执行。

子 Agent 或后台任务必须创建独立的子 Run，保存 `parentRunId`、独立 `budget`、状态和取消时间，并通过父子 Trace 事件投递创建、结果、取消或失败。`budget.maxToolCalls` 由 ToolRunner 基于已追加的 `tool.call` 事件强制执行，父 Run 和子 Run 均适用。当前仅提供状态与审计契约，不包含队列调度器、远程 worker 或自动重试；这些能力将在真实隔离执行环境完成后接入。新的迁移尚未在数据库应用，部署前必须执行 `pnpm db:deploy`。

