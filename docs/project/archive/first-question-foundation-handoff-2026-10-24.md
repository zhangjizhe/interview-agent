# Superseded first-question handoff history

Archived 2026-10-24. Historical status below is not current acceptance. Read current THREAD_HANDOFF first.

# Thread handoff

2026-10-23. Continue autonomously on agent-lab; overall PRODUCT-REACCEPTANCE-1 **NOT_ACCEPTED**. Only active theme: FIRST-QUESTION-PRESENTATION. Do not ask for phase continuation. Independent testing Agent is authorized.

## Baseline and local changes

Local/main/origin-agent-lab last readback55230237f2ab7eeea7c4224577d2aee0dac8ba6d (PR61). Precise CI and merge receipts are in GOLDEN_SKILL_ATTRIBUTION_EVIDENCE. PR60/59 limited previous stages remain valid; do not repeat unchanged checks. Latest merge receipts are post-freeze working-tree docs pending the next related commit.

Original actual red: question-presentation-actual-red.exit1 on PR61 built image. Confirm=true, assistant/tasks/questions0; start greeting then Answer1/History1/completedTask1, Evidence0. Independent review confirmed. Product API/UI still have this bug.

New uncommitted foundation: schema + migration20261023010000_question_presentations; QuestionPresentationService; ADR25; optional store probe in verify-built-api.sh; narrow verify-presentation-store.sh; guarded verify-question-presentation-store.cjs; legacy task/message migration assertions. No service registration or candidate route call yet. Candidate submission and exact CI/merge gates remain pending.

Foundation semantics: parent guarded update serializes short DB transactions, no raw SQL/provider work in transaction. OPEN receipt freezes real task. Composite same-interview/org FKs and one-unresolved partial unique/state CHECK. Only CLAIMED returns random claimToken; runtime ID/UUID checks prevent undefined Prisma filters. Each new attempt fences old callbacks. UNKNOWN is retained. Finish checks normalized answer/history/task and all exact question/answer text. Proven pre-dispatch release only. Existing tasks are not backfilled. End coordination and crash recovery in real callers remain unimplemented.

## Actual verification receipts

- presentation-migration.log/.exit0: fresh/actual pre-tenant upgrade, old pending/completed task and assistant preservation without receipts; 3 existing database suites,19 passed.
- presentation-store-final-image.log/.exit0: final product source image interview-api:presentation-store-final. Relevant lint/typecheck/build passed.
- presentation-store-real-chain.log/.exit1 retained: API93 plus20 store checks then harness expected P2004; actual correct CHECK rejection SQLSTATE23514. Narrowed exact error assertion, no weakened constraint.
- presentation-store-final-chain.log/.exit0: API93 +29 direct-service/PG store checks, strict PG schema/row-multiset/sequence equality, actual Milvus/Qdrant and recovery. Independent review read log/exit. One original token negative case used ended session; it is excluded as token-validation evidence and replaced by narrow active-state tests below.
- presentation-store-final-guards.log/.exit: final narrow PG run pending completion/readback. Final test isolates markUnknown/finish on active scored claim, release on a separate active unscored claim; invalid token cannot be masked by end/missing-score/already-answered conditions. Other intermediate token-guard/active-token runs exit0 but final script is authoritative.
- presentation-api-tests.log/.exit: full local API suite running after schema change. Do not infer final pass from intermediate PASS lines.

These are synthetic storage fixtures; scoring rows are deliberately seeded and do not prove Agent scoring or API/browser behavior. No paid external model work. The full chain uses internal synthetic model calls; do not call the entire run model-free.

## Next concrete work

Finish independent final guard/full API review and update evidence. Then integrate actual queue initialization admission, confirm/GET receipt, explicit OPEN/ANSWER presentation identity, candidate-message replay binding, task claim before model dispatch, exact task completion and next-presentation recovery, end/claim serialization, UI OPEN input gating and interrupted stream GET recovery. Keep models inside the existing gateway/LangGraph flow. Initial queue generation cannot run under the DB lock. Require actual first/subsequent-question API and browser regressions, strict restore if schema changes, latest exact CI and independent original logs before committing/pushing/merging. Do not weaken the original red test to manufacture acceptance.

## Boundaries

External <=0.5CNY/call, release cumulative<=3CNY; historical known0.069285 plus unknown charges remain unreconciled, no paid replay. 990 inventory rows, real model quality, misleading retest label, other TASKS and target deployment are not accepted. Never stage/reset unrelated historical cost report (86 lines), screenshot directories or TASK-034. No running CI monitors; no new PR. Inspect current status and actual exit files before resuming.

