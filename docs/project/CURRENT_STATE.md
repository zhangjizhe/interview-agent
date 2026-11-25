# Current state

2026-11-25 双消费端 SSE 流式对话与稳定性加固（分支 `agent-lab`，`ce170e2`）：
- **个人网站 ↔ Agent Lab 真 SSE 协商与流式消费**：`examples/portfolio-site/src/agent-lab.mjs` 新增 `Accept: text/event-stream, application/json` 协议协商，收到 `text/event-stream` 时通过 `readSSE` 实时消费 `portfolio-assistant/stream-v1`（严格校验 `meta` 契约、来源白名单、12,000 字上限、终态/可重试错误区分及防截断校验），同时对 JSON `REFUSED`/`COMPLETED` 及旧版 `202 + ticket` 轮询保持零破坏兼容。
- **个人网站后端 SSE 稳定性加固**：`apps/api/src/modules/portfolio-assistant/portfolio-assistant.controller.ts` 新增 10 秒 `: ping` 保活心跳、`status` 帧去重（消除每 200ms 刷屏重复状态）与 `writableEnded`/`destroyed` 断连写入守卫（`portfolio-stream.controller.spec.ts` 补齐去重单测）。
- **面试平台 SSE 断连保护与快速失败**：`apps/api/src/modules/interview/controllers/interview-flow.controller.ts` 新增 `clientDisconnected`/`isStreamClosed` 守卫与 `drain`/`close` 双向清理，客户端中途断开不再导致写入异常或挂起，同时继续安全落库以便重连幂等回放；`apps/web/src/hooks/useInterviewStream.ts` 显式携带 `Accept: text/event-stream`，遇到 `400/401/403/404/422/429` 确定性错误时快速失败并透出服务端文案。
- **本轮单测与构建验证**：`examples/portfolio-site` 构建 + **38/38** Node 22 测试、API `portfolio-stream.controller.spec.ts` + `interview-flow.replay.spec.ts` **8/8**、Web `useInterviewStream.test.ts` **13/13**、`pnpm lint`、`api`/`web` `typecheck` & `build` 全部 PASS。**整包产品仍诚实保持 NOT_ACCEPTED**。

2026-11-25 架构升级收口（DeepSeek 缓存命中统计修复 + 消费端 👍/👎 反馈回流 + 一键发布脚本 + 66 篇工程实践文章全量 5 段式升级，分支 `agent-lab`）：
- **DeepSeek / 千问 Prompt Cache 命中计量修复**：`deepseek.provider.ts` 与 `qwen.provider.ts` 在流式/非流式响应中提取 `prompt_cache_hit_tokens` 与 `prompt_tokens_details.cached_tokens` 并透传 `cachedTokens`，`prompt-cache.strategy.ts` 的 `extractCacheUsage` 完成归一化（补齐 `cache.spec.ts` 断言）。
- **消费端 → Agent Lab 实时反馈闭环**：`interview-flow.controller.ts` 新增 `POST /api/interview/:interviewId/feedback`（`requireOwnedInterview` 归属校验 + 服务端 PII/密钥脱敏 + 写入 `run_feedbacks`）；`apps/web` 的 `ChatBubble.tsx` 与 `InterviewPage.tsx` 接入「有帮助 👍 / 待改进 👎」非阻塞反馈按钮并直连 Agent Lab 飞轮 Bad Case 队列。
- **一键安全发布脚本**：新增 `scripts/deploy/deploy-mac.sh`（拉取 `origin/agent-lab` → 打回滚镜像标签 → 重建重启不碰数据卷 → 执行 `prisma migrate deploy` → 30s 健康探活与 200/404/401 边缘校验）。
- **个人作品集文章全量升级**：全部 66 篇现代工程实践文章（`id=12~77`）完成 5 段式架构重写（背景现场 → 根因思考 → Before/After 代码 → 选型对比 → 架构角色+降级矩阵+迁移自检），11 篇 2020 历史归档原文（`id=1~11`）按 `portfolio-source.integrity.spec.ts` 契约保持逐字节完整一致。
- **本轮全量验证**：`pnpm lint --max-warnings 0`、三端 `typecheck`/`build`、个人站 36/36 单测、API Jest **124/1345** + `cache.spec.ts` **22/22**、Web/Lab Vitest **49/476** 全部通过。**整包产品仍诚实保持 NOT_ACCEPTED**。

