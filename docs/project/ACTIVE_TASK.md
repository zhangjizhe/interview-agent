# 当前任务

最后更新：2026-08-15

## 任务 ID

TASK-012

## 目标

完成 B1：建立可恢复、可审计的 Prisma Production Migration Baseline 与 API 就绪门。

## 状态

完成

## 范围

- 为 PostgreSQL Schema 指纹、备份和恢复演练提供可复现脚本与 Runbook。
- 从已验证 Schema 创建单一 Baseline Migration；不伪造旧 Migration 历史。
- 将 Docker API 的运行时 `db push` 替换为专用 Migration Job 与 fail-closed 就绪门。
- 验证恢复后旧数据可读、`migrate status` 正常且 Migration 失败时 API 不就绪。

## 非目标

- CandidateSkillState 聚合、训练推荐、SSE 断点续传、额度或支付。
- 改变 LangGraph 拓扑、Provider、Prompt、检索和工具执行策略。
- 在生产数据或未恢复的数据库上执行 destructive migration。

## 相关文件

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/`
- `apps/api/docker-entrypoint.sh`
- `apps/api/Dockerfile`
- `docker-compose.yml`
- `scripts/`
- `docs/runbook.md`
- `docs/product/REFACTOR_PROGRAM.md`

## 验收标准

- 备份和恢复脚本能在隔离 PostgreSQL 中验证 Schema 与数据指纹。
- Baseline Migration 由受控 Migration Job 执行，API 运行时不再拥有/调用 DDL 同步。
- `migrate status`、API 就绪检查和旧面试数据读取均有可复现记录。
- API/Web 测试、类型检查、构建、Docker 健康和 B1 迁移演练有记录。

## 已知风险

- 现有本机开发数据库没有 Prisma Migration History；不得将 `db push` 或 `migrate resolve` 作为生产 Baseline 替代。
- 本机 Docker 数据仅用于演练；任何生产执行需要独立备份、恢复验证和发布负责人批准。

## 交付结果

- 活动 Prisma 迁移目录仅保留经恢复验证的 `20260815000000_production_baseline`；旧链保留在审计目录。
- 源库恢复至隔离 PostgreSQL 后，Schema 指纹与 22 张表行数均一致；空库 Baseline、checkpoint 与 Prisma 状态均通过。
- 本机开发数据库在上述验证后显式登记 Baseline；Docker 独立 migration job 成功后 API 才启动。
- API readiness 现在验证 PostgreSQL、Redis 和 Baseline，并在任一失败时返回脱敏的 503。
