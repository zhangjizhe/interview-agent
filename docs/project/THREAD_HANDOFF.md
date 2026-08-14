# 任务交接

最后更新：2026-08-15

## 上一任务

TASK-012：B1 Production Migration Baseline

## 已完成

- 源开发库已通过隔离恢复演练；Schema 指纹和 22 张表行数均与恢复库一致。
- 活动 Prisma 迁移目录只保留 `20260815000000_production_baseline`；旧迁移链已移至 `migrations-legacy` 审计目录。
- Docker migration job 执行 `migrate deploy`、LangGraph checkpoint 初始化和 `migrate status`，API 不再执行或忽略 DDL。
- API readiness 现在要求 PostgreSQL、Redis 和 Baseline 均通过；失败时返回 503 且不泄露依赖错误。

## 改动文件

- `apps/api/prisma/migrations/`
- `apps/api/prisma/migrations-legacy/`
- `apps/api/migration-entrypoint.sh`
- `apps/api/docker-entrypoint.sh`
- `apps/api/scripts/setup-checkpointer.mjs`
- `apps/api/src/common/health.controller.ts`
- `apps/api/src/modules/agent/multi-agent.service.ts`
- `apps/api/src/__tests__/health.controller.spec.ts`
- `scripts/db/`
- `docker-compose.yml`
- `docs/project/CURRENT_STATE.md`
- `docs/project/ACTIVE_TASK.md`
- `docs/project/TASKS.md`
- `docs/product/REFACTOR_PROGRAM.md`

## 重要决策

- Baseline 必须从恢复验证后的实际 Schema 生成，而非从不可信历史迁移链或 `db push` 推断。
- API runtime 不承担 Prisma 或 LangGraph checkpoint DDL；migration job 是唯一部署初始化路径。
- Prisma datamodel 未表达的历史约束属于 Baseline 事实，后续必须通过加性 migration 显式收敛。

## 当前状态

重构 B1 已完成。源库恢复演练、Schema 指纹、22 表行数、空库 Baseline/Checkpoint、Prisma 状态、API 24 suites / 237 tests、Cache 22 tests、API build、Docker migration job 与 readiness 均已通过。

## 已知问题

- CandidateSkillState 生产聚合、趋势、训练推荐和训练界面尚未实现。
- SSE 仍不支持 Event ID/Offset 断点续传，这属于 B4 的独立范围。

## 推荐下一任务

TASK-B2：正式评价与技能状态。

## 所需上下文

按 `AGENTS.md` 读取核心顺序，再读取 `docs/agent/EVALUATION.md`、`docs/agent/SKILL_MODEL.md`、Evaluation Service、Prisma Schema、正式评价合同测试和 Harness 文档。

## 风险

- `EvaluationRun`、`AssessmentEvidence` 与 `CandidateSkillState` 必须维持用户、岗位、面试、问题和回答来源链，失败/预览运行不能污染正式状态。
- 后续任务不得重新引入 API runtime DDL 或绕过 B0 SSE 候选人边界。
