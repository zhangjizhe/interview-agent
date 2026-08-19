# 架构决策

最后更新：2026-08-13

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
