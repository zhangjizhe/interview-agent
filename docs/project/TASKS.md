# 任务列表

最后更新：2026-08-14

## 当前

当前没有活跃实现任务。TASK-006 已完成。开始实现改动前，必须在 `ACTIVE_TASK.md` 认领且仅认领一个后续任务。

## 下一任务

### TASK-007：训练建议与训练界面

- 状态：建议
- 目标：基于正式技能状态和缺口证据生成单技能训练推荐，并提供完成、复面触发和回放入口。
- 范围：CandidateSkillState 聚合、TrainingRecommendation 合同、训练 API 与候选人训练界面。
- 非目标：多日周计划、支付、Agent 自主训练策略或旧历史回填。
- 依赖：Task-006 前端壳、Question Intelligence、正式技能状态聚合与评估证据。

### TASK-008：面试模式与 SSE 合同

- 状态：建议
- 目标：将完整模拟和单技能练习的面试状态、题目进度和 SSE 候选人事件明确化。
- 范围：Interview Mode、目标岗位关联、选题元数据、SSE Event Contract、评价失败恢复和浏览器验收。
- 非目标：暴露 Agent/RAG/Tool 内部事件，或重写 Multi-Agent Runtime。
- 依赖：Task-006、Task-007 的训练/技能合同和现有 SSE 回归测试。

### TASK-009：使用量与额度边界

- 状态：建议
- 目标：按用户和周期聚合现有 SessionCost，并在服务端建立最小额度策略点。
- 范围：Usage Ledger、额度检查、API、候选人使用量摘要和滥用测试。
- 非目标：Payment Provider、订阅账单、团队套餐或前端直接调用模型。
- 依赖：SessionCost、鉴权、目标岗位/面试合同和成本验收基线。

### TASK-004：Agent 评估运行模型

- 状态：建议
- 目标：将现有 Golden Dataset 和 Runner 转化为最小、可复现的评估、实验和批准工作流。
- 范围：版本标识、评估记录格式、对比标准和回归门。
- 非目标：大型实验 UI、Prompt 自动修改或根据单次运行宣称质量。
- 依赖：`apps/api/src/evals/`、Langfuse/Cost Data 和具有代表性的生产安全 Case。

## 已完成

### TASK-001：上下文管理层

- 状态：2026-08-13 完成
- 目标：让项目状态、任务边界、上下文路由和交接可从 Repository 恢复，不依赖 Chat History。
- 范围：`docs/project/` 上下文文件及 `AGENTS.md` 中的 Codex Loading/Completion Protocol。
- 非目标：产品行为、API、UI、数据库、Agent、RAG、Memory 或 Prompt 改动。
- 依赖：现有项目文档和实现审计。

### TASK-002：训练平台信息架构

- 状态：2026-08-13 完成
- 目标：审计当前默认产品，并定义可实施的 P0 面试训练产品信息架构。
- 范围：产品/UI 审计、黄金路径、IA、页面/设计系统规格、商业化边界、Agent/Evaluation/Memory/Question Intelligence 对齐、Harness 运行文档和分阶段 P0 计划。
- 非目标：Runtime、Schema、API、UI、Prompt、RAG、Memory、Quota 或 Billing 实现。
- 依赖：现有产品文档、Web/API 代码、Prisma Schema、Agent Runtime、Evaluation Runner、Observability 和验收证据。

### TASK-003：评估证据与技能状态基础

- 状态：2026-08-13 完成
- 目标：建立用户归属、版本化的评估证据与长期技能状态合同，使训练产品结论可解释。
- 范围：TargetJob/SkillDefinition/CandidateSkillState、规范化 InterviewQuestion/InterviewAnswer、
  不可变 EvaluationDefinition/EvaluationRun/AssessmentEvidence、Report 展示快照、正式/预览写入边界、
  用户范围只读 API、Migration 和合同测试。
- 非目标：UI 重设计、准备度公式、JD 导入、训练 UI、计费、Prompt 重写或 Agent Engine 替换。
- 验证：Prisma Schema Validate、API typecheck、生产 build、全量 Jest（21 suites / 221 tests）通过。
- 部署阻塞：本机 PostgreSQL 已有业务表但没有 Prisma migration 基线，`prisma migrate deploy` 安全返回 `P3005`，未执行本次 Migration。必须先完成受控 Baseline 审计，不能直接标记历史 Migration 为已应用。
- 未完成：CandidateSkillState 尚未由生产评估聚合；旧 AnswerHistory 不回填为正式技能证据。
- 后续：完成面试后的评价失败恢复状态尚未有候选人 UI；应在引入报告/练习 UI 前提供明确的失败与重试入口。

### TASK-005：岗位设置与准备度 API

- 状态：2026-08-14 完成
- 目标：为当前目标岗位和文本 JD 建立用户归属 API，并输出透明、低置信度可见的准备度摘要。
- 范围：TargetJob CRUD/Active Switch、文本 JD 有界导入、本地关键词岗位技能映射、JobSkillRequirement、岗位关联面试、Readiness Component/Confidence API 和测试。
- 非目标：前端重设计、训练 UI、SSE 改版、Payment、Quota Enforcement、LLM JD 分析或 Prompt 改动。
- 验证：Prisma Schema Validate、API typecheck、生产 build、全量 Jest（22 suites / 225 tests）通过。
- 部署阻塞：继承本机 PostgreSQL `P3005` Migration Baseline 问题；新增 Schema 尚未部署。
- 未完成：CandidateSkillState 尚未由生产正式评价聚合，准备度在此状态下返回 `overallScore: null` 和明确缺失原因。

### TASK-006：训练平台前端壳

- 状态：2026-08-14 完成
- 目标：基于真实目标岗位与准备度 API 重建候选人 Web Shell，交付岗位设置、首页准备度、面试记录和评价失败恢复状态。
- 范围：候选人主导航、TargetJob/JD 设置、Dashboard、Readiness/Insufficient Evidence、面试记录和报告失败恢复。
- 非目标：训练生成逻辑、SSE 协议改版、Payment、Quota Enforcement、模型/Prompt 改动。
- 验证：Web typecheck、Vitest（9 suites / 64 tests）、生产构建和 `git diff --check` 通过。
- 浏览器限制：本机 API 未启动，且数据库 Migration Baseline 尚未完成，无法在不创建测试账户和数据的情况下完成认证后的浏览器端到端验收；登录页移动宽度检查无横向溢出。
- 未完成：CandidateSkillState 生产聚合、训练建议/训练界面、面试模式/SSE 合同和额度边界仍由 TASK-007 至 TASK-009 处理。

## 阻塞

当前无记录。
