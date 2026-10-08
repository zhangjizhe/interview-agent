# 当前任务

最后更新：2026-10-08

## 任务 ID

INTERVIEW-CACHE-CONTEXT-1

## 目标与范围

用户批准开始优化。本阶段只修复普通 Interview 答案缓存的上下文隔离：完整消息、实际主路由模型、生成参数、组织/用户/面试与套餐限制纳入 SHA-256 指纹；只复用完整文本答案，工具请求、截断和 fallback 不写答案缓存。复用现有 Gateway、Redis、白名单与成本记录，隔离旧缓存，不清空共享数据。

## 状态

工程优化、合成验收与本机部署已完成，报告见 docs/ACCEPTANCE-REPORT-2026-10-08-ANSWER-CACHE.md；提交推送核验后等待用户继续。无新增数据库表、公开 API、UI 或依赖。Lab 评测继续绕过答案缓存；付费产品 canary 与可信真实评测仍受月度额度和未知中断成本阻塞，不改变额度或发布候选。

## 验收

最终 API Jest 77 suites / 600 tests 通过（14 dedicated DB skipped）；Cache 22、Web 83、lint/typecheck/build 通过。真实 Redis 验证命中、上下文/模型/套餐/身份隔离、12 用户并发、TTL 与流式零 usage；Provider 为离线合成 fixture。正式质量 Benchmark 不在本轮执行，交付报告记录边界。
