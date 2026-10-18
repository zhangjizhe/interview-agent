# Operation log read/filter evidence

Scope: L13 OPERATION-LOG-READ, internal prerelease, overall NOT_ACCEPTED.

Product contract: administrators can read persisted controlled-operation records, filter by action/outcome/object type with AND semantics, and see truthful action/result, object, actor, localized timestamp, total and pagination availability. A combination with no records must show the empty state; selecting the prior combination restores actual records. Reads must not create model work or ledger entries.

The existing service reads tenant-scoped Prisma labOperationLog findMany/count ordered by createdAt desc, then returns filter metadata/page/limit/total/hasMore and selected fields. This stage reuses the real MCP reload operation generated earlier in the private fixture. No product/API/schema/permission changes, no direct fabricated log insertion or business account access.

The new browser helper compares actual filtered browser response with an independent authenticated API GET, requires real reload records, and checks every displayed row field including browser-localized timestamp. It checks total, disabled previous-page and next-page availability from hasMore; changes action to an incompatible object combination to verify empty results, then restores the previous combination. Provider/ledger aggregate counts must not change.

First chain failed after successful row-field comparisons: the test incorrectly treated title as the button accessible name; actual arrow text is the accessible name. Corrected selectors use the existing title attribute. This is a harness failure, not a passing stage. Explicit pagination aria-labels remain an accessibility backlog item. Verification: corrected second full chain exits0, API82/82, operation-log scenario and complete browser regression pass; strict PostgreSQL schema/row-multiset/sequence equality and actual Milvus question/Qdrant vector-payload restore pass. Independent final review, helper/root syntax and diff checks pass. Existing API0ee7eec3… and Lab73da2faf… images reused (full digests in CURRENT_STATE). Limited stage checks passed; exact-head CI and PR merge remain pending.

Not covered: every action/outcome, rejected operation creation, actual next/previous page traversal, date range UI (not exposed here), cross-tenant disclosure, natural read failures/retry, mobile/keyboard or whole L13. API readback proves persisted write/read within this fixture, not database restart durability by itself. Whole-chain strict recovery is separately reported.

Unchanged existing images are reused; no unchanged product test/build repetition. Offline synthetic provider only, external cost0; fixture model and ledger records remain real synthetic work. True model quality, deployment, historical unknown bills and old question ownership remain unresolved.
