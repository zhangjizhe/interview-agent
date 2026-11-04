# Thread handoff

## Active goal — `AUTH-EMAIL-VERIFICATION`

Finish the standard mailbox-verification path for registration, every login, password changes and password recovery in both the candidate web app and Agent Lab. The auth candidate is prepared for GitHub review and remains **NOT_ACCEPTED** until runtime acceptance and corresponding CI pass.

Baseline is `agent-lab` at `f0c17cf3f8e894ba0acfe894e8e1568c9e612552`. Focused API auth verification passed 5 suites /35 tests; API emit compilation, Web and Agent Lab typechecks, 3 Web targeted test files /4 tests, touched TypeScript lint, Prisma schema validation and both front-end production bundles passed. The two Vite builds used temporary config/output under `/private/tmp` because direct builds cannot write their generated config beside repository files. The mocked auth browser script was updated and syntax-checked, but runtime acceptance did not start: the local server could not bind a loopback socket and installed Chrome Canary exited with `SIGABRT` before page creation. Local Docker access fails with permission denied; live SMTP credentials are absent. No live mailbox, production DB, migration execution, paid model, or deployment was used.

Read current code in `apps/api/src/modules/auth/auth-email.service.ts`, `auth.service.ts`, `auth.controller.ts`, `auth-session.service.ts`, `jwt-auth.guard.ts`; `apps/api/prisma/schema.prisma` plus `20261104000000_auth_email_verification`; `apps/web/src/App.tsx`, `SettingsPage.tsx`, `utils/auth.ts`; `apps/agent-lab/src/main.tsx`, `AccountSecurityDialog.tsx`. SMTP/test changes also affect `scripts/ci/verify-built-api.sh`, `scripts/ci/fixture-auth-*`, and existing API/browser verification scripts. Run `git diff --check` and inspect the complete diff before any commit.

Legacy security boundary: existing accounts have no verified mailbox after this nullable migration. Users who know their current password can claim and verify an address; without that password, no safe self-service recovery exists. Do not restore a route that sends a code to a user-chosen address without proving the current password. Migration preflights case-insensitive duplicate addresses and fails before schema mutation if it finds any; deployment must resolve such conflicts after backup. Document and preserve this deployment/support gap.

Next: inspect the final diff, rerun `git diff --check`, and preserve the distinction between source review and actual acceptance. Docker API/DB/SMTP/browser tests must run in exact-head CI; local Docker cannot execute them. GitHub synchronization is authorized by the user; inspect CI for the pushed auth commit and do not represent pending CI as passing. A live acceptance separately requires an owner-controlled mailbox and configured TLS SMTP. Keep the unrelated suspended portfolio-assistant WIP; do not include it in an auth-only commit.

## Retained prior handoff (historical)

2026-11-03. Active PORTFOLIO-ASSISTANT, not production accepted. Read ACTIVE_TASK/CURRENT_STATE and docs/runbook/PORTFOLIO_ASSISTANT.md.

Repository agent-lab remote baseline5403d81 includes preserved concurrent Wiki commit. Old original dirty checkout stays untouched. PR64 remains open. Source51d5c2b exact runs41561888453/41561883261 six jobs succeeded; original Docker logs reviewed (HTTP126, catalog/business browser, strict recovery), not deployment/semantic claims.

Portfolio local code: fixed32 public fragments including full eleven historical articles16212 characters; published-selector-only Lab queue; atomic Redis admission/24h owner+UUID dedupe; signed sanitized polling; API/proxy ticket redaction; portable widget plus actual resume site's BFF, mirrored under examples/portfolio-site without identity or secrets. A missing desktop project is not represented as read. Site original has local source commitaf7f110; generated outputs may need an ordinary build commit. Do not publish the original Site or change its audience while the backend is unconfigured.

Actual local API1199/27skip, controlled Web333, portable site27, types/lint pass. Initial parallel Web32 failures retained, unchanged controlled run passed. All three product builds also passed; latest exact-head CI still to verify. No Docker/Redis/actual provider locally. Exact-head public HTTP helper seeds a PUBLISHED fixture and explicitly does not prove normal production release approval.

Next owner: commit/upload tested full tree without overwriting remote Wiki, run latest exact push/PR CI, inspect logs, fix failures, merge only expected head; verify main/agent-lab. Do not claim model semantic correctness, actual production activation, human calibration or zero billing.

Portfolio source97af5cb exact push/PR runs41574233488/41574228681 passed all six jobs. Root reviewed original logs: HTTP137/137 including public refusal/no provider, real Redis admission/deduplication, normal Lab queue, one actual synthetic model call, sanitized final sources and tamper refusal; strict recovery passed. Real Redis tests passed in CI. A subsequent browser preflight found unavailable WebCrypto on nonsecure preview origins; client now refuses before admission with an actionable HTTPS/localhost message, with27 portable tests passing. The follow-up client commit still needs its own latest exact CI.
