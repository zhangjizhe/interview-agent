# Superseded authentication evidence

These dated snapshots preserve failures and partial results. Current gates are in the active context and auth evidence. They do not describe the final candidate.

# Current state

Current scoped revision1c6fa3891aec3b19df286579d85a1ad1419140bb is pushed and read back as PR65 head. Exact push41850620405 / PR41850628688 completed successfully in all6 jobs. Both original Docker and lint/type/test logs were reviewed: API1232 passed/22 skipped, Web339, HTTP136, native helper contract, complete synthetic auth/browser chain and strict PostgreSQL schema/row/sequence + Milvus/Qdrant restore. These are engineering gates, not complete real-mail or whole-product acceptance. Main remains f0c17cf and PR stays draft. Recent auth-only archives and consolidated working context are LOCAL uncommitted memory; do not stage suspended portfolio tails or private files. The next real mailbox plan is prepared only, at most2 emails after natural quota reset, corrected DNS in staging too, and API-restart persistence assertion; no scheduled or automatic mail run was started.


Auth harness follow-up (2026-11-04): exact00dddd0 PR41843410434 passed all3 jobs, but push41843400029 timed out/cancelled in the auth-browser stage and its summary failed. Original logs stop after Lab acceptance and before auth-runtime completion; this is not all-green evidence. No merge.

Source review found an unbounded captured-login-response promise. A standalone real-browser synthetic helper contract reproduced a registration-to-login transition clearing a prefilled password, so native validation prevented any POST (red exit1). The helper now waits for the visible login form before filling, and bounds capture/click/HTTP response waits. Contract green verifies both successful transition and bounded missing-POST failure. This proves the helper defect, not the exact unobserved CI browser state. Fixed stage labels improve diagnosis. The contract is part of the normal isolated runner; test scope, auth limiter, TLS and all response/revocation assertions remain intact.

Local focused Chrome + real isolated API/PG/Redis/TLS synthetic mail passed again with the new helper and registration/password-login/change/email-reset/revocation/replay plus greeting fallback. Product code and images were unchanged, so passed type/lint/build checks were not repeated without cause. JS/shell syntax and diff passed. New candidate exact push/PR CI must be inspected; full real mailbox journey and whole product remain NOT_ACCEPTED. No real mail or model calls were requested by this harness work.


2026-11-04 · Sole task AUTH-EMAIL-VERIFICATION; complete real user journey remains **NOT_ACCEPTED**. Latest scoped code00dddd06ba0d537fff2cd891d2ffb220adbec545 is pushed to origin/agent-lab and read back as PR65 head; PR stays draft and main is not merged. Exact push41843400029 / PR41843410434 are in progress. Predecessor1d28cfe CI was cancelled, b6c9a64 CI failed at actual fixture429; neither is a pass for this head.

Source verified: registration requires mailbox OTP; verified users log in with username/password without SMTP. Forgot-password accepts email in Web and Lab, with legacy userId API compatibility. Codes bind purpose/user/verified email and expire in10minutes; change/reset revoke sessions. Recovery429 now propagates rather than returning an unusable decoy. Unknown emails receive the same address admission with suppressed delivery and no usable challenge, preserving existence privacy.

Actual engineering evidence: API46 tests in4 suites, Web5, API/Web/Lab types, relevant lint, frozen builds and syntax/diff checks. The previous email-input revision passed real isolated API/PG/Redis/TLS synthetic browser registration, password login, reset/revocation/replay and TLS-greeting fallback. Latest quota revision passed real original-API HTTP429 for the exhausted address, unknown-email200 then cooldown429, with zero mail sent. Original local Web/Lab password login and email form passed. These scopes do not establish real-mail registration completion or whole-product quality.

Real mail: one normal original-account recovery succeeded, including exact challenge mail, old-access revocation and new-password login in both entries; it used the earlier username-request UI. An isolated full real-mail registration later failed CONNECT_TIMEOUT before account creation. Default DNS address then failed12s TLS while independent resolver addresses passed the original-hostname certificate/greeting in139/243ms. Only the private API container DNS changed; no fixed SMTP IP or weakened TLS. Actual API SMTP auth then passed356ms without sending.

User now confirms the same bound NetEase mailbox but sees only old mail. Read-only IMAP headers confirm latest reset mail sent17:59:04/received17:59:05 China time, INBOX, correct recipient, and no newer application mail. Its code was valid at the earlier18:xx check but is expired now; current live challenges0. Original persistent counter20/20, naturally expires at2026-11-05 08:00 China time. Tests consumed most attempts; all real failures remain counted and only one unused second-test reservation was reconciled. **No more live sends, limit increases, counter resets or OTP bypass to manufacture acceptance.** After natural reset, verify only missing cases with a bounded plan.

Credentials/private logs stay outside Git in local encrypted storage and runtime memory. Any user-chosen password reset can invalidate generated-password helpers; do not overwrite the user's choice or replay old scripts. Both product entries share identity; no additional administrator account is required. No external model evaluation was requested. Suspended website/report work remains unaccepted and must stay outside auth commits.

Next: finish latest exact push/PR CI and original-log review; retain draft while real registration and user-assisted email-input recovery remain unmet. The user has only NetEase and currently cannot switch networks. Preserve original volumes and backups. Historical auth evidence is retained in the scoped archive; unrelated suspended tails below are unchanged.

Additional older records remain in Git history; this is a superseded snapshot.


## Earlier committed snapshots

# Current state

Auth harness follow-up (2026-11-04): exact00dddd0 PR41843410434 passed all3 jobs, but push41843400029 timed out/cancelled in the auth-browser stage and its summary failed. Original logs stop after Lab acceptance and before auth-runtime completion; this is not all-green evidence. No merge.

Source review found an unbounded captured-login-response promise. A standalone real-browser synthetic helper contract reproduced a registration-to-login transition clearing a prefilled password, so native validation prevented any POST (red exit1). The helper now waits for the visible login form before filling, and bounds capture/click/HTTP response waits. Contract green verifies both successful transition and bounded missing-POST failure. This proves the helper defect, not the exact unobserved CI browser state. Fixed stage labels improve diagnosis. The contract is part of the normal isolated runner; test scope, auth limiter, TLS and all response/revocation assertions remain intact.

Local focused Chrome + real isolated API/PG/Redis/TLS synthetic mail passed again with the new helper and registration/password-login/change/email-reset/revocation/replay plus greeting fallback. Product code and images were unchanged, so passed type/lint/build checks were not repeated without cause. JS/shell syntax and diff passed. New candidate exact push/PR CI must be inspected; full real mailbox journey and whole product remain NOT_ACCEPTED. No real mail or model calls were requested by this harness work.

## Earlier snapshot

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
