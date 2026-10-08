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

当前交付事实优先看 `docs/DELIVERY-REPORT-2026-10-08.md`。安全迁移从报告的公告/补丁与 `TASKS.md` 选定单一主题后，只检查对应依赖链与回归；六份旧上下文保留在 `archive/release-readiness-2026-10-08/`，不默认加载。

| 需求 | 优先阅读 | 再检查 |
| --- | --- | --- |
| 大型重构/迁移 | `docs/product/REFACTOR_PROGRAM.md`、`docs/project/ARCHITECTURE_MAP.md`、`docs/project/DECISIONS.md` | Prisma Schema/Migration、Docker EntryPoint、相关模块与验收资产 |
| 全产品重新验收 | `docs/acceptance/PRODUCT_REACCEPTANCE_PLAN.md`、`docs/acceptance/UI_INVENTORY.json` | 按功能矩阵仅加载相关产品规格、当前可达页面/API及测试；双证据，不复用旧通过结论 |
| 产品、IA、UX | `docs/product/PRODUCT_VISION.md`、`docs/product/USER_JOURNEY.md`、`docs/product/INFORMATION_ARCHITECTURE.md`、`docs/product/SCREEN_SPEC.md`、`docs/product/P0_IMPLEMENTATION_PLAN.md` | `apps/web/src/App.tsx`、受影响页面/组件、Shared Type、匹配的 API Controller |
| 当前架构 | `docs/project/ARCHITECTURE_MAP.md`、`docs/architecture.md`、`docs/architecture-decisions.md` | `apps/api/src/app.module.ts`、相关 Module 与 Service |
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
