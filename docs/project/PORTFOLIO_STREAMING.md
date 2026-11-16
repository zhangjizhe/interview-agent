# Personal website validated SSE delivery

2026-11-16. Scope: real incremental delivery for the local personal website through Agent Lab. This is not a token-by-token output claim or a product-wide quality acceptance.

## Cause and implementation

The existing website parsed SSE, but the public assistant admitted a queued Run whose configured runtime called `gateway.chat`. It then polled for a complete JSON result and emitted the entire checked answer once.

New portfolio admissions internally opt into `budget.streamOutput`; this field is not accepted from a visitor. Configured runtime consumes the existing quota-controlled `gateway.streamChat`, explicitly disabling fallback. Normal configured Runs retain their original path. The gateway also rejects a disabled preferred provider when fallback is forbidden.

Private, bounded `model.stream` checkpoints persist real provider output on the existing Run/Trace. Public projections recognize complete JSON units, then reuse the existing source, reference, schema and attribution checks. Exact personal excerpts can appear after source selection; technical notes appear only after each complete note passes those checks. No raw model JSON, signed ticket, private Trace or Run identifier is streamed to visitors. No timers split a completed answer into artificial characters.

`POST /api/portfolio-assistant/chat` negotiates SSE only for an explicit SSE Accept header. Its existing JSON/polling contract and immediate out-of-scope refusal remain compatible. Public stream frames are `meta`, `status`, `sources`, `delta`, and terminal `done` or `error`. Backpressure and viewer disconnect are handled without cancelling or resubmitting an already admitted Run. Signed-ticket reconciliation and request idempotency remain in place. An interrupted or invalid answer does not receive `done`.

Database schema and published Agent prompt/version are unchanged. Usage and estimated cost remain on Run/model-end evidence; missing usage is unknown, not zero. Invalid, truncated, cancelled or over-budget Runs remain failures. This reuses the model gateway and source validator rather than creating an independent model path.

## Verification actually performed

- Targeted offline regression: 143 tests passed across the affected assistant/runtime/gateway/provider suites; three existing opt-in Redis cases were skipped and are not counted as passed Redis acceptance.
- API typecheck, affected-file ESLint, Nest build and Docker image build passed. The initial generic pnpm build command selected an incompatible host Node; the build passed using the installed Node 22 explicitly.
- First local rollout failed because the deployment wrapper duplicated the existing shell `-c` argument. It automatically restored the prior API. After correcting the wrapper, readiness passed and all 211 pre-existing Runs were retained. Old API container and original volumes were preserved; no migration ran.
- Real Tabbit website submission displayed 183 characters at about 4.766 seconds and 305 characters at about 6.271 seconds, ending with the UI's streaming-complete status and no visible error. The one associated real model call completed with six persisted stream checkpoints before `model.end`; usage was 970 prompt and 86 completion tokens, with estimated cost 0.000948 CNY. This is an estimate, not a bill. Private receipts/ledger retain identifiers and previous unknown costs.
- The browser still reports ERR_ABORTED after completed SSE; completed UI and persisted Run were independently checked. Do not replay the request or assert an unverified diagnostic root cause.

## Deployment and remaining boundaries

Local API and the existing website preview were actually tested together. The website's deployed-source adapter already supported this public stream protocol, so no historical website WIP was included in the change.

Public hosted-site acceptance remains blocked by the previously observed TLS access failure. The existing restricted external gateway is JSON-only and has not been upgraded or claimed streaming-ready in this phase. It needs explicit bounded SSE forwarding and verification before claiming public end-to-end streaming.

This delivers validated blocks rather than exposing each provider token. Token-level public output would require a different presentation/validation contract; it is not implemented here. No new formal evaluation report or answer-quality Benchmark was run. Complete admin UI/report navigation, broader resume/RAG work and long-term server migration remain separate unfinished tasks. GitHub verification/merge results must be checked against the exact new commit; earlier green checks do not prove this change.
