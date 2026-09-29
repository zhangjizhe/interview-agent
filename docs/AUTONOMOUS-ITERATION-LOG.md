# 自主迭代记录

本文件为本次六 Phase 计划的进度事实来源；只记录已执行内容，不将计划视为交付。

## 2026-09-29 · 基线校正与 P1-1

- 任务：校正文档边界，复用全局 Guard 完成限流配置与认证/SSE 策略。
- 改动文件：docs/agent-lab-status.md、docs/project/ACTIVE_TASK.md、package.json、apps/api/package.json、pnpm-lock.yaml、eslint.config.mjs、.env.example、apps/api/src/infra/config/configuration.ts、apps/api/src/modules/auth/{auth.module.ts,auth.controller.ts,security-throttler.guard.ts}、apps/api/src/modules/interview/controllers/interview-flow.controller.ts、apps/api/src/common/filters/global-exception.filter.ts。
- 新增测试：rate-limit.security.spec.ts 共 8 条，覆盖窗口单位、默认阈值、环境覆盖、正常请求、超限/错误码/Retry-After、认证限额、IP 隔离、SSE 建连策略；先运行失败测试，再实现。
- 验证：限流测试 8/8；pnpm test、pnpm typecheck、pnpm build 通过。更正：初次误将已启动的 lint 当作通过；复核发现现有 TypeScript lint 指令缺少插件，已在后续校正，最终门禁必须读取完成退出码。
- 依赖：用户明确批准 ESLint 9 与 TypeScript parser 8 开发依赖；没有升级业务依赖。
- 风险：限流存储沿用单实例内存，多实例部署仍需网关统一限流或共享存储；IP 来自 Express req.ip，不信任任意客户端 X-Forwarded-For。SSE 仅限制新请求，不是活跃连接并发上限。
- 待决策：无；Phase 2–6 未开始。已有本地 UI 修改与历史交接文档不混入本项提交。

## 核心执行原则（用户确认，2026-09-29）

- 以工程最佳实践和可商用为目标：安全、数据完整性、可回滚和可验证优先；未验收的能力不宣称已交付。
- 每个任务通过测试/lint/build 后独立提交并推送到 `origin/agent-lab`，核实远端成功；失败不记为完成。
- 每个 Phase 完成后暂停，等待用户明确继续；不跨 Phase 自动执行。

## 2026-09-29 · P1-2 JWT 会话

- 任务：30 分钟 access、7 天一次性 refresh、logout 吊销、密码变更全端下线及旧 token 兼容。
- 改动文件：auth-session.service.ts、auth.service.ts、jwt-auth.guard.ts、auth.controller.ts、auth.module.ts、configuration.ts、.env.example、docs/architecture-decisions.md、docs/runbook.md；同时补齐 ESLint TypeScript 插件以兼容已有注释指令。
- 新增测试：auth-session.security.spec.ts 12 条、jwt-guard.security.spec.ts 3 条、auth.service.spec.ts 新增 2 条；覆盖轮换竞争、剩余 TTL、logout/改密吊销、旧 token、故障拒绝、改密条件更新及 Guard 边界。
- 验证：先验证缺失实现失败，再通过针对性测试；完整 pnpm test、lint、typecheck、build 通过。lint 保留 4 条历史无效禁用注释警告，不做无关代码格式修改。
- 数据库：无 schema 变更，无 migration/db push；未调用真实模型。
- 风险：Redis 认证状态需持久化、不可淘汰；改密锁故障须按 Runbook 恢复。当前客户端没有自动刷新，access 到期重新登录；不宣称浏览器无感续期或完成商用部署验收。
