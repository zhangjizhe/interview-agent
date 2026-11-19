# Preparation workflow / product-design checkpoint

2026-11-19 · agent-lab · base7405555946f2f68c921915a8fee03184e702f04b + uncommitted working tree. **Overall NOT_ACCEPTED.** This is a focused engineering/interaction checkpoint under COMMERCIAL_PRODUCT_DESIGN_GATE.md, not commercial delivery or a real RAG/evaluation certificate.

## Owning source and contract

Reviewed JobsPage, ResumesPage, WorkflowDialog, preparation styles, ResumeController.uploadResume/getUserResumes, JobReadinessService create/update/activate/normalization and matching tests. Job service returns the owned job record, and activation returns isActive=true for the requested ID. Resume upload parses, stores and then generates supplemental questions; it can cost money. The protected list returns at most10 summaries, with no complete archive/version-selection/original-file contract. Backend ownership, transactions and those limits are unchanged.

## Confirmed findings and repair

| Finding | Resulting behavior / evidence |
| --- | --- |
| Activation announced success for empty/wrong/inactive receipts; edits accepted a different job ID | Validate owned-view record shape and requested ID; new jobs require active=true, activation requires requested active record. Unknown receipts are not success |
| Failed/ambiguous writes could be repeated, including after remount | Per-account pending marker,20-second client wait bound, mutation lock after network/5xx/missing receipt; only an explicit successful GET plus acknowledgement unlocks. Known4xx rejection except408 retains editable fields. Read recovery never replays a mutation |
| A modal recovery message asked users to inspect a page made inert by that same modal | After successful reread, a bounded, keyboard-scrollable, expandable list exposes the returned job content inside the modal. No need to discard the draft to inspect it; failed reread does not unlock |
| Successful save closed while its trigger was still disabled behind a verification GET | Publish the validated returned record to the cache, refresh reads in the background, release controls and restore trigger focus. Browser keyboard reproduction initially fell to BODY, then returned to the New Job button after repair |
| Successful activation replaced its focused action; upload disabled its own focused button | Activation moves focus to the confirmed job heading; upload success/error moves focus to adjacent feedback. Recovery acknowledgement returns to the editable title or file picker |
| Short JD errors were generic, and generic modal focus enumeration omitted text areas | Field association via aria-invalid/describedby and focus on the offending field; include text areas, summaries and enabled focusable controls in the modal loop |
| Upload could use a provisional general role before job reads completed | Pending reference select and submit stay disabled, while file selection remains explicit. Read failure offers a general-role route with an explanation |
| Malformed resume summary fields could crash string rendering | Validate record/text shape before displaying; retain read-failure feedback rather than an empty-library claim |
| Selection/upload/unknown states reused misleading “not uploaded” metadata; notices were distant | Selection, waiting and unknown outcome have distinct text. Success/error sits next to the upload action; confirmed receipt does not wait indefinitely for list refresh |
| Browser marker persistence failure could leave upload frozen before sending | Fail before POST, explain that it was not submitted, retain the file and release controls. Verified with a synthetic storage-quota exception |
| Secondary metadata was small/faint; tablet/landscape controls missed mobile treatment | Readable preparation metadata, visible summary focus,16px form text and44px primary touch controls for narrow/tablet/coarse-pointer/short-window layouts. No zoom suppression |

Pending markers contain operation identity only, not file content. Client abort/timeout is not server cancellation. Acknowledgement is manual reconciliation, not server idempotency or proof of a complete historical list. Browser session/cache changes from the previous phase remain candidate-only.

## Verification actually performed

**Regression:** nine new defect cases all failed on the original implementation. The browser then independently exposed the save-focus defect; its filtered slow-read regression failed before repair (other filtered-out cases were not counted as new passes). Final run: **45/45 pass**, PreparationAcceptance15, PreparationWorkspace13, ResumesPage.uploadReceipt5, CandidateWorkflow5, session-isolation7. Existing tests now wait for the real asynchronous reference-read state and distinguish selection status from a server save receipt; their receipt/no-replay/lock assertions remain. One intermediate run exposed an insufficient asynchronous wait in the new reference-read assertion; it was corrected to await the enabled control, preserving the assertion.

Correct-package Web TypeScript, targeted ESLint, Docker production build and whitespace/diff inspection passed. Included untracked files in whitespace review; ordinary git diff alone does not cover them. No provider Benchmark/Evaluation was run because no model behavior changed. Real model/storage/report quality remains an open product gate.

**Browser:** actual compiled UI with a loopback-only synthetic HTTP service, normal password forms and disposable text file. This is a real browser execution against a synthetic API, not real NestJS/PG/Milvus/model acceptance.

- Create and edit a job, short-JD focus feedback, normal activation, keyboard save/focus restoration.
- Commit a synthetic activation but omit its receipt: no success announcement, mutation lock survives refresh; successful GET plus explicit acknowledgement restores controls without an automatic write.
- File chooser only selects; explicit upload sends once, receives a synthetic ragIngested receipt, rereads the synthetic summary and focuses feedback. No real parsing, embedding or persistence occurred.
- Read503 does not appear as an empty job library; explicit GET recovery returns cards. A deep link is retained across normal login.
- 27 layout probes: jobs, resumes and job editor at320×568,375×667,390×844,414×896,768×1024,1024×768,1280×800,1440×900,844×390. No measured horizontal overflow or dialog/save-action boundary violation. Measured mobile/tablet/landscape form text16px and save target44px. Effective content widths account for scrollbars.
- Targeted final recovery panel: edit commits but returns no receipt; retained draft becomes readonly; successful GET exposes returned company/JD inside the modal. Explicit acknowledgement restores title focus and draft.390×844 and844×390 probes kept dialog/actions inside the visible area. Final isolated service counter:1 write,0 uploads,2 reads, so inspection did not replay the save.
- Sample helper text measured rgb(89,101,121) on rgb(250,249,254),13px; computed contrast5.63:1. This is one measured pair, not a full contrast/accessibility certification.

The27-probe/normal-flow browser bundle was manifestad593a819…; final manifest **sha256:11ae77053423668cd2541aa24dd9496e948212c18e209add1121318f6b401b27** additionally contains the marker-quota failure guard and modal recovery list. Those branches received final regression/build and targeted final-bundle browser recovery checks; unchanged27 probes were not relabeled as freshly rerun. Final mobile proof was captured from the final bundle. An earlier incomplete screenshot was discarded, not treated as a UI verdict.

Both synthetic browser sessions were cleared/closed; viewport override reset; both fixture servers stopped. Unsaved test draft protection correctly prevented navigation until the synthetic edit was explicitly discarded. Real browser sessions, records, API, database volumes, grants, secrets and live5173 were not changed.

## Delivery gates still open

- Real authorized resume parse/embedding/storage readback, job/session confirmation and actual question→answer→report/evidence→training/retest with usage/quality receipts.
- Server idempotency/receipts and transactional cleanup, cross-device concurrent writes, historical ownership and full resume archive/file/URL knowledge contracts. Client locks do not replace server guarantees.
- Physical iPhone/Android WeChat and mobile Chrome, native keyboard/composition/file-picker, supported desktop engines, assistive technology and whole-site visual/state acceptance. Viewport probes are not device certificates.
- Storage-denied application bootstrap/auth beyond the tested upload preflight, mixed bundle refresh/relogin, actual two-user server authorization and release/rollback.
- Latest exact-source CI, reviewed release SHA, scoped commit/push/merge, target HTTPS/backup/reboot acceptance. Remote status was not refreshed. No deployment/commit/push/merge this phase. Earlier uncommitted work remains separate and unapproved for bulk staging.
