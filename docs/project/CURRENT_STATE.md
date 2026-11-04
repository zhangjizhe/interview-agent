# Current state

2026-11-04 follow-up: after local API DNS correction, the user's current password-reset email was verified in the actual NetEase inbox by exact live challenge. At the read-only check it had369 seconds remaining and0 attempts; no code was displayed or consumed. The user reported a timeout, and the exact visible stage remains awaiting clarification. Do not label this particular delivery as missing or the code as expired without new evidence.

Found/fixed a separate real UX defect: requestPasswordReset swallowed email429 and returned a dummy challenge, advancing the UI despite quota rejection. Recovery now propagates429. Unknown/unverified email requests undergo identical address admission with suppressed delivery and no stored usable code, preserving the account-existence boundary. API46 tests in4 suites, Web5, API types/lint and frozen API build pass. Actual local HTTP: exhausted original address429; unknown first request200, second cooldown429; zero real mail sent. API-only deployment retained volumes, current challenges and scoped DNS.

Today's configured local20-send quota is now exhausted after the user's final request; no failures were removed and the single unused test reservation alone was reconciled earlier. Stop real sends and do not change the quota to manufacture acceptance. Latest real complete isolated registration journey still failed before DNS correction; user-assisted email recovery completion and exact new CI remain required. Main is not merged, no full auth/product pass.

## Earlier snapshot

2026-11-04 latest AUTH-EMAIL-VERIFICATION: user requires the complete registration-code -> password-login -> email-code recovery -> new-password-login journey. Added email input to both recovery pages and email lookup to reset request/completion; legacy userId API callers remain compatible. Codes still bind verified email, purpose and user; unknown/unverified emails do not get reset codes or account existence disclosure.

Verified new scope: API auth/session/integration28, Web auth4, all three app types, relevant lint, three frozen-source Docker builds, syntax/diff; isolated real API/PG/Redis/TLS synthetic browser passed registration, password logins, email-input reset, revocation, replay/old-password denial and greeting fallback. Original local images updated; both password logins/profile/ADMIN and email-only recovery form passed without mail requests. Schema and volumes retained.

Real NetEase recovery succeeded once: exact challenge mail was received, normal reset completed, old access rejected, and new password logged into BOTH local entries. This was on the prior username-request form; the new email-input contract is only synthetic-tested so far. A separate isolated full real-mail journey then FAILED on its first registration send (CONNECT_TIMEOUT after bounded fallback); no account was created. Two sends were conservatively reserved in the original durable quota; only one send was attempted, and exactly the unused second reservation was reconciled with CAS. All real failures/cooldowns remain counted. No more live sends under unchanged conditions. Full real registration/recovery stability remains NOT_ACCEPTED; asked whether a backup SMTP sender exists, not for credentials.

Previous b6c9a64 push41806050891/PR41806057103 FAILED: full auth browser passed, later resume evidence hit actual429 after password login removed former mail cooldown. Fixture helper now waits61seconds and retries once only for an observed synthetic429; production limiter and final200 assertion stay intact. Do not reuse the earlier bf9cf6c green CI. New scoped commit/exact CI pending; PR65 stays draft and main unchanged. No whole-product, website/report or model-quality acceptance.

## Earlier snapshot (superseded by latest evidence)

2026-11-04 user correction: ordinary verified-account login now uses username/password directly, without SMTP or a new OTP. Registration, reset/change and first-time legacy claim retain mailbox verification. The previous every-login-code policy below is superseded. Registration checks username availability before mail; occupied IDs and mail503 never create accounts.

Actual new evidence: API auth/session/integration26 and Web auth4 pass; API/Web/Lab types, relevant lint, three frozen-source Docker images and syntax/diff checks pass. Isolated real API/PG/Redis/TLS synthetic browser passed registration, three password-only logins, change/reset/revocation/replay refusal and greeting-fault fallback. Original local Web AND Lab password login passed with ADMIN/profile readback and zero mail requests; occupied registration ID refused before mail. Local images updated, passwords/schema/volumes retained. Full real NetEase registration/recovery remains NOT_ACCEPTED. Previous bf9cf6c six green CI jobs do not certify this new diff; scoped new commit/CI next, PR65 stays draft and main unchanged. No unchanged-condition SMTP retry, OTP bypass or model-quality claim.

## Previous snapshot (login policy superseded above)

2026-11-04 · Active `AUTH-EMAIL-VERIFICATION`; whole product and portfolio integration remain **NOT_ACCEPTED**.

## Source and engineering evidence

Candidate Web and Agent Lab share the same NestJS Auth API/user table. Registration verifies email before creation; every password login needs a fresh code; change requires current password plus code; reset only targets a verified mailbox. Change/reset revoke sessions. The nullable `emailVerifiedAt` migration preflights email collisions and adds a lower-email unique index.

This follow-up keeps OTP/rate admission single-use and adds bounded pre-message SMTP fallback (one primary plus at most two fresh valid IPs, three-second DNS bound, original-hostname TLS validation). It never retries socket/upgrade or ambiguous delivery failures. Phase deadlines are15/10/20 seconds; diagnostics contain only allowlisted protocol metadata. Duplicate mail-subject wording is fixed. Daily attempts are configurable1-20, default8; the private local acceptance setting is20, with all existing counters retained and60-second cooldown unchanged.

Latest local evidence: focused auth5 suites /45 tests (mail15 included), relevant lint, no-incremental API typecheck, frozen-source API Docker build and shell/JS syntax checks passed. Chrome + real isolated API/DB/Redis/TLS synthetic mail passed registration, three logins, change/reset/revocation and replay/old-password refusal. The first TLS greeting was deliberately stalled; both the fault and original-hostname-verified fallback were asserted. This is synthetic engineering evidence.

