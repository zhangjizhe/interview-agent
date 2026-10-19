# 可替换 Agent 架构合同与迁移

日期：2026-10-19。状态：目标设计；未列明已实施的接口均为PROPOSED，不能当成现有SDK/API。产品规划见 [完整规划](../product/SELF_BUILT_AGENT_PLATFORM_PLAN.md)。

## 当前与目标

当前：React双应用→NestJS模块化单体→Interview/Lab服务→LangGraph或配置型模型工作流→Gateway/数据。AgentRuntimeService以字符串分支直接依赖实现；ToolRunner与配置运行尚未连通；Interview仍用legacy-sse-bridge。现有Single/Finite运行契约明确拒绝工具/知识/记忆非空绑定。

目标：领域状态与权限、版本和发布证据稳定，具体引擎/模型/检索/评测/观测可以替换。保留Prisma/PostgreSQL事实来源；Redis和向量索引不是身份/发布事实来源。

## Ports与适配器

| Port（拟定） | 输入/输出核心合同 | 默认实现/迁移 | 必须满足的约束 |
| --- | --- | --- | --- |
| RuntimeAdapter | manifest、capabilities、validate/prepare/execute；版本快照、结构化事件、最终输出 | 包装现有LangGraph及single/finite；再注册新引擎 | 不自行改业务状态/权限；有界模型/工具/时间/费用 |
| ApplicationAdapter | 应用领域输入→固定版本Run；最终输出→业务命令/证据 | Interview先做回合一致性，再会话快照 | 领域拥有会话与报告；Run版本与实际policy一致 |
| ToolProvider | schema、effect、execute、receipt、cancelCapability | MCP/builtin通过ToolRunner，不允许直调Provider | 调用前查权限/禁用/审批/预算；副作用未知不重试 |
| RetrievalPort | 查询、用户/组织、来源版本、结果/引用 | 保留Milvus/Qdrant；不先替换数据库 | 租户过滤、出处、大小与索引版本可追溯 |
| MemoryPort | 记忆范围、证据、写入/查询/删除 | 保留当前Redis/Mem0/Milvus后端 | 短期/长期分开；跨用户隔离，删除可验证 |
| EvaluatorAdapter | 版本化样本/实际输出/参考/Rubric→Score与证据 | 先包装规则；再人工/模型Judge | 错误/弃权非0分，未经校准不参与正式门 |
| ExperimentRepository | 固定数据集/评测器/Agent版本、重复/切片/比较 | 复用现有Prisma评测/发布模型 | 不变证据、同集可比、账本未知保留 |
| TelemetryExporter | 已脱敏结构化Run/Span/Score；投递回执 | 现有Langfuse可选；未来OTel/商业端 | 尽力观测失败不阻断业务；强制审计另行处理 |
| InterviewConnector | 标准化外部session/report/event；来源与许可 | 默认自建；未来具体平台官方API | 外部ID映射、签名、幂等、限额、删除；无权限即禁用 |

接口采用NestJS InjectionToken+类型合同，避免服务名字符串散落；具体命名与签名在B1实现时冻结。此处不增加未被真实入口使用的空Registry。

## 统一运行信封（目标）

`schemaVersion, organizationId, workspaceId, userId, applicationId, sessionId, runId, parentRunId, turnId, requestKey, purpose, agentVersionSnapshot, input, capabilities, budget, deadline, traceContext`。

身份从认证服务端上下文产生，不接受适配器或用户覆盖。purpose区分PRODUCTION / DRAFT_TEST / EVALUATION / RECORDED_IMPORT；录制不能升级为真实调用证据。

版本快照指向不可变AgentVersion，并含workflow/prompt/tool/knowledge/rubric/model-policy指纹；具体模型实际解析版本另写Trace。发布currentVersion指针不改已创建快照。现有Bridge本轮只保证回合内Run与policy同源；会话级持久快照需单独加性迁移。

运行输出包含状态、finalOutput、真实资源使用、费用证据状态、错误分类和结构化事件引用。结束、取消、超时、Provider已请求但结果未知必须可区分。

## 核心状态与故障

- Interview业务状态与Run状态分别持久化，通过应用层显式映射；模型输出不直接UPDATE任意状态。
- 任务领取/心跳/完成CAS使用现有PG租约；过期任务保留失败和已知费用，不自动重放。
- 准备阶段完成能力校验、资产指纹核对和预算预留后才发出模型请求；适配器缺能力返回明确错误，不静默换引擎。
- 取消只承诺实际实现的边界；在途外部调用不宣称已撤回/退款。
- Trace导出是可选副本。版本策略和安全审计是必需事实，后续必须与可选遥测拆开；当前Bridge catch-and-continue不能据此称为发布策略强制执行。
- SSE传输恢复、checkpoint恢复与外部副作用重试是三个不同合同，分别验收。

## 可替换性合同测试

每个RuntimeAdapter至少通过：未知能力拒绝、同输入/固定版本的输出Schema、预算耗尽前拒绝、租户/用户隔离、取消边界、异常费用、重放幂等、实际Trace、工具审批/禁用。每个EvaluatorAdapter至少通过：指标范围/方向、异常/弃权、评测器版本、来源标记、重复样本与同集比较。Exporter需脱敏、超时、退避上限、投递幂等、失败不改发布事实。

替换测试只要求相同合同，不要求不同模型产生完全相同文本。语义效果用冻结对比集与置信区间衡量。

## 外部平台的未来接入步骤

1. 明确具体服务、地域、账号/API授权与数据使用许可；未确认不得猜测endpoint或抓取私有题库。
2. 固定官方API/SDK合同和最小权限；凭据仅存服务器配置/密钥管理，不进入AgentVersion或Trace正文。
3. 先接去敏Trace/结果导出和只读导入，再考虑启动外部任务；签名验证、幂等、速率与费用限制独立配置。
4. 规范化原始分数范围、方向、单位、Rubric/模型版本、参考答案与来源；缺项标unknown，不直接平均不同量纲。
5. 使用沙盒/录制/合成账号验合同，之后才以用户授权有界真实Canary验接通；录制不签真实质量。
6. 支持关闭、数据删除传播与导出回自建系统。外部断开不丢领域数据；发布权始终在本地门禁。

## 迁移与回滚

B1只包装现有运行路径并做双实现合同回归；B2逐个工具切换到ToolRunner，不一次迁移全部工具；B3加会话快照和稳定事件；B4增加EvaluatorAdapter与人工校准；B5才开放受控候选生成。旧HTTP接口保留兼容，schema加字段先可空/回填验证再约束；不清账本或改组织归属。回滚切回前一已发布应用版本，保留新历史和迁移字段；需要副作用补偿时提供明确收据，不能伪称事务回滚外部调用。
