# Lab cancellation receipt integrity

Scope: CANCEL-RECEIPT, internal prerelease. Overall product remains NOT_ACCEPTED.

The Builder previously treated every successful HTTP response as an acknowledged cancellation. It now checks the captured run ID, the five supported run statuses and a canonical ISO cancellation timestamp. An explicit null timestamp on a terminal run reports that the run ended without confirming a cancellation request. Missing, malformed, mismatched or nonterminal null receipts report an unknown result, retain the current run and require explicit verification/retry. No automatic cancellation replay or model call is introduced.

API contract: the existing cancel controller returns 201 with the persisted run. PENDING cancellation settles immediately; RUNNING cancellation records a request while the in-flight call still settles. A terminal race can return a null flag. A recorded flag establishes a cancellation record, not that this particular request first wrote it or caused the final status. No schema, API, permission, billing or runtime changes.

Verification:

- Old implementation: 13 failing and 43 passing component cases. Fixed implementation: 56/56 pass, including ten invalid receipts and three terminal-null outcomes.
- Relevant ESLint, Lab TypeScript/build and browser-helper syntax checks pass.
- Independent test Agent reviewed the contract; its route error-propagation finding was corrected.
- First full isolated chain exits 0: API82/82, complete browser acceptance, PostgreSQL schema/row-multiset/sequence equality and actual Milvus question plus Qdrant vector/payload restore pass. Lab image digest: `sha256:55c0bf456c82c4e4128572ae02b50c216486c391852bdbbf62ffb7dea483cf07`. Actual201 replaced by201{} shows unknown result; explicit retry returns the original persisted cancellation timestamp. The held call then settles CANCELLED with one synthetic call and one ledger record; metadata retries add neither. Relevant diff check and independent inventory reconciliation pass. Stage checks passed; exact-head CI and remote merge are still pending.

The browser extension forwards a real cancellation to the isolated API, replaces its 201 receipt with 201 {}, checks the unknown-result display and actual persisted timestamp, and explicitly retries the same run. The held model fixture permits comparison of provider and ledger counters. Terminal-null outcomes and other malformed shapes are component evidence only; no field-by-field input retention or real-provider quality claim is made.

All provider work uses an isolated offline synthetic fixture; external model cost is zero. Historical unknown billing, genuine model quality, legacy question ownership and production deployment remain unresolved boundaries. The 983-template inventory retains every final NOT_ACCEPTED verdict.
