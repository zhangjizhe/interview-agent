# 当前任务

最后更新：2026-08-15

## 任务 ID

TASK-017

## 目标

完成 B5：基于正式证据的单技能训练推荐与复测关联。

## 状态

进行中

## 范围

- 从成功 FINAL EvaluationRun 的 AssessmentEvidence 和岗位技能缺口创建单技能 TrainingRecommendation。
- 保存推荐状态、训练完成记录与复测面试关联；训练完成本身不得修改 CandidateSkillState。
- 为候选人提供真实的推荐、完成和重新练习入口，并保留所有权与证据可追溯性。
- 用 API/Web 合同、数据迁移、回放链路和浏览器验收验证训练不伪造能力提升。

## 非目标

- 多日训练计划、支付、额度或 Agent 自主训练策略。
- 重写 LangGraph 拓扑、Provider、Prompt、检索或工具执行策略。
- 手工修改 CandidateSkillState、根据训练完成直接提高分数，或回填旧 AnswerHistory 为正式证据。

## 相关文件

- `docs/agent/EVALUATION.md`
- `docs/agent/SKILL_MODEL.md`
- `docs/product/P0_IMPLEMENTATION_PLAN.md`
- `apps/api/src/modules/interview/`
- `apps/api/prisma/schema.prisma`
- `apps/web/src/pages/`
- `apps/web/e2e/`
- `docs/product/REFACTOR_PROGRAM.md`

## 验收标准

- 每项推荐可追溯到同一用户、岗位、技能、成功 FINAL Evidence 和岗位档案版本。
- 训练完成记录不改变 CandidateSkillState；只有关联复测的成功 FINAL Evidence 可改变正式状态。
- API/Web 合同测试、类型检查、构建和真实浏览器主路径验证有记录。
- 不调用未受控的真实 Provider；如需要真实 Provider 验证，必须单独满足成本与 Harness 门。

## 已知风险

- TrainingRecommendation 不能从自由文本 Report 或旧 AnswerHistory 推导，必须消费受用户/岗位范围约束的成功 FINAL Evidence。
- 训练完成与复测的关联必须是加性事实，不能覆盖历史面试或绕过 B4 的稳定题目、SSE 和成本边界。
