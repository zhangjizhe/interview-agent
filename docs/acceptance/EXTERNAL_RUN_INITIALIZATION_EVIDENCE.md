# External Run required-message initialization

Scope: B0-EXTERNAL-INIT, overall NOT_ACCEPTED. Source baseline ce18131 (PR44).

Code checked: AgentRuntimeService.startExternalRun creates a RUNNING record before writing the mandatory user.message. If that append failed, it threw before the bridge received a Run ID, leaving a RUNNING record. A focused reproduction has3 failures/1pass against previous code.

The fix catches only this required-message failure, conditionally updates that exact RUNNING Run to FAILED with completedAt and a generic non-content error, and rethrows the original failure. A concurrent terminal record is not overwritten. If the failure-state write itself fails, log only an event/run ID and preserve the primary error; durable reconciliation during database outages remains unresolved. No trace replay, model call, schema/API/permission change or automatic retry.

Early verification mistake: using the package test script sent arguments to the wrong trailing command and launched the whole Jest suite. Sandbox socket EPERM and a new test's transitive ESM dependency import failed. The focused test then reused existing dependency isolation, and exec jest was used. These setup/environment failures are not product red-test evidence.

Local verification: new focused4/4 plus related runtime/bridge total15/15, relevant ESLint, API typecheck/build pass. Independent initial review found no blockers; real concurrency and database-outage cleanup remain outside that unit evidence.

New isolated fixture uses the built runtime with actual tenant-scoped Prisma and an injected required-message failure. It creates a synthetic Agent/version, checks persisted FAILED/completedAt/generic error, authenticated HTTP readback and unchanged usage ledger. Browser reads the real failed history record/status/error, confirms cancellation disabled and unknown costs retained. First full new-image chain exits0: API85/85, the real failed-run browser scenario and complete browser regression, strict PostgreSQL schema/row-multiset/sequence equality and actual Milvus question/Qdrant vector-payload recovery pass. API image `sha256:fde14c0eba1d198ed575fa8214ea932815211f7c8282d839411a8d1096b487d1`; Lab image `sha256:29778e0b2050a4e60002f46dfa68c865acc283930e41444abace0939e0b50d0a`. Final independent review found no new blockers. Relevant script syntax/diff checks pass. Limited stage checks passed; exact-head CI and PR merge remain pending.

This is injected persistence failure, not a natural database outage. It does not fix controller catch-and-continue, mandatory-policy separation, session-level version pinning or all orphan paths. Candidate full browser golden chain, real quality, billing unknowns, old question ownership and deployment remain NOT_ACCEPTED. Offline synthetic provider only; external cost0, unrelated fixture model work is not absent.
