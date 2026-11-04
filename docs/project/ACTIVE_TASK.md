# Active task

2026-11-04 user correction: ordinary verified-account login now uses username/password directly, without SMTP or a new OTP. Registration, reset/change and first-time legacy claim retain mailbox verification. The previous every-login-code policy below is superseded. Registration checks username availability before mail; occupied IDs and mail503 never create accounts.

Actual new evidence: API auth/session/integration26 and Web auth4 pass; API/Web/Lab types, relevant lint, three frozen-source Docker images and syntax/diff checks pass. Isolated real API/PG/Redis/TLS synthetic browser passed registration, three password-only logins, change/reset/revocation/replay refusal and greeting-fault fallback. Original local Web AND Lab password login passed with ADMIN/profile readback and zero mail requests; occupied registration ID refused before mail. Local images updated, passwords/schema/volumes retained. Full real NetEase registration/recovery remains NOT_ACCEPTED. Previous bf9cf6c six green CI jobs do not certify this new diff; scoped new commit/CI next, PR65 stays draft and main unchanged. No unchanged-condition SMTP retry, OTP bypass or model-quality claim.

## Previous snapshot (login policy superseded above)

2026-11-04 · `AUTH-EMAIL-VERIFICATION`: standard email proof for registration, every login, change and recovery in both Web and Lab. Existing owner restored as local ADMIN after explicit approval and real mailbox OTP; both entries share the same account.

Local source gates passed: auth45/mail15, lint/typecheck/build and real isolated API/DB/Redis/Chrome with deliberately stalled TLS greeting, hostname-verified setup fallback and complete synthetic auth flow. Default daily attempts8, configurable1-20; actual private local cap20 retains counters and60-second cooldown. Credential storage is local Keychain plus tmpfs/runtime injection; no private configuration in Git.

Real-mail acceptance remains NOT_ACCEPTED: original Lab login/restart and earlier isolated NetEase registration/login/change passed; candidate Web and full original-owner reset/final-logins failed on SMTP timeouts. Cause unknown; awaiting the user's NetEase security/client-reminder check. Temporary recovery password is active, generated reset password is not applied. Do not replay failed live cases without changed evidence or delete counters/bypass OTP.

Next gates: inspect scoped diff/secret audit, push only this auth revision, inspect exact-head CI/original logs. Keep PR draft until the real-mail gate is fulfilled; then merge via PR and read back remote branches. Whole product and suspended portfolio/model/report acceptance remain separate. No external model call is needed here. Facts and failures: [CURRENT_STATE.md](CURRENT_STATE.md), [auth evidence](../acceptance/AUTH_EMAIL_VERIFICATION_EVIDENCE.md).
