# MCP toggle receipt integrity

Scope: MCP-TOGGLE-RECEIPT, internal prerelease; overall NOT_ACCEPTED.

The control center previously reported an updated tool for any successful HTTP response. The existing request is now delegated to a local helper that snapshots its input and requires `ok === true`, the exact tool name and exact requested boolean before reporting success. Invalid receipts produce an unknown-result message requesting a fresh status read. Starting a new toggle clears old success feedback. A failed receipt does not imply rollback: the runtime override may already have changed. No automatic replay or extra read/model call is introduced.

Server API/schema/permissions/runtime billing remain unchanged. The override remains process-local; no restart persistence, external protocol health or actual tool-execution acceptance is claimed.

Verification:

- Initial test setup incorrectly returned a mock from beforeEach and caused an extra cleanup failure; corrected before recording product regressions. With correct setup, old behavior has6 failures/3passes; fixed9/9 pass, including malformed/mismatched receipts, exact true/false responses and rejected transport without replay.
- Relevant ESLint, Lab TypeScript/build, helper syntax and diff checks pass.
- Browser forwards actual disable201, verifies the real acknowledgement, then supplies201{} to the UI. It must show unknown result while actual list is disabled, show no false updated message and leave provider/ledger counts unchanged. Explicit same-target disable and re-enable remain covered. Other malformed receipt types are helper-contract evidence, not browser variants.
- First complete isolated chain exits0: API82/82, new MCP real201-to201{} browser scenario and complete browser regression pass, strict PostgreSQL schema/row-multiset/sequence equality and actual Milvus question/Qdrant vector-payload restore pass. Lab image `sha256:73da2faf1b42369aa928af58b7142279aa482588982c601dcb93cf2efb2993dc`. Independent test Agent final implementation/test/browser/inventory review found no new blockers. Stage checks passed; exact-head CI and PR merge remain pending.

Inventory983 original reviews/verdicts remain; only source-line reconciliation changes. Offline synthetic fixture, external cost0; whole-chain synthetic work is not represented as absent. Real quality/deployment, historical unknown billing and legacy question ownership remain open.