2026-11-25 真实 DeepSeek 引擎对照实测完成（`v1 multi` vs `v2 fast-dual`，预算上限 ¥3.00，实际总花费 **¥0.5007 CNY**，分支 `agent-lab`）：
- **实测结果（同一 5 轮高级 AI Agent 全栈面试题面，直连真实 DeepSeek API 与本机 `interview-api:candidate-ca83c6f` + `interview-postgres` `session_costs`）**：
  - **平均首字延迟 (TTFT)**：`34,449 ms` → **`1,430 ms`**（**-95.8%，提速 24.1×**，最快 `733 ms`）
  - **平均单轮总耗时**：`46,053 ms` → **`9,698 ms`**（**-78.9%，提速 4.75×**）
  - **5 轮总 LLM 调用 / Token / 费用**：`50 次 / 110,796 tokens / ¥0.4305` → **`10 次 / 14,530 tokens / ¥0.0703`**（调用 **-80%**、Token **-86.9%**、费用 **-83.7%**）
  - **追问质量与流稳定性**：`v2 (fast-dual)` 5/5 轮均输出精炼深挖追问（无重复拼接），本机运行容器 `interview-api` 已切换为 `AGENT_ENGINE=fast-dual`。
  - **诚实局限**：本轮实测观察到 `session_costs.promptCacheHits=0`，DeepSeek `prompt_cache_hit_tokens` 上报映射待后续排查；完整报告见 [BENCHMARK_V1_VS_V2_2026-11-25.md](../acceptance/BENCHMARK_V1_VS_V2_2026-11-25.md)。**整包产品仍保持 NOT_ACCEPTED / 未商用交付**。

2026-11-24 Phase B 收口 + Phase A & Phase C（低延迟双轨面试引擎 + Agent Lab 闭环飞轮 + RunFeedback/Bad Case 队列）进展（分支 `agent-lab`，基于已合入 `main` 的 `3c4f80b`，未调用真实外部付费模型，未触碰 `.env`）：
- **Phase B 已收口并合入主干**：
  - PR #81（`feat/security-circuit-breaker-95`）远端 GitHub Actions `Product verification` **5/5 全绿**并合入 `main`（`3c4f80b`）；`agent-lab` 已快进对齐 `3c4f80b` 并推送至 `origin/agent-lab`。
  - 本机运行容器 `interview-api`（`:3001`）、`interview-web`（`:5173`）、`interview-agent-lab`（`:5175`）已保留回滚镜像标签（`rollback-2026-11-24`）。
- **Phase A（已提交 `41f85d4`）**：
  1. **A1 低延迟双轨面试引擎 `v2 (fast-dual)`**：`apps/api/src/modules/agent/interview-agent.service.ts` 新增 `AGENT_ENGINE=fast-dual` 单次直出流式热路径（三层深挖 Prompt + Langfuse `agent.fast_dual.hot_path` TTFT/流耗时观测 + 复用持久化任务队列与记忆），默认引擎仍保持 `multi` 零回归；新增单测 `apps/api/src/__tests__/interview-agent.fast-dual.spec.ts`。
  2. **A2 Agent Lab 一键 Bad Case 沉淀回归集**：新增 `POST /api/agent-lab/runs/:runId/promote-to-dataset`（`evaluation.controller.ts` / `evaluation.service.ts` / `agent.dto.ts`），服务端自动脱敏邮箱、手机号与常见密钥前缀并写入来源元数据，复用未冻结与防重校验；`apps/agent-lab/src/RunInspector.tsx` 新增「转入回归集」交互面板。
  3. **A3 Agent Lab 历史已发布版本秒级回滚**：`apps/agent-lab/src/main.tsx` 在发布页新增 `PublishedVersionRollback` 组件，二次确认后调用 `POST /api/agent-lab/agents/:agentId/versions/:versionId/activate` 切换历史 `PUBLISHED` 版本并写审计记录。
- **Phase C（RunFeedback 反馈表 + Bad Case 待评审队列 + 4 步演进飞轮驾驶舱）**：
  1. **Prisma Schema 与本地数据库同步**：新增 `FeedbackRating` 枚举与多租户隔离的 `RunFeedback` 表（复合外键 `(runId, organizationId) -> runs(id, organizationId)`），迁移 `20261124000000_run_feedback_triage` 已通过 `prisma migrate deploy` 应用至本机 `interview-postgres`（数据库 `interview`）。
  2. **后端闭环 API**：新增 `POST /api/agent-lab/runs/:runId/feedback`（脱敏落库 👍/👎 反馈）与 `GET /api/agent-lab/bad-cases`（真实聚合 `FAILED` 与 `DOWN` 反馈运行及待评审/已沉淀计数）；`promoteRunToDataset` 沉淀成功后自动回填关联 `DOWN` 反馈的 `promotedCaseId`。
  3. **Lab 前端飞轮工作台**：`RunInspector.tsx` 新增快捷「标记正向 👍 / 标记 Bad Case 👎」按钮；`apps/agent-lab/src/main.tsx` 总览页新增 `BadCaseFlywheelPanel`（4 步评测驱动演进飞轮 + Bad Case 待评审列表 + 一键内联打开 `RunInspector` 转入回归集）。
  4. **本轮验证结果（Node 20.20.2）**：`pnpm lint --max-warnings 0`、`pnpm typecheck`（三端）、`pnpm build`（三端）、API 全量 Jest **124 套件 / 1344 用例** + `cache.spec.ts` **22/22**、Web/Lab 全量 Vitest **49 套件 / 475 用例**全部通过。
  5. **边界声明**：以上为本地单元测试、编译与迁移同步验证，**整包产品仍保持 NOT_ACCEPTED / 未商用交付**；真实 DeepSeek + Qwen 的 `v1 (multi)` vs `v2 (fast-dual)` 延迟/质量/费用对照评测待用户确认额度与预算上限后执行。

