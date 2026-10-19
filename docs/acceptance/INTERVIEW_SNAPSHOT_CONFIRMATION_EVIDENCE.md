# Interview confirmation and turn-version correctness

Date: 2026-10-19. Scope: two input/provenance defects found while planning the self-built, replaceable architecture. Whole product remains NOT_ACCEPTED.

## Reproduced gaps and changes

1. The candidate page awaited `confirm-resume` but ignored its HTTP result/body, then unlocked chat. The actual endpoint returns `{success:true}`. The page now requires a successful HTTP response and exact boolean success, displays an accessible error, prevents same-tick duplicate requests, and isolates request generations across route changes/unmount. An unknown receipt is not rollback or proof of confirmation.
2. Interview bridge originally read Application's current version for policy, while startExternalRun resolved the current version again. A concurrent publication could record a different version from the injected policy. The bridge now copies one PUBLISHED id/version/policy snapshot before awaiting and passes its explicit id to runtime; a mismatched Run or failed ApplicationRun association is rejected and the created Run is best-effort marked failed.

No migration, API response shape, model/Prompt change, new dependency or paid call. These changes improve candidate input gating and recorded execution provenance; they do not establish full session version pinning. Existing controller catch-and-continue on bridge failures remains, so mandatory policy loading and optional telemetry are still separate future work. If Run creation succeeds and trace append throws before returning its id, durable orphan reconciliation is still needed. Failure recording itself can fail during a database outage.

## Verification and review

- Bridge targeted Jest: 6/6 passed, including concurrent publication mutation, missing/draft snapshot, mismatched version and link persistence failure.
- Candidate confirmation component: 11/11 passed, including HTTP403/500/502, malformed/false/string receipts, network retry, duplicate submission, unmount and actual same-component A→B navigation with both requests held.
- Independent architecture and test reviewers cross-reviewed each other's changes; a real same-component navigation gap in the initial implementation was found, fixed and covered before submission.
- Local API Jest: 93 suites / 767 passed; 4 suites / 21 Redis integration tests skipped because no real local Redis URL was configured.
- Three product apps typecheck/build and zero-warning Lint passed. No database migration was required.
- Full Web regression initially had 217 passes and one existing MCP component scenario exceed its default5s while the full suite/build/API tests competed for CPU; no product assertion failed. The four asynchronous MCP workspace tests now have a bounded15s per-test deadline, preserving all assertions. The complete suite rerun passed: 22 files / 218 tests, 0 failures (48.37s).
- Inventory reconciles one added alert UI-0986, preserving every existing identity/review/evidence/verdict; 986 templates = 180 interaction + 806 display. Template counts do not measure runtime acceptance.

The candidate component suite uses isolated transport fixtures. New-image CI exercises the existing API/Lab browser/restore chain but does not cover the complete candidate frontend journey. A real candidate API/persistence/browser golden chain and real model quality remain outstanding, not implied by these tests. AI Benchmark/Evaluation is not used to claim model improvement from this deterministic correctness patch. External model cost0.

## Full planning deliverables

Commercial primary-source research and current code audit are reflected in `docs/product/SELF_BUILT_AGENT_PLATFORM_PLAN.md`, `FEATURE_MATRIX.md`, `PRODUCT_ROADMAP.md`, and `docs/architecture/REPLACEABLE_AGENT_CONTRACTS.md`; ADR24 preserves the architectural decision. All new ports/features are labeled target/proposed and must enter real execution paths before acceptance. No commercial provider credentials or external interview API connection were enabled.
