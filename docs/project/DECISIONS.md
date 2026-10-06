# 架构决策

## 2026-10-07 · 以 Case 为单位的分层非劣效发布门（最新）

已接受：重复运行先在每个 Case 内聚合，再以 Case 作为独立统计单位；候选与同指纹基线按 Case key 完整配对。发布 Dataset 至少 10 Case，必须提供岗位族、技能、难度标签和最小切片覆盖。双侧 95% Student t 区间采用 -2 分非劣效边界，任一切片平均回归超过 5 分时拒绝。该门用于工程发布保护，不解释为因果效果证明；证据不足必须拒绝发布。

## 2026-10-05 · 版本化 Provider/Model 费率目录（最新）

已接受：模型成本必须由实际 Provider/Model、Token 用量和带版本的集中目录计算；目录记录币种、生效时间、官方来源和计价口径。未知费率或无效配置必须显式不可用，不能回退到通用单价或零成本。Session Cost 保存目录版本与可用状态；公开费率估算和 Provider 账单对账是两类证据，没有账单样本时不得声明财务一致。

## 2026-10-04 · 冻结评测证据与资源门禁（最新）

已接受：发布证据 Dataset 一经冻结即不可修改，内容指纹与数据库 trigger 是发布审计事实；重复评测保持 1–5 次有界，发布至少 3 次且基线/候选次数相同；P95 延迟、真实 Token 和配置单价的保守成本估算任一缺失或相对基线回归超过 20% 时拒绝发布。成本估算用于工程门禁，不等同 Provider 账单；管理员仍需显式发布。

## 2026-09-30 · Phase 3 交接（最新）

ADR 15 已接受：低基数指标、独立抓取凭据、可选监控 profile、JSON 日志与完整迁移就绪检查。平台指标不使用普通用户 JWT；监控接入不等于 Agent 质量提升。默认保持原计划 prom-client，后继包独立兼容验收。

## 2026-09-29 · Phase 2 交接（历史）

已接受 ADR 13（组织身份、查询边界、复合外键及向量集合）与 ADR 14（运营套餐、原子额度及 DeepAgents 兼容边界），完整依据见 docs/architecture-decisions.md。次数门禁不等于总费用预算；未经部署验收不宣称商用发布完成。

## 2026-09-29 · Phase 1 交接（历史）

安全边界选择：Redis 会话故障拒绝访问，吊销状态必须持久化；命令白名单只约束入口，生产不可信执行必须容器化。详见 docs/architecture-decisions.md ADR 12 与 docs/agent-sandbox-roadmap.md。


最后更新：2026-08-26

此登记册只记录未来工作需要理解的长期决策。历史实现细节见 `docs/architecture-decisions.md`，不在此重复每个代码级选择。

## ADR-CTX-001：Repository Context Layer

- 日期：2026-08-13
- 状态：已接受
- 背景：新的 Codex Task 需要在不依赖聊天历史、不加载整个仓库的情况下恢复真实项目状态。
- 决策：在 `docs/project/` 维护简洁的当前上下文，并通过 `CONTEXT_INDEX.md` 路由任务相关阅读。使用 `ACTIVE_TASK.md` 和 `THREAD_HANDOFF.md` 作为任务边界。
- 原因：Repository 维护的选择性上下文可审计、跨 Thread 保留，并降低 Context 成本。
- 替代方案：大型重复 Prompt、隐式 Chat Memory、持续膨胀的单一项目笔记。
- 取舍：任务边界需要维护文档；过期描述必须以代码为准进行修正。

## ADR-001：默认产品运行时

- 日期：2026-08-13 前
- 状态：已接受
- 背景：仓库同时存在 NestJS 和实验性 Python 实现。
- 决策：React + NestJS + Prisma + LangGraph 路径是默认产品运行时。
- 原因：该路径拥有文档化的测试、Docker 部署、鉴权和验收证据。
- 替代方案：将 `apps/py-api` 提升为主服务。
- 取舍：实验性 Python 工作保持隔离，不能定义产品行为。

## ADR-002：可配置 Agent Engine

