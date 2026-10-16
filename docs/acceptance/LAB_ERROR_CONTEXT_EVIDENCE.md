# Builder operation error context

Scope: ERROR-CONTEXT, internal prerelease; overall NOT_ACCEPTED.

A completed save failure previously remained visible after explicitly selecting a version, changing the Agent selection or opening a new Agent draft. These transitions now reset the save/start/cancel mutation observers in addition to the existing feedback reset. The pending-operation context lock still prevents switching during a request. Query errors are not reset. No API, database, permission, runtime or cost policy changes.

Clearing an old-context error is not rollback, cancellation, resolution of an unknown server result or proof of zero model work. Existing uncertain-write verification guidance and explicit retry policy remain applicable. The existing context-change request-key policy is unchanged.

Verification:

- Three regressions fail against the previous implementation; the fixed Builder suite passes65/65. The new tests exercise completed save/start/cancel failures across version/Agent/new transitions and assert no extra POST. Three save regressions were run red before the fix; six start/cancel cases were added after it.
- Relevant ESLint, Lab TypeScript/build, helper syntax and diff checks pass. Independent test Agent found no blocking implementation issue.
- New browser coverage is limited to a save503 proxy with no upstream write, reselecting the current version, clearing Agent selection, and opening a new draft. Actual Agent version counts and provider/ledger aggregates are compared. Start/cancel failures have dedicated component cases, but no new browser failure-context evidence in this stage.
- First full isolated chain exits0: real API82/82, complete browser acceptance, PostgreSQL schema/row-multiset/sequence equality, actual Milvus question and Qdrant vector/payload restore pass. The new save failure-context checks pass without persisted version or provider/ledger increments. Lab image `sha256:14ba55c20f04ceddb64a3f4fceb852f41e9a0d9e3172040f9f32d22ec1cf3148`. Stage checks pass; exact-head CI and PR merge remain pending.

No external provider is used; external cost0. Historical billing unknowns, real model quality, legacy question ownership and deployment remain outside this stage. Inventory983 templates keep final NOT_ACCEPTED verdicts.
