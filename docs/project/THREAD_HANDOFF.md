# Thread handoff

2026-11-24（分支 `agent-lab`）：已完成 Phase B 主干合入（PR #81 远端 CI 5/5 全绿合入 `main` `3c4f80b`，本机容器无损升级且 `interview-postgres` 迁移同步在 `20261105000000_lab_data_governance`）以及 Phase A 全部工程实现（`AGENT_ENGINE=fast-dual` 低延迟双轨引擎、`POST /api/agent-lab/runs/:runId/promote-to-dataset` + `RunInspector` 脱敏转入回归集、`ReleaseWorkspace` 历史已发布版本二次确认秒级回滚）。本轮全量验证通过：`pnpm lint --max-warnings 0`、三端 `typecheck` / `build`、API Jest **124/1341** + `cache.spec.ts` **22/22**、Web/Lab Vitest **49/474**。待用户确认 DeepSeek/千问额度与 CNY 预算上限后执行真实 `v1` vs `v2` Benchmark；接下来进入 Phase C（剩余 P1 幂等加固 + 消费端 👍/👎 反馈回流 Lab 队列 + Lab 飞轮总览）。**整包产品仍保持 NOT_ACCEPTED**。

2026-11-24（分支 `feat/security-circuit-breaker-95`）：已完成多 Agent 网关缺陷修复（`LlmGatewayChatModel` 保留纯对象 `role`、`LlmGatewayService` 400/422 不触发全局熔断、`MultiAgentService` 移除 `executor` 流式白名单防重复拼接）、`POST /api/interview/start` 租户隔离 `Idempotency-Key` 幂等加固、个人站 16 篇薄弱工程文章深度重写并发布至本机 `127.0.0.1:8787`，以及隔离 Docker + Playwright + 备份恢复演练全绿（Built API 136/136、presentation-store 45/45、golden API/browser、Lab/Auth/Policy 全部子套件、Redis 容错与 PG/Milvus/Qdrant 恢复）。**整包产品仍保持 NOT_ACCEPTED**（真实 Provider 评测、真机设备与公网部署待办）。

2026-11-19新增费用问题：只读核对用户报告的昨日9元，仍UNRECONCILED。Nov18有1条portfolio-evidence-guide/qwen-plus完成记录，估算0.0010108CNY；另1条LLM_CALL准入缺费用证据，不能等同已计费调用。私有账本Nov16后未更新，4项历史未知保留。当前源码及运行编译件均确认简历embedding直接调用text-embedding-v3，绕过统一账本；这不是9元归因证据。用户已确认百炼/DashScope API消费账单，已追问模型/金额/日期；无新模型调用/重跑/重启。见../acceptance/COST_RECONCILIATION_2026-11-18.md；先回答/对账，不自动扩大为实现任务。

2026-11-19: preparation workflow checkpoint completed locally. Whole product NOT_ACCEPTED; user requires product/design/device acceptance before delivery. Main evidence: ../acceptance/PREPARATION_PRODUCT_DESIGN_ACCEPTANCE.md. Commercial gate remains binding.

## Resume precisely

- agent-lab base7405555946f2f68c921915a8fee03184e702f04b + extensive prior WIP. Never stage all, credentials, private receipts or machine paths. No commit/push/merge.
- Final preparation candidate11ae77053423668cd2541aa24dd9496e948212c18e209add1121318f6b401b27 only isolated. Live5173 still95fbbf3f… with interview-web-rollback-journey-nov18. No backend/volume/permission/secret change.
- Source: JobsPage validates returned job identity/state and scopes ambiguous-operation markers to account.20-second wait is not server cancellation; refresh only reads. GET+ack unlock; modal can show returned records without discarding draft. Valid receipt updates cache immediately then background verifies; save/activate/recovery focus fixed.
- ResumesPage validates rows, waits for job reference before upload, distinguishes file/pending/unknown text, adjacent focusable feedback, read+ack recovery, and handles marker-quota failure before POST. Existing upload/parse/storage/model contract remains unchanged and unaccepted for real quality. WorkflowDialog includes textarea/summary/focusables; preparation styles refine readability and tablet/landscape controls.
- Red: nine original defect cases failed. Browser found save-focus loss; filtered negative regression failed, then repaired. Final45/45 across five files, correct-package types/lint/build/diff passed. Tests preserve receipt/no-repeat/persistence assertions; asynchronous waits now follow actual query notifications.
- Browser normal flows and27 layout probes used bundlead593a819…; final bundle adds quota preflight and in-modal recovery list, verified by final tests/build and final-bundle recovery portrait/landscape. Do not claim all old probes freshly rerun on the final hash. Final mobile proof is from final bundle.
- All browser data/API responses/file uploads were synthetic on loopback5191. No real NestJS/model/PG/Milvus/provider test. Final recovery service counter1 write/0 uploads/2 reads. Both servers stopped; synthetic storage cleared, tabs closed, viewport reset. Normal user sessions/data untouched.
- Previous session-cache snapshot candidate still undeployed (SESSION_CACHE_ISOLATION.md). Real two-user/server/mixed-version acceptance remains open. Browser credentials remain existing local persistence, not encrypted by the snapshot change.
- Physical devices/native keyboards, other engines/full accessibility, whole-site design, actual golden journey/report quality, server idempotency/history/full resume-RAG and release/recovery remain open in TASKS.md. Earlier simulator timeout is not new device evidence; do not replay unchanged failed tests blindly.
- Latest remoteCI not refreshed; last recorded security audit failure still unresolved. New source has no exact greenCI/reviewed release SHA. This is a verification checkpoint, not GitHub or product delivery. Wait for user's continuation before the next phase.

Earlier context archived in archive/context-before-preparation-acceptance-2026-11-19/; preserve its limits when using historical results.
