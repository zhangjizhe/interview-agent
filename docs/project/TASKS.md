# 任务列表

## 2026-09-29 · Phase 1 交接（最新）

PHASE-1-SECURITY 已完成代码与本地验证；TASK-029 暂缓，当前无执行中的任务，等待用户继续。后续需验证真实 Redis 故障恢复、浏览器刷新、分布式限流与容器隔离；Phase 2 尚未开始。此状态优先于下方历史任务条目。


最后更新：2026-09-02

## 当前

当前活跃任务：TASK-029。该任务为 Agent Lab 离线评测定义受控调度与 mock 执行合同，不改变 Provider、发布或候选人边界。

### TASK-029：Agent Lab 离线评测调度合同

- 状态：进行中
- 目标：为离线录制/mock 评测建立可暂停、幂等、受审计的调度合同。
- 范围：调度声明、执行状态、并发/超时边界、操作日志和 mock 验收。
- 非目标：真实 Provider 批量调用、自动发布、候选人内容读取或自动导入 Receipt。

### TASK-033：双端 UI 最终交付

- 状态：2026-09-03 完成
- 验证：设计审查与产品经理复审通过；Interview Web 14 files / 79 tests、API 控制器测试、API/Interview/Agent Lab build、Prisma migration、报告桌面/移动回放、候选人与 Agent Lab 浏览器验收通过；未调用 Provider。

### TASK-029：Agent Lab 离线评测调度合同

- 状态：建议
- 目标：为离线录制/mock 评测建立可暂停、幂等、受审计的调度合同。
- 范围：调度声明、执行状态、并发/超时边界、操作日志和 mock 验收。
- 非目标：真实 Provider 批量调用、自动发布、候选人内容读取或自动导入 Receipt。

### TASK-032：报告/回放与兼容入口 UI 边界

- 状态：2026-09-02 完成
- 验证：产品经理复审通过；API controller tests、Interview Web 14 files / 79 tests、API/Agent Lab build、报告桌面/移动录制浏览器验收及真实候选人/Agent Lab 浏览器验收通过；未调用 Provider。

### TASK-031：双端 UI 适配与设计系统

- 状态：2026-09-02 完成
- 验证：Interview Web 13 files / 78 tests、Interview/Agent Lab typecheck/build、Docker rebuild、候选人与 Agent Lab 浏览器验收通过；未调用 Provider。

### TASK-029：Agent Lab 离线评测调度合同

- 状态：建议
- 目标：为离线录制/mock 评测建立可暂停、幂等、受审计的调度合同。
- 范围：调度声明、执行状态、并发/超时边界、操作日志和 mock 验收。
- 非目标：真实 Provider 批量调用、自动发布、候选人内容读取或自动导入 Receipt。

### TASK-030：远端 Agent Lab 分支整合审计

- 状态：建议
- 目标：在隔离工作树中审查 `origin/agent-lab` 与当前控制面分支的 Schema、迁移、Agent Lab 模块和发布边界冲突，并给出可验证的合并或拒绝迁移计划。
- 范围：差异审计、迁移图、接口冲突、数据安全、测试与回滚计划。
- 非目标：未经审计直接合并、覆盖当前 Agent Lab 合同，或引入远端分支的 Provider/部署行为。

### TASK-028：Agent Lab 操作日志查询

- 状态：2026-09-02 完成
- 验证：加性 migration、API 32 suites / 276 tests、Golden Dataset 30 Case 校验、API/Agent Lab build、Docker migration/API health 和管理员浏览器操作日志/USER 拒绝验收通过；未调用 Provider。

### TASK-027：Agent Lab 审计保留边界

- 状态：2026-08-27 完成
- 验证：API 32 suites / 274 tests、Golden Dataset 30 Case 校验、API/Agent Lab build、Docker API health 和默认关闭浏览器验收通过；未调用 Provider。

### TASK-026：Agent Lab 控制面审计查询

- 状态：2026-08-27 完成
- 验证：API 32 suites / 271 tests、Golden Dataset 30 Case 校验、API/Agent Lab build、Docker API health 和管理员审计筛选/USER 拒绝浏览器验收通过；未调用 Provider。

### TASK-025：Agent Lab 实验与发布决策操作

- 状态：2026-08-27 完成
- 验证：API 32 suites / 269 tests、Golden Dataset 30 Case 校验、API/Agent Lab build、Docker API health 和管理员 Receipt 导入/Experiment/APPROVE/USER 拒绝浏览器验收通过；未调用 Provider。

### TASK-024：Agent Lab 录制报告管理员工作流

- 状态：2026-08-27 完成
- 验证：加性 migration、API 32 suites / 267 tests、Golden Dataset 30 Case 校验、API/Agent Lab build、Docker migration/API health 和管理员导入/普通用户拒绝浏览器验收通过；未调用 Provider。

