# 任务交接

最后更新：2026-08-15

## 上一任务

TASK-011：B0 验收基线与候选事件边界

## 已完成

- API 候选 SSE 在写入响应前将 Agent 事件收敛为文本与安全错误；`token_usage` 仅持久化，不发送到浏览器。
- Web 流式 Hook 只处理 `token`、`error` 与完成信号，并拒绝工具、检索、Agent、模型和成本事件。
- 真实浏览器验收已适配候选人首页和岗位设置，覆盖随机用户注册/登录、岗位创建、用户管理员隔离、管理员 MCP 页面和移动端。
- Golden Dataset 增加无 Provider 的结构校验入口，验证 30 个 Case 的 Schema。

## 改动文件

- `apps/api/src/modules/interview/controllers/interview-flow.controller.ts`
- `apps/api/src/modules/interview/services/candidate-stream-event.util.ts`
- `apps/api/src/__tests__/candidate-stream-event.util.spec.ts`
- `apps/web/src/hooks/useInterviewStream.ts`
- `apps/web/src/utils/candidateEvents.ts`
- `apps/web/src/utils/candidateEvents.test.ts`
- `apps/web/e2e/auth-real-acceptance.mjs`
- `apps/api/package.json`
- `docs/ACCEPTANCE-REPORT-2026-08-15.md`
- `docs/project/CURRENT_STATE.md`
- `docs/project/ACTIVE_TASK.md`
- `docs/project/TASKS.md`
- `docs/product/REFACTOR_PROGRAM.md`

## 重要决策

- 候选人可见 SSE 是公开产品合同，而非 Agent 事件的透传通道；仅文本、可操作错误和完成信号可跨越 API 边界。
- Golden Dataset 的结构校验不调用 Provider，只能防止数据合同损坏，不能证明评估质量。
- 真实浏览器验收可以创建随机测试账号及其岗位，但不得把这些标识写入交接或提交。

## 当前状态

重构 B0 已完成。API 23 suites / 235 tests、Cache 22 tests、Web 10 files / 75 tests、API/Web typecheck/build、Golden Dataset 结构校验、Docker health 与 10/10 真实浏览器检查均已通过。

## 已知问题

- 本机 PostgreSQL 已有业务表但没有 Prisma migration 基线，`prisma migrate deploy` 返回 `P3005`，未执行任何 Migration。先完成 Schema 审计、备份和受控 Baseline Procedure，禁止直接标记历史迁移已应用。
- Docker EntryPoint 仍使用 `prisma db push --accept-data-loss`。它只可在授权的本机开发恢复中使用，生产部署必须替换为受控 Migration Baseline Procedure。
- B1 Production Migration Baseline 仍须先完成备份、恢复、Schema 指纹对账和专用 Migration Job。
- CandidateSkillState 生产聚合、趋势、训练推荐和训练界面尚未实现。
- SSE 仍不支持 Event ID/Offset 断点续传，这属于 B4 的独立范围。

## 推荐下一任务

TASK-B1：Production Migration Baseline。

## 所需上下文

按 `AGENTS.md` 读取核心顺序，再读取 `docs/product/REFACTOR_PROGRAM.md`、Prisma Schema、Docker EntryPoint、备份/恢复 Runbook 与当前数据库指纹。

## 风险

- 不能用本机 `db push --accept-data-loss` 或无 `_prisma_migrations` 的数据库替代生产 Baseline。
- 后续任务不得改变 B0 SSE 白名单或把内部运行事件重新暴露给候选人。
