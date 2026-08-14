# 当前任务

最后更新：2026-08-15

## 任务 ID

TASK-013

## 目标

完成 B2：将成功的 FINAL EvaluationRun 原子聚合为可追溯 CandidateSkillState。

## 状态

完成

## 范围

- 在权威最终评价服务中仅对成功 `FINAL` 运行聚合 CandidateSkillState。
- 保持用户、目标岗位、面试、问题、回答、证据和来源 EvaluationRun 的完整可追溯链。
- 确保重试幂等，且 PREVIEW、PRACTICE、FAILED、DEGRADED 不污染正式状态。
- 为聚合、跨用户隔离、重试和失败恢复添加合同测试与 Harness 结构验证。

## 非目标

- 训练推荐、SSE 断点续传、额度或支付。
- 改变 LangGraph 拓扑、Provider、Prompt、检索和工具执行策略。
- 从旧 AnswerHistory 或自由文本 Report 回填正式技能状态。

## 相关文件

- `apps/api/src/modules/interview/services/evaluation.service.ts`
- `apps/api/src/modules/interview/services/`
- `apps/api/src/modules/interview/controllers/evaluation.controller.ts`
- `apps/api/prisma/schema.prisma`
- `apps/api/src/__tests__/`
- `apps/api/src/evals/`
- `docs/agent/EVALUATION.md`
- `docs/agent/SKILL_MODEL.md`
- `docs/product/REFACTOR_PROGRAM.md`

## 验收标准

- FINAL 运行成功时，正式技能状态在同一事务中写入，且可回溯到有效证据。
- 非 FINAL 或失败/未批准降级运行无法写入或覆盖正式状态。
- 重复执行相同 FINAL 运行不会重复累计证据或破坏状态。
- API 测试、类型检查、构建和 Eval/Harness 结构验证有记录。

## 已知风险

- 现有 CandidateSkillState 是空表；本任务不得通过历史回填制造技能结论。
- EvaluationRun 可能包含 Provider 错误或降级状态；必须先审计现有最终评价服务的事务边界。

## 交付结果

- `SkillStateAggregationService` 在最终评价事务内按用户、目标岗位、技能和成功 FINAL Evidence 重算技能状态。
- 聚合只消费具有稳定 `skillId` 和分数的当前运行证据；没有目标岗位、技能或分数时保持证据不足。
- PREVIEW、PRACTICE、FAILED、DEGRADED 和其他用户/岗位的证据被关系筛选排除。
- 重试同一来源运行会重算相同状态并保留趋势，而非重复累加证据。