### TASK-023：Agent Lab 录制 Harness 导入

- 状态：2026-08-26 完成
- 验证：API 32 suites / 265 tests、Golden Dataset 30 Case 校验、API/Agent Lab build、Docker API health 和管理员浏览器验收通过；未调用 Provider。

### TASK-022：Agent Lab V0.2 评测与发布合同

- 状态：2026-08-26 完成
- 目标：将现有 Golden Dataset、Harness、Trace 和成本资产收敛为版本化的 Agent Lab 控制面事实。
- 验证：加性 Prisma migration、API 31 suites / 263 tests、Golden Dataset 30 Case 校验、API/Agent Lab build、Docker migration/API health 和管理员浏览器验收通过；未调用 Provider。

### TASK-021：Interview V0.2 候选人产品主流程

- 状态：2026-08-20 完成
- 目标：将注册、岗位、简历前置、面试模式、评价/训练真实状态和移动端体验收敛为可重复候选人主流程。
- 验证：API 29 suites / 256 tests、Cache 22 tests、Interview Web 13 files / 78 tests、API/Web build、Docker readiness 和浏览器 23/23 通过；未调用 Provider。

### TASK-019：Agent Lab 独立控制台与 MCP 治理

- 状态：2026-08-19 完成
- 目标：将 Agent Lab 建立为独立 Agent 控制平面，并将 MCP 系统治理从候选人 Web 迁入管理员控制台。
- 验证：Agent Lab typecheck/build、候选人 Web typecheck、Docker 独立服务和管理员/普通用户浏览器验收通过。

### TASK-018：B6 使用量与发布平面最小边界

- 状态：2026-08-26 完成
- 原因：使用量与发布策略应明确区分候选人摘要和 Agent Lab 控制面后再继续，避免把 Agent 内部信息重新带入产品 Web。
- 验证：Usage Ledger 幂等、服务端额度拒绝、候选人安全摘要、API 30 suites / 260 tests、Cache 22 tests、Interview Web 78 tests、Docker migration/API readiness 和 Docker `0/1 -> 1/0 -> 429` 通过；未调用 Provider。

## 已完成

### TASK-017：B5 单技能训练推荐与复测关联

- 状态：2026-08-17 完成
- 目标：基于成功 FINAL Evidence 为当前岗位技能缺口生成可追溯的单技能训练推荐，并关联训练完成与复测。
- 范围：TrainingRecommendation/Attempt 数据合同、受保护 API、候选人训练入口、复测关联和验收。
- 非目标：多日计划、支付、额度、Agent 自主训练策略或直接提高 CandidateSkillState。
- 验证：加性 migration 和 Prisma 状态正常；API 29 suites / 256 tests、Web 11 files / 76 tests、API/Web typecheck/build、Docker migration/API health 和真实 JWT 浏览器验收 22/22 通过。
- 结果：训练推荐只消费成功 FINAL Evidence；训练完成只写 Attempt，不改 CandidateSkillState。

### TASK-016：B4 受控面试模式与稳定题目合同

- 状态：2026-08-15 完成
- 目标：明确完整模拟与单技能练习的面试状态、题目进度和候选人 SSE 合同。
- 范围：Interview Mode、目标岗位关联、稳定选题元数据、SSE 候选人事件白名单、断流幂等和验收。
- 非目标：训练建议、额度、支付、重写 Agent Runtime 或暴露内部事件。
- 验证：加性 migration 和 Prisma 状态正常；API 27 suites / 249 tests、Web 10 files / 75 tests、API/Web typecheck/build、Docker migration/API health 和真实 JWT 浏览器验收 21/21 通过。
- 残余限制：重试重放已完成回复，不提供 Event ID/Offset 逐 token 续传；真实 Provider Canary 仍由 Harness 发布门控制。

### TASK-015：目标岗位真实端到端验收

- 状态：2026-08-15 完成
- 目标：通过真实 JWT 浏览器会话验证目标岗位创建、读取、编辑、激活、准备度和资源归属合同。
- 范围：可重复的 Docker 浏览器脚本、岗位档案版本与单活跃不变量、无正式证据状态、跨用户拒绝和验收记录。
- 非目标：训练推荐、SSE 断点续传、额度、支付、真实 Provider 面试或 Agent Benchmark。
- 验证：Docker API 健康；真实浏览器验收 19/19 通过。随机测试账户、岗位和截图仅保留在未跟踪的本地生成目录。

### TASK-010：重构基线与迁移设计

