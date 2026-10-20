# Interview required policy admission — in progress

Baseline agent-lab a5e32ed2357242506874a2139790962440121a69. Overall NOT_ACCEPTED.

## Source checked

InterviewFlowController.postMessage previously caught all InterviewLabBridgeService.startTurn errors and invoked InterviewAgentService.processMessage with an empty approvedAgentPolicy. Bridge startTurn owns published snapshot validation, external Run initialization and required application association, so this failure was not merely optional telemetry.

The minimal change moves startTurn/context creation inside the existing delivery try/catch. Failed admission produces the existing generic SSE error, no model invocation or assistant persistence and no successful DONE. Existing unanswered-message cleanup is attempted once. Normal published policy passes through unchanged. Optional complete/fail writeback behavior remains unchanged; this is not a comprehensive policy/telemetry separation.

## This iteration actually verified

- Initial sandbox HTTP test could not listen (EPERM): infrastructure restriction, not product regression evidence.
- With local listening allowed, new Nest HTTP/SSE regression failed against old implementation (1 failed / 4 passed): returned heartbeat/token/DONE despite rejected policy initialization.
- After fix: initially SSE/bridge 2 suites / 11 tests passed; expanding to replay/quota exposed an old fake disabled-bridge precondition, updated to a valid published-policy fixture so it still reaches the quota guard. Final 3 suites / 14 tests passed, including zero agent work, no assistant persistence, single cleanup attempt, no private error disclosure/DONE, and unchanged normal policy forwarding.
- Focused ESLint, API typecheck/build and diff inspection passed. Independent read-only review agrees fail-closed admission is required; cleanup failures may leave unconfirmed claims/orphan Runs.

## New-image integration in progress

API image config sha256:0d79c446e14f8659ad086c54a38218d857ccefe3461cfa218473ac22bc04f55f built. The real-PG helper temporarily pins an isolated application to a draft and sends the same request key twice through actual Nest SSE, asserting generic refusal/no token/DONE or policy disclosure, zero persisted candidate messages, and unchanged Run/provider/ledger counts. It restores the original version pointer; stats require valid HTTP and bounded counter reads, and restore failures preserve the primary error.

First chain failed before these assertions: the test assumed the built-in application already existed (Prisma No Agent found). This was a fixture prerequisite failure, not evidence of the product admission result. Added actual bootstrap HTTP call and read returned agentId, without weakening assertions. Second new-image actual API93/93 passed, including both new policy checks. The second chain subsequently failed in existing Lab first-release browser flow: the gate button stayed disabled after Agent selection (30s timeout); strict restore was not reached. New admin-owned bootstrap/draft is a potential fixture interaction, not established product regression. Third chain moves the policy scenario into the existing owner account/workspace (actual login token passed to helper), keeping the admin registry used by Lab browser unchanged; original browser assertion remains. Third chain exited0: actual API93/93 with owner tenant identity and unchanged model/ledger assertions, existing Lab browser including first-release denial, strict PostgreSQL schema/row-multiset/sequence equality and actual Milvus question/Qdrant vector-payload restore passed. This does not establish the second timeout root cause. Candidate frontend UI专项 was pending at that point; subsequently passed in the final chain below. Private diagnostics retained locally; no raw log committed.

## Remaining stage gates

Not submitted, pushed or merged. New built-image PostgreSQL/API and existing Lab browser/strict restore passed; candidate secondary acceptance has now passed as detailed below; independent final review and exact-head CI/PR are required. Do not reuse PR47 evidence for this change.

Actual draft-policy API/PG refusal now verified; normal policy forwarding remains HTTP unit evidence, not full candidate golden chain. The following previously pending candidate plan is now implemented and verified by the final chain below: add candidate frontend image/browser into the private Docker harness (Lab image serves only Lab). Use an isolated owned interview with resumeConfirmed true, valid login and fixed local origin (separate5177 candidate container;5176 remains Lab only); set draft pointer only in fixture control, assert generic error/streaming exit/send restored/no assistant; read PG/model/ledger again and restore pointer. Do not use the business localhost preview or treat context.request as candidate UI proof. Candidate UI must exit streaming and show retryable generic error without exposing internal policy. Verify strict restore before claiming full isolated chain.

No schema, permission, prompt or provider changes. A Lab initialization outage now blocks a new candidate response instead of running without published policy; persisted replay still bypasses new model work. Cleanup failures do not guarantee immediate retryability. Full candidate golden chain, session-level snapshots, real model quality, unknown historical bills and deployment remain unaccepted. External spend0.


## Candidate browser implementation (2026-10-21, verification pending)

Private Docker harness now starts the built candidate frontend separately on localhost5177 after existing Lab acceptance; CI already builds both frontends and now passes its candidate image explicitly. fixture-policy-browser.cjs uses fixed private DATABASE_URL/owner organization and a private0600 snapshot, restores Agent pointer/resume confirmation independently, deletes its alternate interview, preserves primary/cleanup errors and keeps recovery snapshot on failed cleanup. Browser uses actual owner login and Ctrl+Enter sends, actual SSE/no token/DONE, visible generic alert, composer reuse, SPA navigation to another owned interview clearing old error; actual PG/model/ledger checks run before pointer restore. No response substitution or business preview is used.

Candidate script attempt1 used plain Enter, which is newline by product contract: no POST, a harness mistake. Attempt2 used Ctrl+Enter and received actual error SSE, but Playwright raw Chinese response text had a decoding mismatch before the visible alert assertion. Neither establishes a browser product red. Keep ASCII event/no-success assertions at transport level and exact Chinese at actual UI rendering; no claim that the raw decode issue is fixed. Source independently confirmed the page never displayed stored stream errors. Page now subscribes to store error and adds role=alert; clears error on interviewId change. Late in-flight writes across different component instances remain a separate global stream ownership risk, not solved here.

AST reconciliation matched127 prior InterviewPage native/router nodes, preserved every previous identity/review/evidence/verdict across986 entries, and appended UI-0987 as NOT_ACCEPTED. Current987 templates (180 interactions/807 displays) are not coverage or completion percentages. Initial temporary AST script omitted Router Link and refused count126/127 without modifying inventory; corrected Link inclusion and exact identity reconciliation succeeded.

New candidate scoped image built; relevant frontend ESLint/typecheck/build passed. Final new-image actual API93/93, Lab browser and candidate browser passed: real SSE error rendered visibly, composer reusable, explicit retry denied without model work, SPA switch clears old error. Complete chain exited0: strict PostgreSQL schema/row-multiset/sequence equality and actual Milvus question/Qdrant vector-payload restore passed. Candidate image config sha256:8acdc4a6ab86297875bb5c20b01d7c8cc867451991eceac1e951856a7ae9b58f; API config0d79c446… above. Independent final source/inventory review found no remaining blockers. Local limited stage evidence passed; exact-head CI/PR merge remains pending.
