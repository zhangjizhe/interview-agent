# 任务交接

最后更新：2026-08-15

## 上一任务

TASK-018：B6 使用量与发布平面最小边界

## 已完成

- 新增 Usage Ledger，以用户、自然月和 Interview 唯一键记录面试创建访问事实。
- `QUOTA_MONTHLY_INTERVIEW_LIMIT` 由服务端读取；上限耗尽时 API 在创建前返回 429。
- 候选人首页只读显示面试使用量摘要，不显示 Token、模型、Provider、工具或成本。
- Docker 主路径在额度上限 1 时验证 `0/1 -> 1/0 -> 429`，随后恢复默认未配置额度状态。

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

TASK-AgentLab-V0.2：Trace、评测、实验和发布合同。

## 所需上下文

按 `AGENTS.md` 读取核心顺序，再读取 `docs/agent-lab/CHARTER.md`、`docs/agent-lab/UI_OPERATING_SYSTEM.md`、Harness、Golden Dataset、Agent Lab 控制台和受保护管理 API。

## 风险

- 用量归集与额度拒绝必须服务端强制，不能依赖 Web 控件或任意 Provider 回传。
- 后续任务不得重新引入 API runtime DDL、绕过 B0 SSE 候选人边界，或把未完成的 Event ID/Offset 恢复错误标记为已交付。
