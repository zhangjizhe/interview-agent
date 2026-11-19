# Web session/cache isolation candidate

2026-11-18 · agent-lab · base7405555946f2f68c921915a8fee03184e702f04b + uncommitted working tree. **Candidate-only, not deployed, not whole-product acceptance.** Commercial gate: COMMERCIAL_PRODUCT_DESIGN_GATE.md.

## Source finding and repair

The earlier Web root owned a single QueryClient with30-second freshness. AuthGate removed protected children on expiry but kept that cache. An isolated two-account UI reproduction showed account A's cached job after password login as B. This was a synthetic reproduction, not a live disclosure of real account data. All six original regression cases failed before repair; they were not relaxed to manufacture a pass.

- `main.tsx` no longer owns a global private cache. `AuthenticatedWorkspace` owns a new QueryClient for each AuthGate session epoch. Genuine detach clears it; a microtask guards against clearing the same cache during React18 StrictMode effect replay. Late old reads retain the detached client and cannot populate the new workspace's client in tested cases.
- `App.tsx/AuthGate` responds to local session changes, expiry and cross-tab storage publication. It remounts private state and clears password/new-password/code/challenge state. Existing registration, password login and mailbox recovery remain the same backend flow.
- `utils/auth.ts` publishes the complete Web session in one `ia_auth_session_v1` JSON write, with a new revision for notifications. A preliminary four-field/last-marker approach was rejected during review because concurrent writers could still mix fields. Final reads use the single record, validate it, and fail closed for malformed records or signed-out tombstones. Legacy credentials are read only before the first snapshot; login/logout clean legacy fields. Transport and legacy Web user labels/logout use the same accessor. Agent Lab's separate-origin storage protocol is unchanged; this is not SSO.
- Logout still asks the existing server to revoke the session; failed revocation stays retryable. Existing token comparisons protect a newer session from tested late401/logout responses. No new server authorization, encryption-at-rest or cross-origin credential-sharing claim.

## Actual verification

Final isolated tests: **75/75 pass**, nine files: auth17, session/cache7, email-flow6, preparation13, journey9, workflow5, training reads13, shell1, legacy Web Lab page4. Auth snapshot assertions preserve legacy compatibility, one complete write, an interleaved second writer, logout legacy-cleanup interleaving, malformed/tombstone refusal, old401/logout comparison and same-origin-only token attachment. UI tests cover expiry→B login with and without StrictMode, late A reads, same-account new token, cross-tab login/logout and removal of retained plaintext password.

TypeScript and targeted ESLint actually ran for `@interview-agent/web` and passed. An initial command used a nonmatching package filter and performed no check; that output was discarded and the correct package was executed. Final Web Docker production build passed. Candidate image manifest: `sha256:34555541132b409561295b6997f7eb742f05b420274eb1e812d7f0a8b390b885`. This image includes earlier uncommitted Web work; there is no reviewed release SHA yet.

Final-image browser check used a loopback-only isolated HTTP service, synthetic accounts and normal password forms. A second tab initially read A's job. Normal logout in the first tab closed protected content in the second; password login as B updated the second tab to B's job with zero A-title matches. The service accepted no real mutations/model calls. Synthetic storage was cleared, both temporary tabs closed and server stopped. This is an actual browser check of the production bundle against a synthetic API; it is not actual backend RBAC or provider-quality evidence.

An iOS17 iPhone SE simulator launched, but native automation timed out before navigating the page. No Safari/keyboard result was observed and none is counted as passed. The simulator was subsequently confirmed shut down. Physical Android/iPhone WeChat and mobile Chrome remain unverified.

## Architecture, security, cost and release boundary

No API/schema/database/volume/grant/SMTP/model configuration change. No provider call, report generation, paid retry or user upload was made by this phase. Provider quality/evaluation is not applicable to this client-lifetime regression; the whole product's real quality gate remains open.

Credentials remain in the existing browser-local persistence security model; moving to one record is consistency, not an XSS defense or encryption feature. Backend ownership must continue to authorize every request. Mixed old/new Web bundles across tabs and rollback need an explicit refresh/relogin step during eventual release; old bundles cannot consume the new snapshot. No compatibility certificate for an old bundle kept open indefinitely. Storage-denial/private-mode behavior and a complete real two-user server acceptance remain separate checks.

Live5173 was not replaced and remains the prior local build95fbbf3f… with its rollback container. No commit/push/merge or fresh remoteCI result. Real golden journey, full visual/state inventory, accessibility/engines/physical devices, historical-data provenance, mutation idempotency, model/report quality, current CI and target HTTPS/recovery remain release blockers. Do not deliver this candidate as commercially accepted.
