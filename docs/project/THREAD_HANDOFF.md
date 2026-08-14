# 任务交接

最后更新：2026-08-15

## 上一任务

TASK-014：B3 岗位版本与准备度合同

## 已完成

- 新增 `profileVersion`，岗位档案更新后递增，准备度响应返回对应版本。
- PostgreSQL 部分唯一索引强制每位用户至多一个活跃 TargetJob。
- 并发活跃岗位冲突被转换为显式业务错误；所有权和缺失证据的原有语义保留。
- migration 已在隔离 Baseline 与本机开发库验证。

## 改动文件

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260815001000_target_job_profile_version/migration.sql`
- `apps/api/src/modules/interview/services/job-readiness.service.ts`
- `apps/api/src/__tests__/job-readiness.service.spec.ts`
- `apps/web/src/utils/training.ts`
- `docs/project/CURRENT_STATE.md`
- `docs/project/ACTIVE_TASK.md`
- `docs/project/TASKS.md`
- `docs/product/REFACTOR_PROGRAM.md`

## 重要决策

- 单活跃岗位是数据库约束，不是 UI 约定；事务冲突必须由 API 明确处理。
- 岗位档案版本是准备度的事实边界，后续面试模式和训练推荐必须记录或比较它。
- 本任务不产生训练结论；现有技能状态为空时，候选人仍必须看到证据不足。

## 当前状态

重构 B3 已完成。岗位单活跃约束、档案版本与准备度合同已经过隔离/本机 migration 和 API/Web 全量回归验证；API 25 suites / 243 tests、Cache 22 tests、Web 10 files / 75 tests、API/Web typecheck/build 通过。

## 已知问题

- 训练推荐、训练完成记录、复测关联、真实趋势比较和训练界面尚未实现。
- SSE 仍不支持 Event ID/Offset 断点续传，这属于 B4 的独立范围。

## 推荐下一任务

TASK-B4：受控面试模式与稳定题目合同。

## 所需上下文

按 `AGENTS.md` 读取核心顺序，再读取 `docs/agent/AGENT_RUNTIME.md`、`docs/agent/QUESTION_INTELLIGENCE.md`、`agent-lab` 面试模拟合同、InterviewTask/Question/Answer Schema、SSE 与生命周期测试。

## 风险

- Interview 尚未持久化完整模拟/单技能练习模式、稳定题目技能元数据和受控追问目的。
- 后续任务不得重新引入 API runtime DDL 或绕过 B0 SSE 候选人边界。
