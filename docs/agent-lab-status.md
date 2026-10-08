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
- 提供版本化 `EvaluationDataset`、`EvaluationCase`、`Evaluator`、`AgentEvaluationRun` 和 `EvaluationResult`。评测结果关联实际 Agent Run，按 AgentVersion 与 Dataset 版本可回溯。
- 首版评测器为确定性规则：`KEYWORD` 检查输出关键词、`JSON_SCHEMA` 检查输出字段、`LATENCY` 检查运行耗时。每条结果保存分数、阈值、断言明细、输出摘要和失败原因。

评测 API 位于 `/api/agent-lab`：创建 Dataset 与 Case、创建 Evaluator 后，调用 `POST /agents/:agentId/evaluations`，携带 16–100 字符的 `requestKey`，返回 202 持久化任务回执；同键同内容复用，不同内容 409。`GET /agents/:agentId/evaluations` 查看汇总，`GET /evaluations/:evaluationId` 查询进度和逐用例结果。输入用例必须满足目标 Agent 的输入契约，首个 Interview 适配器要求 `input.message` 非空。任务由 PostgreSQL 原子领取、心跳保护，过期失败且不自动付费重放；不是通用远程队列。

当前阶段不会替换既有 Interview 接口和 LangGraph 面试流程。Run 已记录状态、输入、输出、耗时和错误；独立 Run 现由模型网关 usage 汇总 Token 与版本化费率估算成本；缺少 usage/费率时明确标记不可用，不能视为零费用。评测不以不稳定的 LLM Judge 作为基础契约，尚未导入现有 Golden Dataset JSON。部署前必须运行 `pnpm db:deploy`。

数据库迁移由独立 migration job 在 API 启动前执行；API entrypoint 只启动服务。当前活动迁移以 production baseline 为基础，远端分叉迁移已归档，新增 `20260928000000_agent_lab_branch_integration` 已于 2026-09-30 在备份/恢复验证后应用到本机数据库，生产部署仍需单独验收。已有远端数据库必须先审计迁移历史，不能直接套用本地主基线。

当前管理员入口为独立 `apps/agent-lab`。远端 `/lab` 工作台源码保留但未挂载到候选人路由；不能宣称该入口已交付。平台评价使用 `AgentEvaluationRun/agent_evaluation_runs`，候选人评价继续使用 `EvaluationRun/evaluation_runs`。新增平台 API 均要求 ADMIN。

Trace 查询继续使用 `GET /api/agent-lab/runs/:runId/trace`，并新增 `GET /api/agent-lab/runs/:runId/trace.jsonl` 供离线回放。运行时只追加事件，不会原地覆盖历史；模型历史只从 `user.message`、`assistant.message`、`tool.result` 事件投影，标准模型可见事件不能被静默标记为不可见。当前保留策略遵循数据库生命周期，尚未提供归档或脱敏清理任务；大 payload 仍存于 PostgreSQL JSON 字段，尚未接入对象存储引用。

AgentLab 新增独立 `ToolRunner` 契约，供后续 MCP、插件和工作区 provider 接入：每次调用均写入 `tool.call`，依次经过只读 hook、只可拒绝的 guard、强制审批和 provider，最终无论成功、拒绝、取消、超时或异常均写入唯一 `tool.result`。审批默认拒绝，缺少处理器、超时或处理异常不会放行；审批请求和决定持久化到 `ToolApproval` 并通过 `callId` 关联。

首版本地执行能力只提供 `plan`（只读）和 `workspace-write`（受控工作区写入）预设，使用最小环境变量、受控临时目录、相对路径与符号链接边界检查、超时和输出大小上限。它不是 OS 级沙箱，网络放行默认拒绝，本地部署不应将其用于不受信任的任意命令；生产环境应改用受限容器或远程 worker。现有 Interview/MCP 调用尚未迁移到该管道，以避免改变已有业务流程。

可观测性与扩展前置能力：`GET /api/agent-lab/runs/:runId/trace.bundle` 导出带运行元数据、按序事件和大 payload 引用的本地 Trace bundle，可由离线 reducer 还原模型会话、工具调用/结果、终态与错误关联。生命周期遥测尽力写入，不会因为遥测异常中断 Agent Run；模型可见历史和 ToolRunner 安全审计仍为强制事件。插件使用版本化 manifest 与 capability provider，可卸载/重载且不会遗留注册；MCP 仅作为 provider，必须由调用方交给 ToolRunner 后才会执行。

子 Agent 或后台任务必须创建独立的子 Run，保存 `parentRunId`、独立 `budget`、状态和取消时间，并通过父子 Trace 事件投递创建、结果、取消或失败。`budget.maxToolCalls` 由 ToolRunner 基于已追加的 `tool.call` 事件强制执行，父 Run 和子 Run 均适用。当前仅提供状态与审计契约，不包含队列调度器、远程 worker 或自动重试；这些能力将在真实隔离执行环境完成后接入。截至 2026-09-30，当前迁移已应用到本机默认数据库；其他环境部署前仍必须执行独立 migration job。


## 2026-09-30 可观测性增量

新增受专用凭据保护的 Prometheus 指标：模型尝试/耗时/真实 usage、安全拒绝和 SSE 活跃连接；JSON 日志与 Helmet 已接入，Prometheus/Grafana 为可选 profile。仅声明监控基础，不声明 Agent 质量改善。

## 2026-10-02 受控自进化首版

失败分析 → 改进候选 → 同数据集对比 → 人工批准 → Interview 使用已批准版本的工程闭环已实现。失败分类只映射到服务端固定改进策略并生成 `DRAFT` AgentVersion；草稿只在 Lab 评测内部显式放行。v4 发布门要求冻结且经审查的同指纹 Dataset/Evaluator、3–5 次重复的缓存隔离证据、完整样本、质量及切片/统计非劣效、Token/延迟/费用资源边界；缺失证据即拒绝。只有 ADMIN 显式发布才更新当前版本，Interview 从下一回合读取该 `PUBLISHED` 策略。关键词评估仅表示术语遵循，完整真实业务对比尚未通过。

该能力不包含 LLM 自动改写、自动发布或效果声明。真实验收已证明失败候选返回 `REJECT` 且不能发布；独立 Run 的 Token/费用已接入；完整可信版本对比尚未完成。详见 `docs/ACCEPTANCE-REPORT-2026-10-02-CONTROLLED-EVOLUTION.md`。

## 2026-10-08 真实评测核验边界

Lab 版本评测强制隔离语义答案缓存，v4 发布门拒绝缺少隔离证据的旧结果。固定 12 Case 已批准；真实隔离基线因月度额度失败（13/36 成功样本），候选未重跑或发布。工程门禁通过不等于业务质量验收通过，当前完整可信对比仍待额度及中断费用核验后重跑。详见 `docs/ACCEPTANCE-REPORT-2026-10-07-CURATED-REAL-EVALUATION.md`。
