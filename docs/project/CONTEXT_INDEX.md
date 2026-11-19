# 上下文索引

最后更新：2026-10-08

读取四个核心上下文文件后使用本文件。仅加载当前任务所需的最小资料；不要默认读取 Archive。

## 每个任务的核心上下文

1. `AGENTS.md`
2. `docs/PROJECT-CONSTITUTION.md`
3. `docs/project/PROJECT_CONTEXT.md`
4. `docs/project/CURRENT_STATE.md`
5. `docs/project/ACTIVE_TASK.md`

## 按主题路由

当前重新验收事实优先看 `CURRENT_STATE.md` 与 `docs/acceptance/INTERNAL_PRE_RELEASE_STATUS.md`；`docs/DELIVERY-REPORT-2026-10-08.md` 是旧交付快照。安全迁移从报告的公告/补丁与 `TASKS.md` 选定单一主题后，只检查对应依赖链与回归；六份旧上下文保留在 `archive/release-readiness-2026-10-08/`，不默认加载。

| 需求 | 优先阅读 | 再检查 |
| --- | --- | --- |
| 大型重构/迁移 | `docs/product/REFACTOR_PROGRAM.md`、`docs/project/ARCHITECTURE_MAP.md`、`docs/project/DECISIONS.md` | Prisma Schema/Migration、Docker EntryPoint、相关模块与验收资产 |
| Lab 移动端兼容 | `docs/project/LAB_MOBILE_LAYOUT.md` | mobile-layout.css、LabShell、AccountSecurityDialog、移动行为与隔离尺寸检查 |
| Lab 工作区/MCP/生命周期交互 | `docs/project/LAB_WORKSPACE_FLOWS.md`、`docs/project/LAB_WORKSPACE_UX.md` | AgentCatalog/Builder、MCP controls、QuestionBank/Import、Registry/Runtime及隔离持久化脚本 |
| Lab Agent/编排新增 | `docs/acceptance/LAB_AGENT_WORKFLOW_CONTRACT.md`、`docs/ACCEPTANCE-REPORT-2026-10-08-LAB-FOUNDATION.md` | AgentRegistry/Runtime、ToolRunner、预算/网关与独立测试；全部未实现范围不得称交付 |
| 用户报告千问9元/费用对账 | `docs/acceptance/COST_RECONCILIATION_2026-11-18.md` | UsageLedger/Run/Trace/SessionCost、ResumeRAG直接embedding；区分准入/估算/账单，未知不记零 |
| 商业产品/设计放行、会话隔离 | `docs/acceptance/COMMERCIAL_PRODUCT_DESIGN_GATE.md`、`docs/acceptance/SESSION_CACHE_ISOLATION.md` | AuthGate/AuthenticatedWorkspace/auth、真实业务闭环、逐状态视觉和设备证据；整体NOT_ACCEPTED，候选测试不是交付 |
| 全产品重新验收 | `docs/acceptance/PRODUCT_REACCEPTANCE_PLAN.md`、`docs/acceptance/UI_INVENTORY.json` | 按功能矩阵仅加载相关产品规格、当前可达页面/API及测试；双证据，不复用旧通过结论 |
| 最新完整规划/可替换架构 | `docs/product/SELF_BUILT_AGENT_PLATFORM_PLAN.md`、`docs/architecture/REPLACEABLE_AGENT_CONTRACTS.md`、`docs/product/FEATURE_MATRIX.md` | B0-B6退出门；先核当前源码/验收台账，再做单主题迁移 |
| 产品、IA、UX | `docs/product/PRODUCT_VISION.md`、`docs/product/USER_JOURNEY.md`、`docs/product/INFORMATION_ARCHITECTURE.md`、`docs/product/SCREEN_SPEC.md`、`docs/product/P0_IMPLEMENTATION_PLAN.md` | `apps/web/src/App.tsx`、受影响页面/组件、Shared Type、匹配的 API Controller |
| 当前架构 | `docs/project/ARCHITECTURE_MAP.md`、`docs/architecture.md`、`docs/architecture-decisions.md` | `apps/api/src/app.module.ts`、相关 Module 与 Service |
| Interview体验审查/功能盘点 | `docs/project/INTERVIEW_UX_PRODUCT_AUDIT.md` | HomePage practice/records、ReportPage、TrainingPage，按真实/合成/未验区分 |
| 资料准备产品/设计验收 | `docs/acceptance/PREPARATION_PRODUCT_DESIGN_ACCEPTANCE.md` | Jobs/Resumes/WorkflowDialog/preparation contracts、回执核对、焦点、尺寸证据；合成与真实分开 |
| Interview资料准备/简历/岗位 | `docs/project/INTERVIEW_PREPARATION_REDESIGN.md` | PreparationLayout/ResumesPage/JobsPage/SettingsPage、ResumeController/RAG、JobReadinessService |
| Interview交互/移动布局 | `docs/project/INTERVIEW_WORKFLOW_UX.md` | Web Home/Report/Settings/InterviewPage、WorkflowDialog、useVisibleViewport |
| 面试生命周期/SSE | `docs/ACCEPTANCE-REPORT-2026-08-12.md` | `apps/api/src/modules/interview/`、`apps/web/src/pages/InterviewPage.tsx`、Stream Hook/Store |
| Agent Runtime | `docs/agent/AGENT_RUNTIME.md`、`docs/project/ARCHITECTURE_MAP.md`、`docs/architecture-decisions.md` | `apps/api/src/modules/agent/`、`apps/api/src/agents/multi-agent/`、LLM Gateway |
| 候选人技能/准备度 | `docs/agent/EVALUATION.md`、`docs/agent/SKILL_MODEL.md`、`docs/product/P0_IMPLEMENTATION_PLAN.md` | Prisma Schema、Report/AnswerHistory 服务、Ownership Tool、受影响 API/Web Test |
| 题目选择 | `docs/agent/QUESTION_INTELLIGENCE.md`、`docs/agent/MEMORY.md` | Question Generator/Bank、Retrieval Service、Selection Test |
| 检索或知识 | `README.md`、验收报告 | Knowledge Base 与 Interview Service、Milvus/Qdrant Infra、相关测试 |
| 鉴权/安全 | `README.md`、验收报告 | `apps/api/src/modules/auth/`、Ownership Utility、受影响 Controller Test |
| 数据模型/Migration | `docs/project/CURRENT_STATE.md` | `apps/api/prisma/schema.prisma`、Migration、Prisma Consumer |
| Evaluation/Benchmark | `docs/harness/HARNESS.md`、`docs/harness/DATASET.md`、`docs/harness/EVALUATOR.md`、`docs/harness/RELEASE_GATE.md` | `apps/api/src/evals/`、测试、Benchmark Script、Cost Tracker |
| 运维/部署 | `docs/runbook.md`、验收报告 | `docker-compose.yml`、Dockerfile、nginx、根目录脚本 |
| 任务历史/交接 | `docs/project/TASKS.md`、`docs/project/THREAD_HANDOFF.md` | 仅在具体历史问题需要时读取 `docs/project/archive/` |

## 更新路由

| 变更类型 | 必须更新的上下文 |
| --- | --- |
| 任意已完成任务 | `CURRENT_STATE.md`、`TASKS.md`、`THREAD_HANDOFF.md` |
| 架构或长期约束 | 还需更新 `ARCHITECTURE_MAP.md` 和 `DECISIONS.md` |
| 产品优先级 | 还需更新 `ROADMAP.md` |
| 影响系统的发布变更 | 还需更新 `CHANGELOG.md` |

## Archive 规则

Archive 只用于审计、回归或指定历史决策。保持当前文件简短、有效；历史细节不再属于活跃上下文时，写入 `docs/project/archive/` 下带日期的摘要。
