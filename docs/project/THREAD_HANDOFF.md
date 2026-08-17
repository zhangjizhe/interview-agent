# 任务交接

最后更新：2026-08-15

## 上一任务

TASK-017：B5 单技能训练推荐与复测关联

## 已完成

- TrainingRecommendation 只由活跃岗位、成功 FINAL Evidence 和低分正式技能状态生成。
- TrainingAttempt 记录训练完成和关联复测；训练完成不修改 CandidateSkillState。
- 复测使用现有单技能 Interview 路径，并检查目标岗位版本和技能归属。
- 2026-08-17 本地 Docker migration、API/Web build、全量回归和真实 JWT 浏览器验收 22/22 通过；未触发 Provider 调用。

## 改动文件

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260817000000_training_recommendations/migration.sql`
- `apps/api/src/modules/interview/controllers/interview-lifecycle.controller.ts`
- `apps/api/src/modules/interview/controllers/interview-flow.controller.ts`
- `apps/api/src/modules/interview/services/training.service.ts`
- `apps/api/src/modules/interview/controllers/skill-profile.controller.ts`
- `apps/web/src/pages/TrainingPage.tsx`
- `apps/web/e2e/auth-real-acceptance.mjs`
- `docs/ACCEPTANCE-REPORT-2026-08-17-B5.md`
- `docs/project/CURRENT_STATE.md`
- `docs/project/ACTIVE_TASK.md`
- `docs/project/TASKS.md`
- `docs/project/THREAD_HANDOFF.md`
- `docs/project/ARCHITECTURE_MAP.md`
- `docs/project/DECISIONS.md`
- `docs/project/CHANGELOG.md`
- `docs/product/REFACTOR_PROGRAM.md`

## 重要决策

- 训练推荐必须来自成功 FINAL Evidence，不能由自由文本报告或旧 AnswerHistory 生成。
- 训练完成记录和技能状态是独立领域事实；只有复测后的 FINAL 聚合可改变正式状态。
- 复测前必须验证岗位版本和所选技能，避免用过期岗位目标伪造可比趋势。

## 当前状态

重构 B5 已完成。训练推荐、完成记录和复测关联已通过加性 migration、API 29 suites / 256 tests、Web 76 tests、API/Web build 和 Docker 真实 JWT 浏览器验收 22/22 验证。

## 已知问题

- 真实趋势比较、Event ID/Offset 逐 token 续传和服务端使用量/额度边界尚未实现。

## 推荐下一任务

TASK-B6：基于 SessionCost 的使用量与服务端额度边界。

## 所需上下文

按 `AGENTS.md` 读取核心顺序，再读取 `docs/harness/RELEASE_GATE.md`、`docs/harness/HARNESS.md`、SessionCost/Gateway、鉴权/面试入口、现有浏览器验收和 Docker migration job。

## 风险

- 用量归集与额度拒绝必须服务端强制，不能依赖 Web 控件或任意 Provider 回传。
- 后续任务不得重新引入 API runtime DDL、绕过 B0 SSE 候选人边界，或把未完成的 Event ID/Offset 恢复错误标记为已交付。
