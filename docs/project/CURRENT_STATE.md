# Current state

2026-11-03. Architecture/recording candidate remains **NOT_ACCEPTED**. User authorized code fixes and preparing a usable recording path. No production deployment, external paid replay or model-quality acceptance is implied.

## Source and failed gates

Remote development baseline is `57b0ac9a0b6ca72c072b69ea469360bc8a047f4e` on agent-lab; main remains `deaf006d390c99000be992fb90d443dae99107b3`; PR64 is open. Current question-catalog changes and the browser-label repair are a local, not-yet-pushed candidate. The older dirty checkout is preserved separately; its unreviewed runtime work was uploaded to `backup/local-runtime-20261030`, not merged into this candidate.

PR64 original `115b5c6` failed because the isolated administrator exhausted the normal Free100-call quota at the fifth invalid-score sample. The runtime prerequisite at `57b0ac9` grants only that isolated fixture a finite200 budget, retains normal Free100 assertions and stops passing a Lab Run ID as an Interview foreign key. Both subsequent CI runs still failed, now at the business-assertion JSON textarea's exact accessible-name locator. Local source now sets its explicit aria-label; the root agent ran39 focused UI tests successfully. These repairs are not evidence that complete browser/recovery acceptance passed.

## Current architecture candidate

- Interview owns a PostgreSQL canonical question catalog and version snapshots after explicit per-organization adoption. Agent Lab remains the governance UI and separately owns frozen evaluation datasets/Cases. See [catalog architecture and migration](../architecture/INTERVIEW_QUESTION_CATALOG.md).
- Legacy Milvus remains the active source until an ADMIN explicitly confirms a maintenance window and adoption. Bounded, twice-read Strong snapshots must agree; duplicate/conflicting/incomplete sources reject. Adoption commits state/current records/versions transactionally, makes no Provider calls, retains the old source and never moves users or copies another organization's bank.
- New Milvus catalog indices are rebuildable projections. Canonical writes commit before indexing; index failure returns SAVED/PENDING, does not erase PG data and does not trigger automatic paid retry. Explicit rebuild handles at most20 items per request. Initial selection reads PG without embeddings and passes actual catalogVersionId/contentHash into task/question metadata.
- Search hydrates current, same-organization, nondeleted READY entries from PG before rerank; stale/deleted vector content cannot replace canonical text. Pending catalog entries fail semantic search explicitly. Migration/rebuild concurrency uses the shared organization state-row lock; legacy external writers still require maintenance coordination.
- The Lab catalog panel reads actual storage state, validates operation receipts and exposes adoption/rebuild with unknown-result recovery. It does not prove a deployment has adopted its bank. Public cross-organization sharing, automatic index compaction/health repair and complete historical backfill are not implemented by this stage.
- Additive migration `20261102000000_interview_question_catalog` provides catalog state/current/version tables and organization constraints; version UPDATE is rejected by a trigger. No retroactive migration is claimed. Long index/source operations can hold the bounded180-second organization transaction; rollback to old software is not lossless after new PG-only writes.

## Verification and delivery boundary

Root's actual local verification for the catalog candidate: API1149 passed/24 skipped; Web328 passed; application typechecks, full lint, builds, Prisma schema validation and provider-free Golden30 validation passed. The subsequent textarea aria-label repair has39 focused UI tests passed. Counts describe these respective runs, not an invented combined total or a new post-label full-suite run.

Local Docker is unavailable. HTTP/PG/Milvus catalog checks, independent PG concurrency/isolation tests, the Lab catalog browser helper and strict restore/migration assets are wired into CI, but the new combined head has not been pushed or executed there. Real PG tests skipped locally must not be counted as passing. Before merge: freeze/upload exact source, inspect latest push/PR CI original logs, require complete migrations/images/actual HTTP/PG/browser/recovery success, then expected-head merge and remote readback. Do not merge failed/pending `57b0ac9` as if its local repair had already run remotely.

## Evaluation and recording limits

Existing BUSINESS_ASSERTIONS/v1 and release-gate/v6 certify bounded deterministic output-contract evidence, not interview semantic quality. Golden shares the production interview-decision/v1 request/parser; heuristic fallback remains llmEvaluated=false. Failed/missing/unknown evidence and paid-usage uncertainty remain fail-closed. Per-sample boundary stopping budgets <=3CNY may be exceeded by an already-started sample; they are not prepaid aggregate reservations. Existing bootstrap/already-published compatibility is not retroactive certification.

[Recording readiness](../runbook/RECORDING_READINESS.md) separates real Provider product deployment from isolated synthetic engineering checks. The existing manual gate pauses only Lab5176; candidate5177 subsequently runs automatically. Synthetic45→80 is not learning gain. Each new registered user has a separate organization; a Lab administrator's bank is not automatically shared with another candidate.

Security prerequisite remains the official @hono/node-server2.1.3 fix with installed-chain red/green evidence from the prior stage; the existing disclosed Zod3 upstream HIGH is not erased by this catalog change. No new zero-vulnerability or current external audit claim is made.

Historical charges remain unreconciled (known0.069285CNY plus unknown); no paid external call is claimed this round. Human annotation/adjudication, real scorer calibration, full B1-B6/inventory acceptance, training effectiveness and production deployment remain open. The requested portfolio assistant is a separate follow-up target under development, not completed or accepted by this catalog freeze.