Predecessor51e795ef7998d568e66fe8eac6ba0ea87c557c58 passed all three jobs in [41772980806](https://github.com/zhangjizhe/interview-agent/actions/runs/41772980806), with original Docker logs reviewed. Check this follow-up's exact PR65 head independently; predecessor CI is not transferable.

## Actual local deployment and remaining mail gate

Original API/Web/Lab were updated on loopback, existing volumes retained and the single pending auth migration applied. A fresh original-database backup was actually restored in an isolated PostgreSQL container; user, Run and organization counts matched (not a full real-data row/hash audit or RPO/RTO proof). The explicitly approved local ADMIN recovery used a real user/purpose/mailbox-bound OTP and compare-and-set, preserved identity/organization, and revoked sessions. There is no public recovery bypass.

SMTP authorization and generated account passwords are encrypted in macOS Keychain. No SMTP credential is in Git, the environment file, image or Docker Config.Env. A private host helper injects via tmpfs into runtime memory and handles restart; this depends on the local macOS user/Keychain. Private helpers/configuration/logs stay outside Git.

Real NetEase registration/login/change/revocation passed in an isolated auth-only environment; original-owner normal Lab login and restart/session readback also passed. **The complete real-mail flow, candidate Web login and original-owner self-service reset/final logins are still NOT_ACCEPTED.** Current implicit-TLS/STARTTLS attempts failed with connection, greeting, upgrade or socket timeouts, including after the engineering fix. Their external cause is not established. Temporary protocol observer and unsuccessful loopback relay were removed. The owner was asked to inspect NetEase client/security reminders; do not repeat failed live tests while conditions are unchanged.

The original owner still uses the encrypted temporary recovery credential. The separately generated reset credential has not been applied. No external model call was initiated by this auth work; no semantic quality or whole-product deployment claim is made. Keep portfolio/report WIP out of auth commits. Full source/failure/acceptance evidence: [AUTH_EMAIL_VERIFICATION_EVIDENCE.md](../acceptance/AUTH_EMAIL_VERIFICATION_EVIDENCE.md).

## Retained prior context (historical; does not describe this auth revision)

2026-11-03 · Active theme: PORTFOLIO-ASSISTANT. User authorized the actual local resume site and public articles/GitHub as data sources. Whole product/production remains **NOT_ACCEPTED**; no external paid model call or deployment has been performed.

## Current source and candidate

Remote agent-lab baseline is 5403d81448c768d670730003fe8ad6fce39aeb1d, preserving the concurrent Wiki-only commit on top of 51d5c2b. main remains deaf006; PR64 open. The portfolio increment below is not yet accepted by exact-head CI.

The question-catalog predecessor 51d5c2b passed both exact push/PR runs41561888453/41561883261 (six jobs). Root read both original Docker logs: HTTP126/126, actual catalog adoption/version/deletion, browser migration/rebuild/reload, BUSINESS_ASSERTIONS failure/publication refusal and strict PG/vector restore passed. PG tests22 passed. This is isolated synthetic engineering acceptance, not production migration or semantic quality. The old failure history remains in runbook/handoff.

Portfolio candidate: fixed public JSON32 fragments (11 public resume/project, 20 chunks covering 11 historical articles/16212 characters, one GitHub profile skill excerpt). No desktop hexo-bolg directory was visible; the actual local resume site's already-imported public articles were read. No private conversation or arbitrary tenant knowledge is included. Local site source is preserved as a portable example without Site identity or secrets.

Default-disabled public API binds a dedicated actual ADMIN owner and a normally PUBLISHED fixed single-agent version. It uses the existing durable Lab queue, tenant Gateway quota and actual Run usage. Input scope/privacy/common-injection screening precedes retrieval; model selects up to3 source IDs; the server displays only checked source excerpts and fixed links. This is bounded lexical retrieval and verbatim evidence, not a calibrated semantic judge or unrestricted conversational assistant.

Redis atomic admission caps daily20/new-IP-minute3/active2; owner+UUID idempotency lasts24h across observed-IP changes. Origin is not authentication; proxy/NAT IPs can share rate limits. Unknown admissions fail closed and retain recovery evidence. Signed answer URLs are excluded from Web access logs and API error paths; other proxies must follow the runbook. Website Lab mode never silently falls back to direct provider mode.

## Actual local verification

API1199 passed/27 skipped (Redis and database unavailable locally); Web333 passed with controlled worker count; portable site27 passed; product typecheck/lint passed. All three product builds also passed; exact-head CI is the remaining engineering gate at this freeze. One earlier fully parallel Web run failed32 assertions under parallel execution; logs were inspected and the unchanged suite passed under controlled concurrency without removing assertions. No local Docker, Redis or real provider acceptance is claimed.

See [assistant contract](../runbook/PORTFOLIO_ASSISTANT.md), [catalog architecture](../architecture/INTERVIEW_QUESTION_CATALOG.md), [recording guide](../runbook/RECORDING_READINESS.md). Remaining: normal publication/configuration on the actual target, real bounded model quality/bill reconciliation, human scoring calibration, full B1–B6/product acceptance and production recovery. Historical external charges remain unreconciled.

Portfolio source97af5cb exact push/PR runs41574233488/41574228681 passed all six jobs. Root reviewed original logs: HTTP137/137 including public refusal/no provider, real Redis admission/deduplication, normal Lab queue, one actual synthetic model call, sanitized final sources and tamper refusal; strict recovery passed. Real Redis tests passed in CI. A subsequent browser preflight found unavailable WebCrypto on nonsecure preview origins; client now refuses before admission with an actionable HTTPS/localhost message, with27 portable tests passing. The follow-up client commit still needs its own latest exact CI.
