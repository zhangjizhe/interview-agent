# B1a runtime adapter registration and dispatch

Scope: B1a, baseline0698d16. Overall NOT_ACCEPTED; complete B1 remains unfinished.

Code checked: AgentRuntimeService.runAgent previously selected legacy versus configured execution with inline string branches. Construction-time RuntimeAdapterRegistry now snapshots/freeze manifests, rejects duplicate/invalid IDs, resolves known adapters and checks required message capability. Nest registers a factory wrapping the existing interview-multi-agent and single/finite implementations. runAgent uses resolve→prepare→execute; domain workspace/version validation, admission restrictions, Run creation/completion/failure/CAS, Trace and persisted resource records remain owned by the service. Direct manual construction retains a builtin fallback for compatibility.

Legacy wrapper preserves enable check timing, prompt/session/cache arguments. Configured wrappers delegate unchanged prepare/execute, preserving asset fingerprints, budget, cancellation, provider and accounting logic. Queue admission/registration validators and startExternalRun remain their existing separate paths. No API/schema/permission/prompt/model change, dynamic code loading or automatic fallback.

Capabilities currently declare only message support, not a general tool/knowledge/security sandbox. Adapter output remains the existing graph-result shape, not a new normalized event/final-output schema. The new internal context is not the full proposed runtime envelope. Registry replacement requires trusted server construction/DI; no public plugin or custom-engine install UI is delivered.

Verification:

- Registry/builtin plus runtime/external-init/bridge targeted suites27/27, relevant ESLint/API typecheck/build pass. Two injected synthetic engines are exercised through actual runAgent lifecycle; unknown adapter is rejected before Run creation.
- New private fixture registers two deterministic engines in a built service using tenant-scoped Prisma and real TraceEventService; checks actual persisted output/version/Trace and authenticated GET. The real Nest HTTP entry rejects an unregistered engine without a new Run. Usage ledger must not grow.
- Existing actual configured single/finite API+browser chains verify the Nest builtin factory in use. New browser helper verifies two synthetic engine histories/output/fixed versions/Trace, with no model/ledger increments.
- First complete new-image chain exits0: actual Nest/PG/API89/89, builtin single/finite execution and browser regression, two synthetic registered histories, strict PostgreSQL schema/row-multiset/sequence equality and actual Milvus question/Qdrant vector-payload restore pass. API image `sha256:fe3f6b142089fdfac3f018cf53a08f0dc7c999e39ad9fb51f10e64583f506dd3`; unchanged Lab image `sha256:29778e0b2050a4e60002f46dfa68c865acc283930e41444abace0939e0b50d0a`. Added scenario has no provider/ledger increment. Independent final review found no new blockers; script syntax/diff checks pass. B1a limited checks passed; PR46 exact head c79b11a6175dfe08e532aecf92c5599be5ab6569 passed all six checks and merged as 5fba68332751081818f0506dcb64c3632fd5dc37; remote main/agent-lab verified.

Synthetic implementations are fixtures, not real model quality or deployed production alternatives. Real quality, full candidate chain, session snapshots, required-policy/optional-telemetry separation, database-outage orphan reconciliation, old question ownership and unknown bills remain unresolved. External cost0; fixture model work elsewhere is retained.
