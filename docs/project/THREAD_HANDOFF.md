# 任务交接

最后更新：2026-08-14

## 上一任务

TASK-006：训练平台前端壳

## 已完成

- 新增候选人 Web Shell，主导航为首页、面试记录和岗位设置；旧工具/Token 优先首页已替换。
- 新增 TargetJob/JD 设置页，可创建、编辑、切换当前岗位。
- 首页读取真实 TargetJob、Readiness、简历和面试记录 API。准备度不可用时显示证据不足与 API 返回的缺失原因，不伪造分数。
- 上传简历后通过已有 `start` API 按当前 `targetJobId` 创建面试。
- 面试记录支持继续进行中会话、打开已有评价，或在已结束无 Report 时重试最终评价。
- 面试页面不再向候选人展示 Token、工具、MCP、Agent 调用、模型、提示词、追踪信息或内部复核的评分/操作。
- 新增 Web 训练合同测试，覆盖证据不足与评价失败恢复映射。

## 改动文件

- `apps/web/src/App.tsx`
- `apps/web/src/components/AppShell.tsx`
- `apps/web/src/pages/HomePage.tsx`
- `apps/web/src/pages/SettingsPage.tsx`
- `apps/web/src/pages/InterviewPage.tsx`
- `apps/web/src/utils/training.ts`
- `apps/web/src/pages/HomePage.test.tsx`
- `apps/web/src/utils/training.test.ts`
- `docs/project/CURRENT_STATE.md`
- `docs/project/ARCHITECTURE_MAP.md`
- `docs/project/TASKS.md`
- `docs/project/ACTIVE_TASK.md`
- `docs/project/CHANGELOG.md`
- `docs/project/THREAD_HANDOFF.md`

## 重要决策

- 候选人 Web 必须把 Readiness API 的 `available`、`missingReasons` 和 `confidence` 作为事实来源；没有证据不能用静态卡片或历史 Token/次数替代。
- 候选人面试与报告界面不应成为 Agent 的调试控制台。内部调用信息保留给受保护的维护路径。
- 评价恢复复用既有 `POST /interview/:id/end` 与最终评估幂等逻辑；本任务未新增或改变评价、SSE、模型或 Prompt 合同。

## 当前状态

候选人可在 Web 中建立和切换目标岗位，查看透明准备度摘要，开始关联岗位的模拟面试，并从面试记录恢复评价失败。CandidateSkillState 尚未由正式评价自动聚合，因此当前正常用户会看到证据不足状态，这是预期且诚实的行为。

## 已知问题

- 本机 PostgreSQL 已有业务表但没有 Prisma migration 基线，`prisma migrate deploy` 返回 `P3005`，未执行任何 Migration。先完成 Schema 审计、备份和受控 Baseline Procedure，禁止直接标记历史迁移已应用。
- ResumeRAG 不是版本化简历存储；准备度目前只判断当前可检索简历是否存在。
- 生产技能状态聚合、趋势、训练推荐和训练界面尚未实现。
- 本地 `.pnpm-store/` 是前序包管理器尝试重装产生的未跟踪缓存，不纳入交付。

## 推荐下一任务

TASK-007：训练建议与训练界面。

## 所需上下文

按 `AGENTS.md` 读取核心顺序，再读取 `docs/agent/SKILL_MODEL.md`、`docs/agent/QUESTION_INTELLIGENCE.md`、`docs/product/SCREEN_SPEC.md`、正式评价服务、CandidateSkillState Schema、当前 Web Route 和浏览器验收。

## 风险

- CandidateSkillState 还没有生产聚合来源，训练推荐不能据此伪造弱项或计划。
- 不得把训练建议、SSE 改版、Quota 或 Billing 合并到同一任务。
