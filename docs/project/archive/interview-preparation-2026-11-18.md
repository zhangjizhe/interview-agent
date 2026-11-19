# Active task

2026-11-18 — Interview preparation hub redesign: local phase complete. Wait for the user's next phase.

See INTERVIEW_PREPARATION_REDESIGN.md. Preparation/account separation and resume library UI are deployed on local5173 with rollback. Real normal-session read navigation passed, but the current account has no jobs/resumes. Milvus aggregate retains9 rows under other scope; provenance/reconciliation remains open. No real upload/model or report quality acceptance claimed.

64 distinct related tests across rounds, final18 targeted regressions, Web type/lint/Docker build/diff passed. Earlier unrelated WIP preserved. Remote CI was not refreshed/resolved, no commit/push/merge. Next phase should verify historical data ownership and real preparation flow, then handle security CI as a separate scoped change.