- 日期：2026-08-13 前
- 状态：已接受
- 背景：应用既需要功能完整的默认 Agent，也需要受控降级模式。
- 决策：默认使用 LangGraph Multi-Agent；通过配置保留 DeepAgents 和 Direct LLM 兜底。
- 原因：提供可恢复的默认路径，不把运行时风险压在单一 Engine 上。
- 替代方案：硬编码唯一运行时 Engine。
- 取舍：多 Engine 增加验证和行为一致性要求。

## ADR-003：用户数据纵深防御

- 日期：2026-08-13 前
- 状态：已接受
- 背景：面试、简历、成本和知识数据均属于用户或管理员范围。
- 决策：服务端强制 JWT Default-deny、RBAC 和资源归属。
- 原因：客户端导航和隐藏控件不能构成访问控制。
- 替代方案：只在 UI 中限制访问。
- 取舍：新路由需要明确鉴权和 Ownership Test。

## ADR-CTX-002：先证据，后训练结论

- 日期：2026-08-13
- 状态：已接受
- 背景：产品需要准备度、技能、训练和回放，但当前 Report 与 AnswerHistory 缺少稳定技能/证据/版本合同。
- 决策：先实现规范化 Assessment Evidence 和 Skill State 合同，再展示候选人准备度、技能趋势、训练或成长结论。
- 原因：没有可归属证据的分数会误导用户，也无法审计评估回归。
- 替代方案：从 Report JSON 或临时 Working Memory 推导图表；用占位分数先上线 UI。
- 取舍：产品 UI 要等待数据/API 基础，但最终体验可解释、安全且可测试。

## ADR-CTX-003：不可变评估定义与报告快照

- 日期：2026-08-13
- 状态：已接受
- 背景：评估器、Prompt、模型、规则或运行模式变化时，不能与旧评价运行共享幂等范围；现有 `Report` 对同一面试只能保存一条记录。
- 决策：以不可变 `EvaluationDefinition` 版本定义完整评价行为。`EvaluationRun` 保存不可变完整结果；
  `Report` 保持单一候选人展示快照，并通过 `currentEvaluationRunId` 显式指向当前已批准运行。
- 原因：保留 Prompt/Model 降级、重跑和评分口径变化的可审计历史，同时避免破坏现有 `Report.interviewId` 唯一约束。
- 替代方案：只用 evaluator/rubric 版本做幂等；将 `Report` 改为多版本历史表；继续用 upsert 覆盖报告。
- 取舍：增加定义、运行与快照之间的迁移和查询复杂度，但不丢失历史，也避免不同模型或 Prompt 错误命中同一运行。

## ADR-CTX-004：实际 Schema 基线与独立 Migration Job

- 日期：2026-08-15
- 状态：已接受
- 背景：开发数据库存在业务表和 LangGraph checkpoint 表，但没有 `_prisma_migrations`；旧迁移链包含空目录且无法精确重建实际应用 Schema，API entrypoint 曾以 `db push ... || true` 隐藏失败。
- 决策：以完成恢复演练的实际 PostgreSQL Schema 生成单一 Baseline，并保留旧链为审计资料。Docker 的 migration job 运行 `migrate deploy`、checkpoint 初始化和 `migrate status`；API 运行时不再拥有 DDL 初始化职责。
- 原因：数据库事实可恢复、可验证且不能被静默同步。Checkpoint 是运行前置，不得依赖 API 请求路径临时建表。
- 替代方案：继续使用旧 migration 链、以 `migrate resolve` 标记旧文件、保留 API `db push`、让 MultiAgentService 在启动时调用 checkpoint setup。
- 取舍：本机已有库需在备份、恢复、指纹与数据对账后显式登记 Baseline；后续 datamodel 与历史物理约束的差异必须以加性 migration 收敛。

## ADR-CTX-005：候选人流式请求幂等与完成回复重放

