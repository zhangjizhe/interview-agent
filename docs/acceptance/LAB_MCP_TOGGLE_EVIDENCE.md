# MCP runtime enable/disable evidence

Scope: L05 MCP-TOGGLE, internal prerelease, overall NOT_ACCEPTED.

Product contract: an administrator can change a system tool's current API-process override. The actual registry list and enabled/executable count must agree with the requested state. A disabled builtin readiness check must report failure, not claim callable health. Refused writes keep the previous state; a pending write disables that row's toggle and an explicit re-enable restores it.

Implementation facts: `AdminMcpController.toggle` validates input and delegates to `McpRegistry.setSystemEnabled`; it returns201 with ok/name/enabled. The registry override is in memory. This stage does not establish restart persistence, cross-process coordination, external MCP protocol health, dependency availability, or actual tool execution. No product code/API/schema/permissions changed.

The new browser helper is restricted to the private synthetic Docker origin and selects an enabled executable builtin. It injects a non-forwarded503, holds a real disable201 receipt, reads actual list/count, observes disabled-row pending state, requests actual disabled health200/okfalse and checks the displayed reason. It explicitly re-enables and verifies list/count plus unchanged provider/ledger aggregates. Cleanup restores state only if necessary and preserves the primary failure.

Verification: first full isolated chain exits0, API82/82, new MCP runtime toggle scenario and complete browser regression pass; strict PostgreSQL schema/row-multiset/sequence equality and actual Milvus question plus Qdrant vector/payload restore pass. Independent test Agent final review found no new blockers. Helper/root syntax and diff checks pass. Existing Lab image `sha256:6bf77aee0c19aadd44c22f23e3021f155cb53993fba6229b122ca9fa8191acf0` and API image `sha256:0ee7eec3d49142eb5332bb89a513d6a9331af68371edc69b39e0709f54cf3a6c` are unchanged. Stage checks passed; exact-head CI and PR merge remain pending. Existing product builds/tests are unchanged and are not repeated separately. No new UI templates or review verdict changes.

Offline synthetic fixture only, external cost0. Whole-chain synthetic model calls/ledger entries remain real fixture evidence. Real quality, historic unknown bills, legacy question ownership and deployment remain unresolved.