2026-11-24 安全加固、多 Agent 链路缺陷修复与隔离全链路验收（分支 `feat/security-circuit-breaker-95`，已合入 `main` `3c4f80b`）：
- **修复两个真实多 Agent / 网关生产缺陷**：
  1. `LlmGatewayChatModel.buildGatewayPayload`：修复 `withStructuredOutput` 传入纯对象 `{ role: 'system' | 'user' | 'assistant', content }` 时因缺少 `getType()`/`_getType()` 而静默降级为 `role: 'user'` 的缺陷，已回退读取 `m.role` 并补单测（`llm-gateway-chat-model.usage.spec.ts`）。
  2. `LlmGatewayService.recordProviderFailure`：收紧熔断器语义，`400/422` 请求侧参数/契约校验错误不再触发进程级熔断，避免单个非法请求把整条 Provider 通道打挂，已补单测（`llm.gateway.circuit.spec.ts`）。
  3. `MultiAgentService.stream`：将 `STREAM_WHITELIST` 从 `['reviewer', 'respond_directly', 'executor']` 收敛为 `['reviewer', 'respond_directly']`，消除 `executor` 中间步骤输出与 `reviewer` 终态回复重复拼接泄漏到候选人气泡的缺陷。
- **P1 服务端幂等与测试/E2E 治理**：
  - `InterviewLifecycleController.startInterview`（`POST /api/interview/start`）新增租户+用户隔离的 `Idempotency-Key` 原子防重、并发 `409` 拦截与结果回放（含单测 `interview-lifecycle.start.spec.ts`）。
  - `LangfuseService` 改为延迟加载 SDK，修复全量 Jest 崩溃；对齐 `llm-gateway.fallback.spec.ts` DeepSeek 主备配额用例。
  - 全部隔离 Playwright E2E（Lab MCP/Builder/Catalog/DataGovernance/SessionRevocation、Auth Email、Web `ia_auth_session_v1`、ResumesPage 核对流程、Golden Loop）与 `fixture-policy-browser.cjs` 统一账本计量断言已对齐新版 UI 与全量 Embedding 计量。
  - `examples/portfolio-site/src/articles.json` 完成 16 篇薄弱工程文章深度重写，Node 22 构建与 36/36 单测通过，并已按 `publish.sh` 安全发布至本机 `127.0.0.1:8787`。
- **本轮实际验证（2026-11-24，Node 20.20.2 + 隔离 Docker）**：
  - `pnpm lint --max-warnings 0`、三端 `typecheck` 通过；5 个核心 Jest 套件 40/40 通过（前序全量 API Jest 124 套件/1338 用例、Web+Lab Vitest 48 文件/472 用例、PG 迁移恢复 42/42 用例通过）。
  - 隔离 Docker 全量验证（`scripts/ci/verify-built-api.sh`，内部网络阻断外网 Provider，无 `.env`）：Built API smoke **136/136**、`verify-question-presentation-store` **45/45**、`verify-golden-interview.mjs`（DeepSeek `127.0.0.1:1` 熔断自动回退千问）、`lab-isolated-acceptance.mjs`、`auth-email-runtime.mjs`、`interview-policy-admission.mjs`（含 20 项 Web 策略/上传/超时/恢复子套件）、`golden-interview-loop.mjs`、Redis 故障恢复（`readiness 503/liveness 200` + `25/25` 并发就绪）、PostgreSQL dump/restore 等价性（13+1）与 Milvus/etcd/Qdrant 离线备份恢复演练 **全部 PASS**。
  - **边界声明**：以上均为本地隔离合成 Provider/SMTP 验收，**整包产品仍保持 NOT_ACCEPTED / 未商用交付**；真实 Provider 质量/费用账单核对、真机设备与公网 HTTPS 生产部署仍为待办。

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
