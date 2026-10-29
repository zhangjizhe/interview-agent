# Current state

2026-10-29. Single active theme: EVALUATION-QUALITY-P0. User authorized completing the priority plan with usable code and independent review/testing. Whole product remains **NOT_ACCEPTED**; no deployment or model-quality acceptance.

## Source baseline

This iteration starts from remote main/agent-lab `deaf006d390c99000be992fb90d443dae99107b3` (merged PR63). Earlier context describing PR63 as open was stale; it is retained in [archive](archive/evaluation-quality-2026-10-29/CURRENT_STATE.md), not used to infer current acceptance. The original older checkout and its unrelated uncommitted edits are preserved.

## Current candidate (not yet delivered)

- BUSINESS_ASSERTIONS/v1 validates bounded structured output and only necessary, actually recorded configured-runtime events. All Cases/config validate before provider work. It does not judge semantic correctness or absence of unobserved tools.
- release-gate/v6 requires server-produced deterministic-business-contract evidence, matching baseline contract hash and existing regression/resource gates. Keyword/schema/latency smoke remains runnable but cannot independently authorize a new publication. Existing bootstrap/already-published compatibility paths are not retrospectively quality-certified.
- Golden evaluation and production DynamicTaskQueue share interview-decision/v1 requests/parser. Invalid/failed/missing/old-contract samples fail the report; unknown usage is not zero. Unbudgeted direct paid CLI is disabled. No human calibration or real model result is fabricated.
- Production heuristic fallback now persists llmEvaluated=false. Valid model decision persists true; sensitive parser/provider payloads are not written in that warning.
- All evaluation repeat counts have <=50 Cases and a cost stopping threshold <=3CNY; unknown/interrupted billing stops subsequent samples. The threshold is checked at sample boundaries and can be exceeded by an already-started sample; it is not a prepaid ledger reservation.
- Both UI paths create business evaluators/Cases and show persisted assertion evidence, unassessed semantics and publication refusal. Queue receipts must validate before confirming submission; unresolved idempotency keys persist across same-tab reload/remount/asset changes, isolated by user; storage failure blocks the POST.

## Actual verification so far

After pnpm9 frozen installation and Prisma generation: final full API1131 passed/21 skipped; Web324 passed; all application types, full lint, API/Web/Lab build, schema validation and provider-free Golden schema validation passed. Focused tests include actual persistence source flags and successful-subset false-pass counterexamples. These are deterministic/mock-provider engineering results, not real model quality. Final source includes receipt durability, unknown model/Prompt identity refusal and official Hono fix. Focused receipt21 and Golden identity47 also passed.

Local environment has no Docker. Exact-head GitHub CI must validate fresh/upgrade migrations, new images, actual HTTP/PG assertions, browser and strict database/vector recovery before merge. None of those new-candidate checks is claimed passed yet.

Necessary security prerequisite fixes GHSA-rmxm-3fg6-px4f by pinning official @hono/node-server2.1.3 with minimal lock changes. Actual installed CJS/ESM attack/SDK tests preserve old red3/pass2 and new5/5; audit exits0 under unchanged exact mitigation policy (moderate0, existing Zod3 upstream high1 still disclosed). No production static-route exploit is inferred from the synthetic dependency fixture.

## Remaining priority work

P0 real Interview end-to-end Rubrics, expert double annotation/adjudication and production scorer calibration; P1 confirmed root-cause/Case feedback and evaluator-standard evolution, reproducible context snapshots; P2 bounded online inspection and later traffic experiments. These are not delivered by deterministic business assertions.

Historical charges remain unreconciled (known0.069285CNY plus unknown); no paid external call/replay. Existing B1-B6/full990-row inventory, training effectiveness, full tool/knowledge/memory binding and target deployment remain unaccepted.
