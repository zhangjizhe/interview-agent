# 任务交接

最后更新：2026-08-15

## 上一任务

TASK-013：B2 正式评价与技能状态聚合

## 已完成

- 新增独立技能状态聚合服务，由 Final Evaluation 的 Prisma transaction 调用。
- 仅当前用户、目标岗位、成功 FINAL EvaluationRun 中具有 `skillId` 与分数的 Evidence 可重算 CandidateSkillState。
- 聚合按全部有效 Evidence 重算分数、置信度和证据数，不通过内存计数累加；同一 source run 重试不会污染趋势。
- PREVIEW、PRACTICE、FAILED、DEGRADED 和无归属证据不写入正式技能状态。

## 改动文件

- `apps/api/src/modules/interview/services/skill-state-aggregation.service.ts`
- `apps/api/src/modules/interview/services/evaluation.service.ts`
- `apps/api/src/modules/interview/interview.module.ts`
- `apps/api/src/__tests__/skill-state-aggregation.service.spec.ts`
- `apps/api/src/__tests__/evaluation.service.spec.ts`
- `docs/project/CURRENT_STATE.md`
- `docs/project/ACTIVE_TASK.md`
- `docs/project/TASKS.md`
- `docs/product/REFACTOR_PROGRAM.md`

## 重要决策

- 正式技能状态只能由成功 FINAL EvaluationRun 的 AssessmentEvidence 生成，不能从旧 AnswerHistory 或自由文本 Report 回填。
- 聚合服务使用 transaction client，任何 Evidence、EvaluationRun、SkillState 或 Report 写入失败会一起回滚。
- 本任务不产生训练结论；现有技能状态为空时，候选人仍必须看到证据不足。

## 当前状态

重构 B2 已完成。正式 FINAL 证据到技能状态的事务、隔离和幂等合同已具备 API 回归保护；API 25 suites / 241 tests、Cache 22 tests、Golden Dataset 结构校验、typecheck/build 通过。

## 已知问题

- 训练推荐、训练完成记录、复测关联、真实趋势比较和训练界面尚未实现。
- SSE 仍不支持 Event ID/Offset 断点续传，这属于 B4 的独立范围。

## 推荐下一任务

TASK-B3：岗位版本与准备度合同强化。

## 所需上下文

按 `AGENTS.md` 读取核心顺序，再读取 `docs/product/REFACTOR_PROGRAM.md`、TargetJob/JobReadinessService、Prisma Schema、岗位并发/所有权测试与候选人 API 合同。

## 风险

- TargetJob 仍缺少数据库层的单活跃岗位约束和版本边界，不能在 UI 中假设并发写入正确。
- 后续任务不得重新引入 API runtime DDL 或绕过 B0 SSE 候选人边界。
