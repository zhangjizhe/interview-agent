# B1b runtime result completion boundary

Baseline: agent-lab 5fba683. Overall NOT_ACCEPTED; this is a limited B1 increment.

## Source checked and product contract

AgentRuntimeService.runAgent formerly accepted missing/wrong response shapes as COMPLETED through a truthy output fallback. normalizeRuntimeOutput now requires an object with a string response, either explicit output or the legacy top-level response. An explicit invalid output cannot fall back to a top-level response. Legacy empty strings and diagnostic fields remain compatible; this is shape validation, not semantic quality, a complete runtime envelope, or unified event validation.

The marker RuntimeOutputContractError uses existing domain failure handling, queued CAS and run.failed Trace. Output remains null and no turn.end is emitted. A malformed result may follow model consumption: the failure path preserves only finite nonnegative adapter-reported CNY estimates and safe nonnegative integer token counts/calls, with optional dense string model arrays. Missing/invalid metadata stays unknown; it is never replaced with zero. These fields are reported estimates, not verified bills. Other adapter exception handling remains unchanged. No automatic replay, database schema, public API, permission, prompt or provider change.

## This iteration actually verified

- Before implementation, four lifecycle regressions failed on false completion (4 failed / 8 passed). Independent review then found usage loss on the new failure path; its additional regression failed (1 failed / 12 passed). Both were fixed. Two intermediate TypeScript build errors in evidence typing were corrected before successful build.
- Final relevant Jest: 5 suites / 48 tests passed, including sparse model arrays; Nest build, API typecheck and focused ESLint passed. Script syntax and diff checks passed before integration.
- Independent read-only review found no remaining code blocker; requested persistent failure Trace usage/estimate assertions were added to the real PG/API helper.
- Latest-image isolated actual Nest/PG/API91/91 and browser regression passed, including malformed output history with fixed version/error/estimate/calls and no completed output. First complete new-image chain exited0: strict PostgreSQL schema/row-multiset/sequence equality plus actual Milvus question and Qdrant vector/payload restore passed. API image config sha256:8b0b794488a98c529211cfebc152ecdcee1d697595cbd61b174699f79d951cf4; unchanged Lab sha256:29778e0b2050a4e60002f46dfa68c865acc283930e41444abace0939e0b50d0a.

## Integration scenario and limits

The private fixture registers two valid engines and one malformed-output engine in a built service using tenant-scoped Prisma and actual TraceEventService. The malformed engine returns synthetic reported usage/calls1 and estimate0.012, without invoking a model. Assertions inspect actual FAILED Run/output null, authenticated HTTP readback, run.failed Trace usage/estimate and absence of turn.end. Browser history must show the same fixed version, error, estimate and calls, with no completed output. Ledger/provider counters must remain unchanged for this scenario.

All reported numbers in this scenario are synthetic adapter metadata. External model spend0; this does not reconcile unknown historical bills or establish model quality. Complete B1 contracts, candidate golden chain, session snapshots, policy/telemetry separation, database-outage recovery, original question ownership and deployment acceptance remain unfinished. Local stage evidence passed; exact-head CI and PR merge remain pending.