Latest local receipt: final store full-chain exit0 with29 checks/strict PG and actual vectors; final narrow active-token guard exit0 with29 checks and independent review; full API with local loopback exit0 (100 suites/871 passed21 skipped), initial sandbox EPERM failure retained. Foundation local gate only; exact new CI/PR still pending and candidate routes/UI remain unmodified. No permission question needed.

PR62 final limited foundation gate: candidate5194edcb passed exact push39974325503/PR39974398837 attempt1 six jobs and independent original-log review; merged7e29d768fd7fd0a979ff80915d696f02f14035aa at2026-10-23T18:32:14Z. PR/main/agent-lab/local read back. API/UI first-question protocol remains unconnected and NOT_ACCEPTED. See QUESTION_PRESENTATION_EVIDENCE.md. Final merge receipt is post-freeze working-tree documentation.


## Next integration constraints (source checked after PR62)

- confirm/GET must return and recover the authoritative persisted receipt; serialize
  initial preparation outside the short DB lock. initializeQueue calls QuestionBank
  search, potentially embedding/rerank, so moving it to confirm must retain the
  published-policy admission and gateway quota boundary before that model work.
- Explicit OPEN/control is unscored; ANSWER carries presentation identity. Bind
  StreamMessageDelivery replay to that identity as well as content and client ID.
  Agent must use the claimed task, not independently select the queue head. Keep
  current session-lifetime/request protections in the browser hook.
- Current end emptiness uses messages.length0. After first assistant presentation,
  a zero-answer session would wrongly enter final evaluation; define empty/zero
  scored-answer termination explicitly. Lifecycle.end finally completes the session
  even when no normalized answer report exists; do not silently preserve this as
  successful acceptance of the new presentation flow.
- EvaluationService.beginFinalEvaluation currently upserts the idempotency key then
  unconditionally sets non-SUCCEEDED/DEGRADED runs RUNNING. It prevents duplicate
  rows but does not exclude two model dispatches. Reuse EvaluationRun CAS and the
  parent Interview coordination boundary for end/claim, not a replacement engine.
- UNKNOWN read/reconciliation, durable assistant replay and next-question recovery
  are required. Existing service's ended-session refusal does not prove caller
  coordination. Actual API/browser tests must answer the displayed receipt; no
  silent compatibility fallback for unbound fixed answers.

Only unrelated historical dirt and these post-freeze documentation updates remain.
No model calls or new product code were added after the frozen PR62 candidate.

## Current integration WIP (2026-10-24)

Read CURRENT_STATE/ACTIVE_TASK first: earlier paragraphs describe PR62 foundation only. Current working-tree backend/frontend integrate presentation/v1, provider-free saved-row initial selection, current active job/version guard, exact claimed-task scoring/replay, safe end/claim coordination and normalized-only final report input. Independent Web48 and focused confirmation UI11 passed; backend focused12 and typechecks passed. New image presentation-protocol-wip built; full private run presentation-protocol-real-chain.log/.exit is pending. First narrow extension failed on fixture active-job uniqueness after version rejection passed; fixture fixed, not a product pass. No new commit/PR/CI. Browser fixtures and full regression/actual stored question and recovery paths remain to verify. Preserve unrelated historical dirt.

Latest actual receipts: API full883/21 skipped; Web307; HTTP/SSE11; relevant lint/type/diff and both images passed. Private full-final exit1 at missing default Chromium after API93/store39/real saved-bank first question/OPEN no scoring or provider delta and synthetic real Agent golden/retest/repeatend zero embedding passed; no browser/restore claim. Corrected ledger probe explicitly asserts INTERVIEW_START1 before zero-preparation delta. Existing temporary cache Chromium145.0.7632.6 verified; current presentation-protocol-browser-ready full run pending. Narrow recovery44 exit0 covers real completeTask with explicit in-process synthetic LLM dependency, failed next presentation repaired by confirmation without rescoring, and post-score follow-up failure retained UNKNOWN; not HTTP fault injection/model quality. Agent independent read confirmed boundaries; final original-log review still pending.

Browser-ready run exit1 retained: cached default Lab image showed old MCP feedback while current source/test requires process-scoped reload wording. Root omitted an explicit same-source Lab image in that attempt. Build presentation-lab-image is running; future run must set FIXTURE_LAB_IMAGE=interview-lab:presentation-protocol-wip in addition to API/Web and PLAYWRIGHT_BROWSERS_PATH. No product assertion weakened. Independent Agent is adding a narrow actual service-created UNKNOWN/GET/browser gate, explicitly not a provider-disconnect scenario. All current feature changes remain unsubmitted.
