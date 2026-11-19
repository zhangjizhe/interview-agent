# Current state

2026-11-19费用只读核对：用户报告千问额度消耗9元，尚未与供应商账单对上。Nov18本机有1条网站助手Qwen Plus完成记录，估算0.0010108CNY；另1条LLM准入记录缺费用证据。运行中简历向量服务存在绕过统一账本的直接embedding路径；未知不记零，不能据此归因9元。私有账本只更新到Nov16。详见[费用核对](../acceptance/COST_RECONCILIATION_2026-11-18.md)，用户已确认百炼/DashScope API消费账单；待补模型/金额及统计时段。本次未调用模型或修改服务。

2026-11-19: preparation workflow checkpoint completed locally; **whole product NOT_ACCEPTED / not delivered**. User requires product, design and supported-device acceptance before delivery. Binding criteria: [commercial gate](../acceptance/COMMERCIAL_PRODUCT_DESIGN_GATE.md).

Jobs now validate save/activation receipts, lock ambiguous writes across remount, allow read-only reconciliation inside the editor, retain drafts and restore keyboard focus. Resume feedback is adjacent and state-specific, pending job reference reads block submission, malformed summary rows fail as reads, storage-quota preflight does not send/freeze uploads. Preparation metadata, focus and tablet/landscape controls refined. Final45 related tests, types/lint/Docker/diff passed;27 bounded viewport probes plus final recovery portrait/landscape and synthetic browser flows verified. [Evidence, exact versions and limitations](../acceptance/PREPARATION_PRODUCT_DESIGN_ACCEPTANCE.md). No real model/RAG/persistence or physical-device pass claimed.

## Deployment / release boundary

Branch agent-lab, base7405555946f2f68c921915a8fee03184e702f04b + large earlier uncommitted API/Lab/Web/site WIP. No commit/push/merge. Candidate manifest11ae77053423… only isolated verification. Live5173 remains prior95fbbf3f… and rollback interview-web-rollback-journey-nov18; backend/data volumes/grants/secrets unchanged.

Last recorded CI43812962156 failed dependency security audit; remote status not refreshed. Current exact-source CI, reviewed scope and release/recovery remain mandatory. The earlier75-test Web session/cache/snapshot candidate remains undeployed; see SESSION_CACHE_ISOLATION.md.

## Remaining scope

Real preparation→interview→persisted report/evidence→training/retest, model quality and cost receipts; whole-site design/accessibility/state review, supported engines and actual iPhone/Android WeChat/mobile Chrome; server mutation idempotency, provenance and full resume/file-URL knowledge; target HTTPS/backup/recovery and CI all remain open. No provider/email or real user upload this phase. Fixture origins/tabs/servers and temporary viewport override were cleaned up.

Earlier normal-session observation of a saved resume/missing job was not re-read here; historical9 other-scoped rows were not reassigned. Topic routing: CONTEXT_INDEX.md; prioritized work: TASKS.md. Previous context archived in archive/context-before-preparation-acceptance-2026-11-19/.
