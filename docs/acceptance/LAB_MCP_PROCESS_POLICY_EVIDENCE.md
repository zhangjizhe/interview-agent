# L05 MCP process policy and execution-time enforcement

Date: 2026-10-19. Scope: the current-process switch contract, invocation-time enforcement and uncertain-response recovery. Overall product remains **NOT_ACCEPTED**.

## Expert review and reproduced gap

Architecture review found that `McpRegistry.get()` returned an unguarded builtin execute function. The graph executor and MCP adapter could retain that function and invoke it after an administrator disabled the tool. Discovery filtering alone did not protect invocation. No external provider or production data was used to reproduce this gap.

Current architecture remains the React/NestJS modular monolith. Registry configuration loads into process memory; administrator overrides are process-local, shared by all organizations served by that process, preserved through metadata reload and absent from a fresh registry. This stage introduces no persistence or cross-instance coordination.

## Delivered contract

- `get()` reports effective enabled state and checks the current tool/parent policy immediately before invoking the current binding. Cached references reject after disable or unregister; an explicit re-enable restores subsequent calls. Already-started operations are not cancelled.
- MCP labels and feedback specify the current API process. A visible notice explains all-organization scope, lack of instance synchronization, reload retention and restart defaults.
- Both successful and failed toggle completion invalidate the read query. A malformed receipt is still unconfirmed, even if reading actual state shows that the write applied; it is not treated as rollback or automatically replayed.
- A separate read-only status button issues GET, changes no configuration and writes no operation log. A failed read is shown as an error, not a successful refresh.
- Reload confirmation and success text disclose the current-process scope and retained runtime switch.

Files: `apps/api/src/modules/interview/services/mcp-registry.ts`, its reload regression suite, `apps/agent-lab/src/main.tsx`, `McpWorkspace.test.tsx`, and the two existing browser recovery/toggle helpers. No schema/migration, HTTP API shape, authorization, Agent graph, Prompt or model changes. The execution guard prevents disabled tool side effects and introduces no extra model calls. All local tests use synthetic data; external provider cost is zero.

## Verification

| Check | Actual result |
| --- | --- |
| Focused MCP API regressions | 4 suites / 31 tests passed |
| Independent backend review run | 3 suites / 27 tests passed |
| Toggle receipts + workspace component regressions | 2 files / 13 tests passed |
| Complete local API Jest selection | 93 suites / 762 tests passed; 4 suites / 21 Redis integration tests skipped without configured real Redis |
| Cache node:test / Golden Dataset contract | 22 passed / 30 cases valid; no provider calls |
| Complete Interview/Lab component suite | 21 files / 207 tests passed |
| Lint | zero warnings/errors |
| API, Interview Web and Lab TypeScript | passed |
| API, Interview Web and Lab production builds | passed |
| Browser helper syntax / diff checks | passed |
| Independent UI inventory reconciliation | 268 prior main nodes preserved, 270 current nodes match AST; all 983 prior IDs/review/evidence/verdict fields retained; new UI-0984/UI-0985 unaccepted; 985 templates = 180 interactions + 805 displays |

The install used the repository-pinned pnpm 9.0.0. Ambient pnpm 11 refused the frozen lockfile; nested scripts selecting that binary were not counted as passing. Direct pinned execution was used after Prisma generation. The tsx CLI IPC listener is prohibited in this workspace; equivalent `node --import tsx --test tests/cache.spec.ts` and `node --import tsx src/evals/eval-runner.ts --validate` completed successfully. No dependency/lockfile modification was made.

## Fresh-image acceptance gate

The existing CI runs `verify-built-api.sh` with the real isolated API, PostgreSQL, vector stores and browser. The updated helper compares actual list/count and disabled health, injects a non-forwarded503, proxies an applied201 with a malformed receipt, performs explicit GET recovery, verifies browser reload and actual config reload preserve disabled state, then restores the switch and verifies unchanged provider/ledger aggregates.

This cloud workspace does not contain Docker. The actual fresh-image browser/restore result must be taken from the submitted commit's Product verification workflow, not substituted with component mocks or historical image results. A failing or missing exact-commit CI blocks stage acceptance.

## Remaining limitations

A fresh-registry test establishes reset-to-config semantics, not a business deployment restart rehearsal. Multi-instance synchronization, durable policy, complete administrator audit, external service health and full runtime UI coverage remain separate work. Reload receipts still use the existing success handling; strict reload response validation is a follow-up. A successful explicit read does not retroactively confirm a previously malformed mutation receipt. Real model quality, unknown historical bills, legacy question ownership and production deployment remain unresolved; no AI improvement or cost reduction is claimed from this patch.
