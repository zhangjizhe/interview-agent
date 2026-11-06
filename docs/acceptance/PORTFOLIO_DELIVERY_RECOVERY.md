# Portfolio project-answer delivery recovery

2026-11-06. Baseline main/agent-lab9d472e93b91accf91950ad3cc264903cffeb85bc. Overall product remains NOT_ACCEPTED.

## Observed failure and source diagnosis

The reported question `介绍 interview-agent 项目` produced two real COMPLETED Runs, one actual model call each, estimated0.0007616CNY each. Both selected the correct public project document but returned no technical notes. Retrieval selected interview-agent/profile/CTI; the reference policy then took WebSocket/WebRTC from global registry order, displacing SSE associated with the first document. The strict renderer rejected missing notes and the hosted adapter displayed a generic terminal failure. This was a presentation/quality rejection after paid execution, not evidence of a provider failure or missing credit.

Source checked: PortfolioAssistantService entry/submit/ensureEnqueued/answer, publicDocumentsFor, technicalReferencesFor, renderProfessionalAnswer, configured runtime persisted output/usage and hosted runLabAgent. Private original input/output and read-only database/Redis receipts are retained outside Git. Actors of public visits are not inferred.

## Repair and boundaries

References now follow retrieved document rank, cover primary references across documents before filling secondary references, and retain the fixed two-reference limit. The exact current OR legacy deterministic reference snapshot is validated, including all text/URLs/fields; arbitrary subsets or changes are rejected. Existing paid Run inputs remain unchanged and are rendered against their actual validated snapshots.

Strict professional rendering/evaluation still rejects missing notes. A separate delivery renderer catches only the typed missing-interpretation result and returns validated verbatim public facts with `evidenceMode=verbatim-public-excerpts`. It never invents an explanation or silently invokes another model. Invalid schema, personal IDs, generated references, unsafe notes or attribution continue to fail closed. Operator diagnostics identify this facts-only condition without logging question/answer text. Raw missing notes remain in the original Run/Trace. A delivered facts-only response is not a professional-quality pass.

Existing published guide1.0.3, prompt/model/runtime budget, release gate, source corpus/hash, public protocol, Site7 source, gateway allowlist, tenant/queue/Run/Trace path and schema remain unchanged. No authentication bypass, publication by database mutation, tool/private retrieval or migration is introduced. No guarantee of all-topic semantic quality or true token streaming follows from this repair.

## Verification

Local full API regression:1264 passed,27 skipped; type/build and scoped lint passed. Initial restricted execution hit loopback-listening permission errors; the complete rerun with local fixture permissions passed. Two actual stored failed outputs recovered offline without model calls while strict missing-note assertions still failed as intended. Ranking, exact snapshot compatibility/tamper rejection, unsafe-output rejection and repeated same-request recovery have explicit regressions.

The clean API image was built and deployed locally after a private PostgreSQL backup; original data mounts and loopback ports were preserved, with no migration. The actual hosted Site7 interface recovered the original paid request: one source,151 characters,6.269 seconds, zero new Run/model call and unchanged daily admission counter. One new reserved actual hosted question completed in9.931 seconds with364 characters/two sources, one actual call estimated0.0010548CNY; stored input and generated notes both used the corrected SSE reference. Original missing-note Runs remain strict-quality failures. Exact corresponding CI/remote merge remain pending at this source checkpoint. Do not treat the prior phase's30-sample result as a new benchmark for this policy. The user-reported production failure is retained as counterevidence to broad quality claims.

Private ledger including three already-existing observed public visits and the one new call: known estimates0.0578616CNY; effective committed/outstanding1.7191044CNY≤3. The existing three visits total0.00266CNY. Historical four unknown costs remain unknown. The one new test reserved0.03CNY before invocation; no additional model test is planned. Estimates are not bills. Live receipts are retained privately; final CI/PR/main results must be reconciled before delivery is called complete. Visual browser inspection was not performed because browser automation is disabled. This is actual hosted protocol evidence, not a new visual or broad semantic acceptance.
