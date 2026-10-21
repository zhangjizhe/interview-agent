# Candidate SSE lifecycle ownership — in progress

Baseline agent-lab9032c913e9728ab0eaa8c648da72a231cd43e2d2. Overall NOT_ACCEPTED.

## Source checked and contract

InterviewPage previously called useInterviewStream without a session lifecycle key. Request generations protected earlier sends inside one hook instance, but changing route ID or unmounting did not invalidate or abort that instance's pending request. The hook writes a shared Interview store, so an old response/catch/finally could change the later page's placeholder, error or streaming state.

Minimal change: optional sessionId parameter wired from actual InterviewPage route. Effect cleanup increments the request generation before abort, clears local controller/reconnect references and releases existing streaming flags only when this hook has an active controller. Existing response parsing/request identity/retry checks remain. No new UI nodes, API/schema/prompt/permission/provider changes.

## This iteration actually verified

- New controlled tests initially2 failed/9 passed: route switch and unmount did not abort/invalidate held fetch. After lifecycle cleanup and an additional active-session token/DONE success control,12 tests passed.
- Tests deliver old token/error bodies even after an abort signal, and assert no change to a simulated later session's message/error/streaming state or additional fetch/retry. This is synthetic transport evidence, not real provider behavior.
- Focused ESLint/frontend typecheck/build and new frontend image build passed; final checks after the positive-control test also passed.
- Inventory AST/native reconciliation confirms987 entries unchanged, including all prior review/evidence/verdict fields; only append a new InterviewPage hash reconciliation preserving old hash history. No coverage/acceptance percentage is inferred.
- Independent source review found no current single-Page-consumer blocker. First complete new-frontend-image chain exited0: actual API93/93, Lab browser, candidate held-SSE/SPA boundary, strict PostgreSQL schema/row-multiset/sequence equality and actual Milvus question/Qdrant vector-payload restore passed. Frontend image config sha256:71c24dcec85328cbba27d5c51ec3ab3d342f69184b8c0d4ddf4a5d4ab8c2d98e. Unchanged API/Lab images reuse the verified security phase versions; no backend/dependency source change. Final independent source/helper/report review found no blocker. Exact new-head CI/PR required before merge.

## Browser scenario

Extend the existing private candidate fixture: after normal policy refusals, route.fetch obtains an actual completed zero-model draft-policy SSE refusal and holds its delivery. While the original composer is disabled, navigate via real SPA pushState/popstate to another owned interview; restore editable composer, then release the held original response and require new-session draft/error/UI state unchanged. No fabricated tokens or model call is used. Existing fixture checks PG candidate-message0, unchanged Run/model/ledger counts, and restores private pointer/confirmation/alternate-interview state. Unit tests cover ignored abort token/error deliveries; browser scenario only covers an actual held error stream.

## Limits and next gates

Abort only stops browser consumption and does not guarantee that a server/provider stopped work, refunded cost or released a claim. This particular fixture independently verifies zero model work because admission failed before invocation. Generation ownership remains per hook instance: multiple simultaneously mounted hook instances could still interact with the global store. The current actual consumer is one InterviewPage; do not claim complete multi-instance isolation. Late History GET updates are a separate discovered risk and are not repaired here.

Local limited stage checks passed; finish latest exact-head CI and PR merge before remote delivery. Real model quality, unknown historical bills, complete candidate golden chain, full B1 and deployment remain unaccepted. External model spend0.
