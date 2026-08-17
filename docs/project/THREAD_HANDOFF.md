# 任务交接

最后更新：2026-08-15

## 上一任务

TASK-016：B4 受控面试模式与稳定题目合同

## 已完成

- Interview 现在持久化完整模拟/单技能练习、目标岗位档案版本快照和所选岗位技能。
- 题目记录具有稳定的选题快照、技能、追问目的和父题关联；现有 LangGraph/Gateway 拓扑未改变。
- 浏览器流式重试复用数据库唯一的客户端消息 ID。完成请求仅重放保存的 assistant 回复；处理中请求不再调用 Agent。
- 2026-08-15 本地 Docker migration、API/Web build、全量回归和真实 JWT 浏览器验收 21/21 通过；未触发 Provider 调用。

## 改动文件

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260815002000_interview_mode_stream_contract/migration.sql`
- `apps/api/src/modules/interview/controllers/interview-lifecycle.controller.ts`
- `apps/api/src/modules/interview/controllers/interview-flow.controller.ts`
- `apps/api/src/modules/interview/services/stream-message-delivery.service.ts`
- `apps/api/src/modules/interview/services/dynamic-task-queue.service.ts`
- `apps/api/src/modules/agent/interview-agent.service.ts`
- `apps/web/src/pages/HomePage.tsx`
- `apps/web/src/hooks/useInterviewStream.ts`
- `apps/web/e2e/auth-real-acceptance.mjs`
- `docs/ACCEPTANCE-REPORT-2026-08-15-B4.md`
- `docs/project/CURRENT_STATE.md`
- `docs/project/ACTIVE_TASK.md`
- `docs/project/TASKS.md`
- `docs/project/THREAD_HANDOFF.md`
- `docs/project/ARCHITECTURE_MAP.md`
- `docs/project/DECISIONS.md`
- `docs/project/CHANGELOG.md`
- `docs/product/REFACTOR_PROGRAM.md`

## 重要决策

- 面试模式、所选技能和岗位档案版本是持久化领域事实，不依赖 Web 状态或 Agent 自由文本。
- 请求幂等以数据库唯一约束为准，而不是前端 token 去重；重试不能产生第二次 Agent 调用或成本。
- 完成回复重放是当前断流恢复边界；Event ID/Offset 和逐 token 事件持久化留给独立任务，不能伪称已支持。

## 当前状态

重构 B4 已完成。面试模式、题目选择快照与候选人流式请求幂等已通过加性 migration、API 27 suites / 249 tests、Web 75 tests、API/Web build 和 Docker 真实 JWT 浏览器验收 21/21 验证。

## 已知问题

- TrainingRecommendation/Attempt、训练完成记录、复测关联、真实趋势比较和训练界面尚未实现。
- SSE 仍不支持 Event ID/Offset 逐 token 续传；B4 只保证请求重试不重复写入回答或成本。

## 推荐下一任务

TASK-B5：基于正式 Evidence 的单技能训练推荐与复测关联。

## 所需上下文

按 `AGENTS.md` 读取核心顺序，再读取 `docs/agent/EVALUATION.md`、`docs/agent/SKILL_MODEL.md`、`docs/product/P0_IMPLEMENTATION_PLAN.md`、Evaluation/Skill Schema、现有 CandidateSkillState 聚合、Question/Interview 生命周期和训练页面空壳。

## 风险

- 训练完成不能直接修改 CandidateSkillState；只有后续可比较面试的 FINAL Evidence 才能改变正式技能状态。
- 后续任务不得重新引入 API runtime DDL、绕过 B0 SSE 候选人边界，或把未完成的 Event ID/Offset 恢复错误标记为已交付。
