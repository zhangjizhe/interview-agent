# Current state

2026-11-23 安全加固与架构收敛进展（分支 `feat/security-circuit-breaker-95`，未部署，未触碰 `.env`/真实 Token）：
- **PR #74 阻塞已修复并推送**：`feat/lab-shell-mobile` 新增单文件提交 `e3c7525`（先展开 `details.mcp-scope` 再断言完整文案可见），已推至 `origin/feat/lab-shell-mobile` 等待远端 `Product verification` 全绿。
- **双模型熔断兜底与主备路由**（`81ea23b`）：`LlmGatewayService` 实现千问 + DeepSeek 进程级 `CLOSED/OPEN/HALF_OPEN` 瞬态熔断与 `401/402/403/404` 永久隔离，默认主备切换为 DeepSeek 优先、千问热备（`LLM_PRIMARY_PROVIDER` / `LLM_CB_FAILURE_THRESHOLD` / `LLM_CB_COOLDOWN_MS` 已写入 `docker-compose.yml` 与 `.env.example`）；`MultiAgentService` 移除 `'qwen'` 硬编码并对齐定价目录 `deepseek-flash`。
- **Embedding 账本全量收口**（`81ea23b`）：`ResumeRAGService`、`KnowledgeBaseService`、`MilvusLongTermMemory` 在存在 `tenantContext` 时统一走 `LlmGatewayService.embedText()` 纳入配额与 `UsageLedger`。
- **防刷限流与边缘隔离**（`81ea23b`）：`examples/portfolio-site/src/app.mjs` 移除客户端可控请求头 `oai-authenticated-user-id` 限流绕过风险，改为仅按边缘可信 IP 限流并补防伪造测试；`apps/web/nginx.conf` 阻断 `/api/agent-lab`（404）并屏蔽票据路径访问日志。
- **P1 空房间原子条件删除**（`c6b1dcc`）：`InterviewLifecycleController.deleteInterview` 改为原子 `deleteMany`（`status: 'IN_PROGRESS'`、`messages: { none: {} }`、`report: { is: null }`），非空或已完成面试返回 `409 ConflictException`。
- **本轮本地验证**：`apps/api` / `apps/web` / `apps/agent-lab` 三端 `tsc --noEmit` 0 错误通过；6 个核心 Jest 套件（`interview-lifecycle.start.spec.ts` + 5 个 LLM 安全/熔断/定价/配额/缓存套件）32/32 通过。Node 20+ ESLint/Vitest/个人站单测、Docker 隔离浏览器验收与测试坑 Token 零泄露实测待执行；**整包产品仍保持 NOT_ACCEPTED / 未交付**。

2026-11-19费用只读核对：用户报告千问额度消耗9元，尚未与供应商账单对上。Nov18本机有1条网站助手Qwen Plus完成记录，估算0.0010108CNY；另1条LLM准入记录缺费用证据。运行中简历向量服务存在绕过统一账本的直接embedding路径（源码已于 2026-11-23 `81ea23b` 收口进 `LlmGatewayService`，运行容器尚未重建）；未知不记零，不能据此归因9元。私有账本只更新到Nov16。详见[费用核对](../acceptance/COST_RECONCILIATION_2026-11-18.md)，用户已确认百炼/DashScope API消费账单；待补模型/金额及统计时段。本次未调用模型或修改服务。

2026-11-19: preparation workflow checkpoint completed locally; **whole product NOT_ACCEPTED / not delivered**. User requires product, design and supported-device acceptance before delivery. Binding criteria: [commercial gate](../acceptance/COMMERCIAL_PRODUCT_DESIGN_GATE.md).

Jobs now validate save/activation receipts, lock ambiguous writes across remount, allow read-only reconciliation inside the editor, retain drafts and restore keyboard focus. Resume feedback is adjacent and state-specific, pending job reference reads block submission, malformed summary rows fail as reads, storage-quota preflight does not send/freeze uploads. Preparation metadata, focus and tablet/landscape controls refined. Final45 related tests, types/lint/Docker/diff passed;27 bounded viewport probes plus final recovery portrait/landscape and synthetic browser flows verified. [Evidence, exact versions and limitations](../acceptance/PREPARATION_PRODUCT_DESIGN_ACCEPTANCE.md). No real model/RAG/persistence or physical-device pass claimed.

## Deployment / release boundary

Branch agent-lab, base7405555946f2f68c921915a8fee03184e702f04b + large earlier uncommitted API/Lab/Web/site WIP. No commit/push/merge. Candidate manifest11ae77053423… only isolated verification. Live5173 remains prior95fbbf3f… and rollback interview-web-rollback-journey-nov18; backend/data volumes/grants/secrets unchanged.

Last recorded CI43812962156 failed dependency security audit; remote status not refreshed. Current exact-source CI, reviewed scope and release/recovery remain mandatory. The earlier75-test Web session/cache/snapshot candidate remains undeployed; see SESSION_CACHE_ISOLATION.md.

## Remaining scope

Real preparation→interview→persisted report/evidence→training/retest, model quality and cost receipts; whole-site design/accessibility/state review, supported engines and actual iPhone/Android WeChat/mobile Chrome; server mutation idempotency, provenance and full resume/file-URL knowledge; target HTTPS/backup/recovery and CI all remain open. No provider/email or real user upload this phase. Fixture origins/tabs/servers and temporary viewport override were cleaned up.

Earlier normal-session observation of a saved resume/missing job was not re-read here; historical9 other-scoped rows were not reassigned. Topic routing: CONTEXT_INDEX.md; prioritized work: TASKS.md. Previous context archived in archive/context-before-preparation-acceptance-2026-11-19/.
