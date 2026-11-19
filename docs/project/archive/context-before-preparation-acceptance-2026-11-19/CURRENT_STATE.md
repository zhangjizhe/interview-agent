# Current state

2026-11-18: user requires product, design and supported-device acceptance before delivery. **Whole product NOT_ACCEPTED.** The binding release criteria are [commercial gate](../acceptance/COMMERCIAL_PRODUCT_DESIGN_GATE.md); builds, screenshots and fixture results cannot waive missing real journeys or devices.

Current focused repair is a Web session/cache isolation candidate. The original synthetic regression reproduced old-account cached jobs after expiry and another password login. Final candidate gives each authenticated workspace a new QueryClient, clears sensitive form state, synchronizes tabs, and publishes complete Web sessions atomically. Final75 related tests, typecheck, targeted lint, Docker build and isolated double-tab browser check passed. See [evidence and limitations](../acceptance/SESSION_CACHE_ISOLATION.md). This is not real backend/model acceptance.

## Deployment / release boundary

Branch agent-lab, base7405555946f2f68c921915a8fee03184e702f04b plus large earlier uncommitted API/Lab/Web/site WIP. No commit/push/merge. Candidate manifest34555541132b… was exported only for isolated verification. Live5173 remains prior local Web image95fbbf3f… and rollback interview-web-rollback-journey-nov18; no new deployment, data-volume, backend, grant or secret change.

Last recorded CI43812962156 failed dependency security audit; remote status not refreshed this phase. Latest exact-source CI, reviewed scope and release/recovery gates remain mandatory.

## Evidence / unresolved scope

- Earlier candidate UX and capability inventory: INTERVIEW_UX_PRODUCT_AUDIT.md. Previous normal-session read saw a saved resume and missing job; not newly re-read this phase. Historical9 other-scoped rows were not reassigned.
- Whole real preparation→interview→persisted report/evidence→training/retest, grounded model quality and paid-cost receipts remain missing.
- Full visual/state inventory, accessibility, desktop engines and physical Android/iPhone WeChat/mobile Chrome remain pending. iOS simulator automation timed out before page navigation; it is not a device pass. Temporary simulator and isolated browser server/tabs were cleaned up.
- Server mutation idempotency/transactional cleanup, historical data, full resume archive and candidate file/URL knowledge contracts remain open in TASKS.md.
- Earlier Lab, portfolio SSE/persona and server/domain evidence remains separately scoped in CONTEXT_INDEX.md. No new model/email/upload call this phase.

Prior current context is archived in archive/context-before-commercial-gate-2026-11-18/. All previous local repairs are provisional under the stricter user gate.
