# Email verification acceptance evidence

2026-11-04. Product source: `c3df71c4a88644e38544c0556cf7c5d14a1e706c` plus the scoped dialog/acceptance corrections in this revision on `agent-lab`, PR #65. Whole-product and deployment acceptance remain **NOT_ACCEPTED**.

## Source and focused verification

Registration consumes a mailbox challenge before creating an account. Each password login requires a new mailbox code before issuing a session. Password change requires the current password and a purpose-bound mailbox code; recovery only targets an already verified mailbox. Change/reset revoke sessions. The nullable migration leaves old users unverified and the JWT guard rejects their old tokens. A legacy owner must prove the current password before claiming an address. Forgotten passwords without an already verified mailbox still require a separately verified operator recovery process.

The scoped GitHub candidate was exported independently of the suspended portfolio/report edits. API auth tests passed 5 suites /35 tests; authentication UI tests passed 2 files /3 tests. Related lint/typechecks, API compilation and both frontend builds passed. No provider-quality evaluation is claimed.

## Runtime observations

- User authorized local Docker and mailbox access. Docker 29.5.3 is reachable with the approved execution permissions. Existing API, Web, Lab, PostgreSQL, Redis and Milvus services are running; they have not been replaced by this acceptance run.
- All three candidate Docker images built. The first API build failed on a Prisma download DNS error; one cache-preserving retry succeeded. No build logic or certificate check was weakened.
- The isolated Docker API suite passed **136/136** with PostgreSQL, Redis, Milvus, Qdrant and TLS synthetic SMTP. Strict PostgreSQL schema/row-multiset/sequence comparison and actual Milvus/Qdrant restoration passed. This is synthetic engineering evidence, not real mail delivery, model quality, a production bill or production RPO/RTO.
- The candidate page's real Chrome browser UI suite passed **7/7** with explicitly mocked API responses. It exercised registration code, creation, password login, login code, navigation and mobile login rendering. It is not HTTP/backend acceptance.
- A second run included the actual Docker API and browser. It reached the Lab business-assertion scenario, then failed because old logout/relogin assertions still looked for the previous login button. The script now uses the shared email-login flow at those entries; the resume-upload login is updated too. Synthetic-only repeated login waits for the real sending cooldown and permits one bounded retry on an observed 429. Server limits remain intact.
- The next full rerun reached the same completed business-assertion scenario but failed while reading a login response body after Lab's immediate reload. The helper now buffers the real forwarded response before releasing it to the page; it does not substitute an authentication result or remove server assertions.
- A focused auth browser run then found an actual product bug: the Lab password dialog used bare `fetch` and its code request returned 401 without a bearer token. Both change-password requests now reuse Lab's existing `api` transport. The regression checks bearer headers on both requests and retains the session after a retryable 503. The strengthened auth UI tests passed 2 files /3 tests, both frontend typechecks and the relevant lint passed, and the corrected Lab image built successfully.
- The corrected focused runtime run **passed with exit 0**: actual Chrome + Docker API + TLS synthetic SMTP completed email-verified registration, three code-verified logins, authenticated password change, password recovery from a separate signed-out device while the second session was active, access/refresh revocation, rejection of a reused reset code, and rejection of both old passwords. The isolated services were cleaned up. The general full browser suite and latest remote CI remain pending; this focused pass does not certify those broader gates.

## Original CI failure and correction

PR workflow `41767446161` passed lint/typecheck/tests, fresh/legacy PostgreSQL upgrade and product builds. Docker verification failed at `verify-external-run-init.cjs:32` with 401 instead of 201. The auth adaptation had logged out the owner token before later scenarios used it. The correction completes those scenarios first, performs a fresh code-verified second-device login, logs out that sibling and asserts that the original device remains active. No authentication assertion is removed. The corrected API suite passed locally; the next commit must run the corresponding complete CI.

## Live deployment boundary

The connected owner mailbox was found, but neither the project environment nor the running API had SMTP credentials. Private, git-ignored local TLS SMTP configuration and an independent OTP secret are prepared; the application password is still missing. The Gmail SMTP TLS handshake and certificate validation succeeded. This does not prove SMTP authentication or delivery; no real authentication email has been sent.

A private backup of the existing local PostgreSQL database was created, and `pg_restore --list` read it successfully. Read-only preflight found zero case-insensitive email conflict groups. The verification column does not yet exist in that database; no migration or account mutation was applied. Backup-list validation does not establish a successful restore of this real database.

The earlier Docker permission and browser-start failures were environment observations from unapproved execution, not evidence that Docker was absent. A Playwright-managed browser download was stopped after slow progress because the installed Chrome Canary was sufficient for the browser run.

Remaining gates: corrected full browser/recovery run, CI for the corrected commit, real SMTP delivery to the owner-controlled mailbox, target migration and live registration/repeated login/change/reset/revocation. Original unverified forgotten-password owner recovery requires an explicit trusted support procedure. Do not bind an arbitrary new mailbox through an unauthenticated recovery endpoint.

## Reproduction scopes

The default `verify-built-api.sh` scope still runs the full API, browser and recovery gate when its normal browser flags are supplied. It additionally runs `auth-email-runtime.mjs` using a separate allowlisted synthetic administrator: normal email-verified registration, three password/code logins, authenticated password change, reset from another signed-out device, revocation of access/refresh tokens, rejected reset replay and rejected old passwords.

`FIXTURE_BROWSER_SCOPE=auth FIXTURE_BROWSER_TEST=1` runs just the auth browser scenario on fresh isolated services. Its log explicitly excludes the general API smoke, other browser suites and recovery checks. `CHROME_PATH` optionally selects an installed Chromium executable; otherwise the normal Playwright-managed browser is used. None of these flags bypass product authentication or permit a live mailbox in the synthetic fixture.
