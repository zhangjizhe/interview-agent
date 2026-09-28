# 自主迭代记录

本文件为本次六 Phase 计划的进度事实来源；只记录已执行内容，不将计划视为交付。

## 2026-09-29 · 基线校正与 P1-1

- 任务：校正文档边界，复用全局 Guard 完成限流配置与认证/SSE 策略。
- 改动文件：docs/agent-lab-status.md、docs/project/ACTIVE_TASK.md、package.json、apps/api/package.json、pnpm-lock.yaml、eslint.config.mjs、.env.example、apps/api/src/infra/config/configuration.ts、apps/api/src/modules/auth/{auth.module.ts,auth.controller.ts,security-throttler.guard.ts}、apps/api/src/modules/interview/controllers/interview-flow.controller.ts、apps/api/src/common/filters/global-exception.filter.ts。
- 新增测试：rate-limit.security.spec.ts 共 8 条，覆盖窗口单位、默认阈值、环境覆盖、正常请求、超限/错误码/Retry-After、认证限额、IP 隔离、SSE 建连策略；先运行失败测试，再实现。
- 验证：限流测试 8/8；pnpm test、pnpm lint、pnpm typecheck、pnpm build 全部通过（完整测试需允许 tsx 创建本地 IPC）。
- 依赖：用户明确批准 ESLint 9 与 TypeScript parser 8 开发依赖；没有升级业务依赖。
- 风险：限流存储沿用单实例内存，多实例部署仍需网关统一限流或共享存储；IP 来自 Express req.ip，不信任任意客户端 X-Forwarded-For。SSE 仅限制新请求，不是活跃连接并发上限。
- 待决策：无；Phase 2–6 未开始。已有本地 UI 修改与历史交接文档不混入本项提交。