- 状态：2026-08-14 完成
- 目标：审计当前产品资产与 Agent 实验代码，定义证据优先的 AI Interview Training Platform 目标架构、数据迁移和分批验收路线。
- 范围：架构、数据库、API、安全、成本、Agent Evaluation、Harness、Docker/Web 基线与迁移风险评估。
- 非目标：未经验证地替换默认 NestJS/React/LangGraph/Prisma 路径，或在同一任务中实施所有后续业务功能。
- 依赖：TASK-003、TASK-005、TASK-006 交付，当前 Docker/API/Schema 开发基线，Agent 实验目录的只读审计。

### TASK-011：B0 验收基线与候选事件边界

- 状态：2026-08-15 完成
- 目标：让 JWT 真实登录浏览器验收、候选人 SSE 白名单和 Golden Dataset 结构校验成为可执行的重构起点。
- 范围：浏览器验收脚本、SSE API/Web 合同、离线数据集校验入口与 B0 证据记录。
- 非目标：数据库 Baseline、技能聚合、训练推荐、SSE 断点续传、Agent/Prompt/Provider 改造。
- 依赖：TASK-010 重构程序、现有 Docker/API/Web 基线。
- 验证：API 23 suites / 235 tests、Cache 22 tests、Web 10 files / 75 tests、API/Web typecheck/build、Golden Dataset 30 Case 结构校验、Docker health 和 10/10 真实浏览器验收通过。
- 结果：候选人 SSE 不再传递 Agent、工具、检索、模型或 Token 成本事件；真实验收覆盖当前候选人导航和岗位创建。

### TASK-012：B1 Production Migration Baseline

- 状态：2026-08-15 完成
- 目标：建立可恢复、可审计、fail-closed 的 Prisma Migration Baseline，使后续 Agent Lab 产品化领域变更可安全部署。
- 范围：Schema/数据指纹、备份恢复演练、单一 Baseline Migration、专用 Migration Job、API 就绪门和受控 Runbook。
- 非目标：技能聚合、训练推荐、候选人 UI 重做、SSE 断点续传、Agent/Provider/Prompt 行为改造。
- 依赖：TASK-010/011、当前 Prisma Schema、Docker/PostgreSQL 开发基线。
- 验证：源库到隔离恢复库 Schema 指纹和 22 张表行数对账通过；空库 Baseline/Checkpoint/`migrate status` 通过；本机显式 Baseline 登记、API 24 suites / 237 tests、Cache 22 tests、API build、Docker migration job 和 readiness 通过。

### TASK-013：B2 正式评价与技能状态聚合

- 状态：2026-08-15 完成
- 目标：在 FINAL EvaluationRun 成功时，以可追溯、幂等和事务性的方式更新 CandidateSkillState。
- 范围：权威评价服务、技能聚合、失败/降级隔离、来源合同、测试与 Harness 结构验证。
- 非目标：旧历史回填、训练推荐、候选人 UI 重做、面试模式、Provider/Prompt/Graph 改造。
- 依赖：TASK-012 Baseline、EvaluationRun/AssessmentEvidence/CandidateSkillState Schema 与现有 Evaluation Service。
- 验证：FINAL 事务聚合、同源重试、无目标岗位/无分数隔离、失败 Final Run 和外部关系筛选合同测试通过；API 25 suites / 241 tests、Cache 22 tests、Golden Dataset 30 Case 结构校验、typecheck/build 通过。

### TASK-014：B3 岗位版本与准备度合同

- 状态：2026-08-15 完成
- 目标：将单活跃目标岗位、岗位档案版本与版本化准备度建立为数据库和 API 事实。
- 范围：TargetJob/JobSkillRequirement 的加性 Schema、并发安全创建/切换、Readiness 合同和测试。
- 非目标：面试模式、训练推荐、候选人 UI 重做、LLM JD 分析、Provider/Prompt/Graph 改造。
- 依赖：TASK-012 Baseline、TASK-013 FINAL 技能状态聚合、TargetJob/Readiness API。
- 验证：隔离和本机加性 migration、部分唯一索引、Prisma 状态、岗位版本/冲突 API 测试、API 25 suites / 243 tests、Cache 22 tests、Web 10 files / 75 tests、API/Web typecheck/build 通过。

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
- 验证：Web typecheck、Vitest（9 suites / 64 tests）、生产构建、API typecheck/生产构建、目标岗位 API 合同测试和 `git diff --check` 通过。Docker API 镜像已成功构建，容器健康且目标岗位路由已注册。
- 浏览器限制：本机开发 API 与 Schema 已按授权启动，但仍需通过可复现测试账户完成认证后的浏览器端到端验收。生产 Migration Baseline 未完成，不能以本机 Docker Schema 同步作为生产迁移。
- 未完成：CandidateSkillState 生产聚合、训练建议/训练界面、面试模式/SSE 合同和额度边界仍由 TASK-007 至 TASK-009 处理。

## 阻塞

当前无记录。
