# Active task

2026-11-04 runtime follow-up: approved Docker access works. The isolated API suite passed 136/136 with strict PostgreSQL/vector recovery. Focused Chrome + real Docker API + TLS synthetic SMTP passed registration, three code logins, change/reset, active-session revocation and OTP replay rejection. The real Lab dialog missing-bearer 401 is fixed through the existing api transport; strengthened UI tests, types/lint and the rebuilt Lab image passed. PR65 initial Docker CI failed on the fixture logging out a token later reused; that fixture and stale auth browser steps are corrected. Complete CI for this revision remains pending. Live SMTP authentication/delivery still needs the private application password; original services/database are not migrated. See [auth evidence](../acceptance/AUTH_EMAIL_VERIFICATION_EVIDENCE.md).

2026-11-04 · `AUTH-EMAIL-VERIFICATION`: make verified email a standard part of registration, every login, password change, and password recovery in both the candidate web app and Agent Lab.

## Scope and safety

- Preserve the existing NestJS/Prisma/Redis/JWT architecture. Persist `emailVerifiedAt`; keep OTP material in Redis as an HMAC digest; bind each short-lived, one-use code to purpose, user/address where known; limit sends and guesses; send only over configured TLS SMTP.
- New registration verifies the email before account creation. Every password login of an already verified account sends a fresh OTP before issuing a session. Password change requires current password plus a code to the verified mailbox and revokes all sessions. Password recovery sends only to an already verified mailbox and also revokes sessions.
- Existing accounts created with synthetic `@local` addresses are unverified. A user who still knows the current password may claim and verify a real mailbox; this is not an email-based password recovery route. An owner who forgot the password and has no previously verified address cannot safely self-recover through a chosen mailbox; support/admin recovery remains an unresolved operational requirement.
- The Agent Lab deployment allowlist still controls ADMIN role. Registration or email possession does not grant administrator access. Protect requests made with pre-migration access tokens until the account completes email verification.
- Preserve the original database and volumes; real owner-mailbox acceptance is authorized once SMTP credentials are configured. Do not send real mail or call a paid model during synthetic tests; do not expose credentials or commit secrets. The older portfolio-assistant work is suspended and remains unaccepted, not deleted.

## Source and execution evidence

Baseline is `agent-lab` at `f0c17cf3f8e894ba0acfe894e8e1568c9e612552`; source changes are in the Auth API/module, Prisma migration/config, web and Agent Lab auth UI, fixture-only CI/E2E helpers, and focused tests. Relevant file paths and current verification/blockers are in `CURRENT_STATE.md` and `THREAD_HANDOFF.md`.

No real SMTP credentials are configured and no real email, live database migration, paid model call, deployment, or authenticated browser acceptance has occurred. Local Docker is now accessible using the user-authorized execution permissions. Synthetic fixture SMTP/DB CI scripts are source changes only until the exact CI head runs.

The current Web unit suite exercises registration-code request → code-gated account creation → password login → second email-code challenge → session issuance, and the verified-email password-reset request/complete UI contract. Agent Lab's password-change dialog has a separate mocked UI test. These are frontend contract tests, not real mailbox/API/browser acceptance. The standalone mocked Playwright auth script is updated but this host could not start its local server/browser during this turn.

## Exit gates

1. Review each auth branch/failure/race and the fixture-only mail boundary. Run focused auth tests, web/Agent Lab typecheck/build, relevant UI test, lint and diff checks; ensure all CI authentication clients use the synthetic SMTP fixture rather than bypassing OTP.
2. User authorized GitHub synchronization on 2026-11-04. Commit/push the scoped, locally checked auth candidate to agent-lab; inspect CI for that commit and merge only through a passing PR.
3. Before live acceptance, configure OTP secret and TLS SMTP through the deployment's secret store, apply the additive migration with backup/recovery plan, and perform a browser run using an owner-controlled mailbox. Verify registration, repeated login, change/reset, revocation and email delivery without exceeding the user's cost cap.
4. Whole-product acceptance remains separate. This auth work cannot be presented as whole-product quality or deployment acceptance.
