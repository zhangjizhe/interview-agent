# Active task

2026-11-02 · QUESTION-CATALOG-ARCHITECTURE / recording readiness, within product reacceptance (**NOT_ACCEPTED**). User authorized architecture fixes and continued development; no deployment or paid replay authorization inferred.

Baseline: remote agent-lab 57b0ac9a0b6ca72c072b69ea469360bc8a047f4e, main deaf006, PR64 open. The runtime prerequisite fixes the isolated administrator quota (finite 200; production Free remains 100) and stops using a Lab Run identifier as an Interview foreign key. Exact-head CI is running; do not infer full acceptance from local tests.

Current work: Interview-owned PostgreSQL canonical question catalog and version snapshots; explicit maintenance-confirmed legacy adoption preserving Milvus source; separate rebuildable vector index; tenant-scoped concurrent-write coordination and honest pending-index receipts; real Lab governance UI and target recording guide. No automatic production adoption, cross-organization sharing, model-quality improvement or human calibration claims.

Delivery: appropriate local tests/type/lint/build and independent review; exact-source remote upload; latest exact-head HTTP/PG/browser/recovery and migrations CI; only then expected-head merge/readback. Local Docker unavailable. Do not delete assertions or omit failed evidence.

Follow-up: actual scorer provenance/Rubrics and independent annotation/calibration, measured regression, case/root-cause loop and controlled telemetry export. Historical external charges remain unknown beyond known0.069285CNY; no paid external calls. Record one stage at a time.