- 日期：2026-08-15
- 状态：已接受
- 背景：浏览器在断流后重试同一 POST 会创建重复用户消息，并可能再次进入 Agent 和成本路径。当前 SSE 未持久化 token 事件，不能安全提供逐 token offset 恢复。
- 决策：浏览器为一次提交生成并复用 `clientMessageId`；数据库唯一约束将其关联到候选人 Message。已完成请求只重放已保存的 assistant Message，处理中请求不再次进入 Agent。
- 原因：在不改变 LangGraph、Gateway 或候选 SSE 白名单的前提下，先保证回答与成本不会被客户端重试重复写入。
- 替代方案：仅依赖前端文本去重、在控制器内存中去重、立即建设 Event Log + `Last-Event-ID`。
- 取舍：连接在生成中断开时只能等待原请求完成后重放最终内容；逐 token 续传需以单独的事件持久化、保留和成本对账设计处理。

## ADR-CTX-006：训练完成不等于技能提升

- 日期：2026-08-17
- 状态：已接受
- 背景：训练建议需要可执行闭环，但仅凭用户标记完成不能证明真实能力提高。
- 决策：TrainingRecommendation 只由成功 FINAL Evidence 和正式技能状态生成；TrainingAttempt 保存完成和复测关联。CandidateSkillState 仍只由后续成功 FINAL EvaluationRun 聚合更新。
- 原因：保持训练建议、训练行为和能力结论之间的可追溯因果链，避免伪造提升。
- 替代方案：训练完成即提高技能分数；从自由文本 Report/AnswerHistory 生成训练结论。
- 取舍：用户需完成复测后才能看到正式变化，闭环更慢但数据诚实且可审计。

## ADR-CTX-007：Agent Lab 独立控制平面，Interview 作为应用层

- 日期：2026-08-19
- 状态：已接受
- 背景：现有 Agent、MCP、Trace、Golden Dataset、Harness 和管理界面分散在 Interview 代码与候选人 Web 中。候选人训练体验不应成为 Agent 运行与治理的控制台。
- 决策：Agent Lab 是独立的 Agent 编排与控制平台，负责受控运行、MCP/工具治理、Trace、评测、实验和发布决策。Interview 是第一个接入它的应用层，继续拥有候选人、面试、评价、技能和训练领域事实。以独立 `apps/agent-lab` 控制台和稳定管理 API 作为第一增量；现有 NestJS 运行时暂不拆分。
- 原因：将通用 Agent 工程能力与业务应用清晰隔离，防止内部状态泄露到候选人端，并能在不破坏已验证面试闭环的前提下逐步形成可复用平台。
- 替代方案：继续把 Agent/MCP 控制放在候选人 Web；立即重写为独立微服务；仅维护 Langfuse 外部界面而不建立产品边界。
- 取舍：短期内 Agent Lab 前端与控制 API 仍复用 NestJS 身份和 MCP Registry，运行时尚未完全物理拆分；后续必须以版本化 API、数据脱敏、RBAC/审计和 Harness 发布证据推动服务边界，而非按目录复制代码。

## ADR-CTX-008：Agent Lab 录制评测与人工发布决策

- 日期：2026-08-26
- 状态：已接受
- 背景：Golden Dataset、Runner、Trace 与成本资产已有，但没有版本化、可审计的控制面记录；直接将候选人输入、Prompt 或一次运行展示给管理员会泄露数据，也不能形成发布证据。
- 决策：Agent Lab 在 PostgreSQL 中保存 Dataset、AgentVersion、Run、Failure、Experiment 和 ReleaseDecision。Run 只接受输入 Hash、受限 Trace 引用、阶段摘要和有界指标；Failure 只保存固定分类、严重度和服务端生成的脱敏分类回执。`RECORDED` 运行即使满足自动门也只产生 `NEEDS_REVIEW`，管理员可显式记录 `APPROVE`、`NEEDS_REVIEW` 或 `REJECT`，但不会自动部署。
- 原因：将质量、结构化有效性、延迟、Token、成本、版本和失败分类绑定到可追溯事实，同时保持候选人数据和 Provider 成本边界。
- 替代方案：只保留 JSON/Markdown 本地报告；把原始 Trace 直接展示在控制台；由单次运行自动发布；用静态成功状态填充 UI。
- 取舍：现有离线 Runner 需要后续适配以自动写入录制结果；当前管理 API 可记录经过验证的摘要，但不执行 Provider 调用或运行时改写。

