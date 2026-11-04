# Thread handoff

2026-11-04 latest AUTH-EMAIL-VERIFICATION: user requires the complete registration-code -> password-login -> email-code recovery -> new-password-login journey. Added email input to both recovery pages and email lookup to reset request/completion; legacy userId API callers remain compatible. Codes still bind verified email, purpose and user; unknown/unverified emails do not get reset codes or account existence disclosure.

Verified new scope: API auth/session/integration28, Web auth4, all three app types, relevant lint, three frozen-source Docker builds, syntax/diff; isolated real API/PG/Redis/TLS synthetic browser passed registration, password logins, email-input reset, revocation, replay/old-password denial and greeting fallback. Original local images updated; both password logins/profile/ADMIN and email-only recovery form passed without mail requests. Schema and volumes retained.

Real NetEase recovery succeeded once: exact challenge mail was received, normal reset completed, old access rejected, and new password logged into BOTH local entries. This was on the prior username-request form; the new email-input contract is only synthetic-tested so far. A separate isolated full real-mail journey then FAILED on its first registration send (CONNECT_TIMEOUT after bounded fallback); no account was created. Two sends were conservatively reserved in the original durable quota; only one send was attempted, and exactly the unused second reservation was reconciled with CAS. All real failures/cooldowns remain counted. No more live sends under unchanged conditions. Full real registration/recovery stability remains NOT_ACCEPTED; asked whether a backup SMTP sender exists, not for credentials.

Previous b6c9a64 push41806050891/PR41806057103 FAILED: full auth browser passed, later resume evidence hit actual429 after password login removed former mail cooldown. Fixture helper now waits61seconds and retries once only for an observed synthetic429; production limiter and final200 assertion stay intact. Do not reuse the earlier bf9cf6c green CI. New scoped commit/exact CI pending; PR65 stays draft and main unchanged. No whole-product, website/report or model-quality acceptance.

## Earlier snapshot (superseded by latest evidence)

2026-11-04 user correction: ordinary verified-account login now uses username/password directly, without SMTP or a new OTP. Registration, reset/change and first-time legacy claim retain mailbox verification. The previous every-login-code policy below is superseded. Registration checks username availability before mail; occupied IDs and mail503 never create accounts.

Actual new evidence: API auth/session/integration26 and Web auth4 pass; API/Web/Lab types, relevant lint, three frozen-source Docker images and syntax/diff checks pass. Isolated real API/PG/Redis/TLS synthetic browser passed registration, three password-only logins, change/reset/revocation/replay refusal and greeting-fault fallback. Original local Web AND Lab password login passed with ADMIN/profile readback and zero mail requests; occupied registration ID refused before mail. Local images updated, passwords/schema/volumes retained. Full real NetEase registration/recovery remains NOT_ACCEPTED. Previous bf9cf6c six green CI jobs do not certify this new diff; scoped new commit/CI next, PR65 stays draft and main unchanged. No unchanged-condition SMTP retry, OTP bypass or model-quality claim.

## Previous snapshot (login policy superseded above)

2026-11-04 · Active `AUTH-EMAIL-VERIFICATION`. Read [CURRENT_STATE.md](CURRENT_STATE.md) and [auth evidence](../acceptance/AUTH_EMAIL_VERIFICATION_EVIDENCE.md) for source, exact test scopes and all real-mail failures.

The follow-up adds safe bounded SMTP setup fallback, allowlisted diagnostics, validated default8/range1-20 daily attempts and mail-title cleanup. Local auth5 suites /45 tests (mail15 included), lint/typecheck/build and Chrome + real isolated TLS-fault/auth runtime passed. The fixture's first TLS greeting stalls; normal auth must then verify the original hostname certificate via resolved-IP fallback. Only mail-start fixture HTTP deadlines accommodate that fault; other business deadlines/assertions are retained. Exact predecessor CI51e795e/41772980806 passed three jobs; inspect the new PR65 head separately.

Original local production API/Web/Lab use auth images on loopback and retain their volumes. The real backup restored with matching user/Run/organization counts; only the pending auth migration ran. Existing-owner ADMIN restoration was explicitly approved and executed after real mailbox OTP, preserving identity/organization and revoking sessions. Both entries share that account; no extra identity or public recovery bypass was created.

SMTP/password secrets are encrypted in local Keychain; SMTP is injected via tmpfs/runtime memory, not an environment file, image or Docker Config.Env. Private restart helper/configuration/logs stay outside Git. The current private daily cap is20, counters were not reset and cooldown remains60 seconds. Never print credential-reader output or commit private support files.

**Real-mail gate remains NOT_ACCEPTED.** Original-owner Lab login/restart and earlier isolated NetEase registration/login/change passed, but candidate Web and full owner reset/final-login runs still failed with SMTP timeouts. Their cause is unknown; the user was asked to inspect NetEase security/client reminders. No unchanged-condition real replay. The original temporary Keychain credential is still active; generated reset credential is NOT yet applied. No external model call was initiated.

Next: finish exact-head CI/original-log readback for the scoped auth commit; keep PR draft and do not merge while real-mail acceptance remains unmet. Preserve portfolio/report WIP. After the owner confirms a meaningful provider/network change, inspect remaining daily quota before resuming only missing real cases. Whole-product/site/model/report acceptance remains NOT_ACCEPTED.

## Retained prior handoff (historical)

2026-11-03. Active PORTFOLIO-ASSISTANT, not production accepted. Read ACTIVE_TASK/CURRENT_STATE and docs/runbook/PORTFOLIO_ASSISTANT.md.

Repository agent-lab remote baseline5403d81 includes preserved concurrent Wiki commit. Old original dirty checkout stays untouched. PR64 remains open. Source51d5c2b exact runs41561888453/41561883261 six jobs succeeded; original Docker logs reviewed (HTTP126, catalog/business browser, strict recovery), not deployment/semantic claims.

Portfolio local code: fixed32 public fragments including full eleven historical articles16212 characters; published-selector-only Lab queue; atomic Redis admission/24h owner+UUID dedupe; signed sanitized polling; API/proxy ticket redaction; portable widget plus actual resume site's BFF, mirrored under examples/portfolio-site without identity or secrets. A missing desktop project is not represented as read. Site original has local source commitaf7f110; generated outputs may need an ordinary build commit. Do not publish the original Site or change its audience while the backend is unconfigured.

Actual local API1199/27skip, controlled Web333, portable site27, types/lint pass. Initial parallel Web32 failures retained, unchanged controlled run passed. All three product builds also passed; latest exact-head CI still to verify. No Docker/Redis/actual provider locally. Exact-head public HTTP helper seeds a PUBLISHED fixture and explicitly does not prove normal production release approval.

Next owner: commit/upload tested full tree without overwriting remote Wiki, run latest exact push/PR CI, inspect logs, fix failures, merge only expected head; verify main/agent-lab. Do not claim model semantic correctness, actual production activation, human calibration or zero billing.

Portfolio source97af5cb exact push/PR runs41574233488/41574228681 passed all six jobs. Root reviewed original logs: HTTP137/137 including public refusal/no provider, real Redis admission/deduplication, normal Lab queue, one actual synthetic model call, sanitized final sources and tamper refusal; strict recovery passed. Real Redis tests passed in CI. A subsequent browser preflight found unavailable WebCrypto on nonsecure preview origins; client now refuses before admission with an actionable HTTPS/localhost message, with27 portable tests passing. The follow-up client commit still needs its own latest exact CI.
