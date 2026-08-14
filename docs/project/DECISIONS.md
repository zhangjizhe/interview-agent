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