## ADR-CTX-009：录制报告先提交 Receipt，再由管理员导入

- 日期：2026-08-27
- 状态：已接受
- 背景：浏览器不能安全读取维护者本机的离线 JSON 文件；让 CLI 直接创建 Run 会跳过明确人工操作和执行者审计。
- 决策：CLI 只以管理员 JWT 将脱敏、校验后的 Receipt 提交为 `LabRecordedImport`。管理员控制台只能对 `PENDING` Receipt 执行一次导入，服务端以原子状态声明防重；提交者、执行者、Receipt Hash、状态和 Run 关联均持久化。
- 原因：保留最小人工批准门，防止浏览器文件系统访问和静默生产写入，同时不把原始 Report、候选人输入或 Prompt 送入 API。
- 替代方案：浏览器选择任意本机路径；CLI 直接创建 Run；将原始 JSON 上传 PostgreSQL；依赖 UI 隐藏导入入口。
- 取舍：维护者仍需显式运行 CLI 和管理员导入两步；自动调度和报告保留策略留待后续独立任务。

## ADR-CTX-010：实验和发布理由使用受限控制面输入

- 日期：2026-08-27
- 状态：已接受
- 背景：实验名称、假设和自由文本发布理由可能被误用为候选人原文、Prompt 或检索内容的旁路；同一 Run 或跨 Dataset 比较也不具备可解释性。
- 决策：实验 API 只接受 Control/Treatment Run ID，并在服务端拒绝同一 Run、同 Agent Version 和跨 Dataset 组合；名称和假设由版本事实生成。人工发布决策只接受固定理由代码，服务端生成审计说明。所有结果只写 Agent Lab 审计记录，不执行部署。
- 原因：维持发布门的人工审查和可比性，同时不引入新的自由文本数据面或自动发布通道。
- 替代方案：允许自由文本实验/理由；依赖前端筛选；让 `APPROVE` 触发部署。
- 取舍：管理员不能在控制台记录任意叙述；详细实验结论需要在外部受控文档中维护。

## ADR-CTX-011：Agent Lab 操作日志使用固定动作和对象

- 日期：2026-09-02
- 状态：已接受
- 背景：Receipt 导入、实验、发布决策和 retention 请求已有领域记录，但无法直接回答哪位管理员请求了哪个控制面操作及其结果。
- 决策：新增独立 `LabOperationLog`，只记录主体、固定动作枚举、固定对象类型、受限对象标识、`SUCCEEDED`/`REJECTED` 和时间。管理员可分页只读查询；操作失败不记录原始异常或请求内容。
- 原因：补齐最小操作审计而不将控制面变成候选人、Prompt 或凭据的旁路数据面。
- 替代方案：复用领域审计记录、保存自由文本请求摘要、使用通用事件总线。
- 取舍：日志不能提供详细调试上下文，需通过受限的 Run/Import/Experiment/Decision 领域事实完成调查。

## ADR-035：自进化采用草稿隔离、同集非回归与人工发布

- 日期：2026-10-02；状态：已接受。
- 背景：原发布门要求草稿先完成评测，但运行时拒绝所有草稿；评测分数为 0–100，门槛却使用 0.9。候选也没有可比基线或进入 Interview 的受控路径。
- 决策：失败分析只使用固定分类映射生成确定性策略并克隆当前版本为草稿；草稿只允许 EvaluationService 通过内部参数运行。候选必须与当前版本在同一 Dataset/Evaluator 上比较，全部 Case 通过、至少 90/100 且分数不回归后，ADMIN 才能显式发布。Interview 只读取当前 `PUBLISHED` 版本并限制策略长度。
- 原因：形成可审计的真实产品闭环，同时阻止失败文本注入、草稿外泄、自动发布和不可比较的效果声明。
- 取舍：固定策略覆盖有限；当前未把可靠 Token、费用或重复运行延迟统计纳入门禁，不能声明真实质量提升。
