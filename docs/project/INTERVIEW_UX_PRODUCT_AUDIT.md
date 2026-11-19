# Interview UX and product audit

2026-11-18 · agent-lab, base7405555946f2f68c921915a8fee03184e702f04b · local working-tree phase. Product remains **NOT_ACCEPTED** overall. This is an interaction review with bounded repairs, not proof of model quality or commercial readiness.

## Review method

Walk the candidate's normal-session paths and compare visible behavior with owning React routes, queries, mutation receipts and NestJS entry points. Distinguish source-checked / real read navigation / isolated synthetic verification / not verified. No invented usability score, completion percentage or user research outcome.

Review criteria: clear location and next action, progressive disclosure, explicit action consequences, pending/error/empty separation, recoverable state, keyboard/focus and narrow-screen behavior. Reference guidance checked on2026-11-18: [W3C WAI user notifications](https://www.w3.org/WAI/tutorials/forms/notifications/) and [APG modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). These guide this review; full WCAG conformance was not assessed.

## Concrete findings and local repairs

| Priority | Observed problem | Effect | Repair / evidence boundary |
| --- | --- | --- | --- |
| P1 | `/practice` reused the Home overview and automatically opened preparation only if a job existed | Navigation did not lead to the promised task; missing-job users saw another dashboard | Dedicated practice view, prerequisite cards, explicit modes and skill selection, no automatic creation. Observed before/after with a real session; filled mode interaction tested with fixtures |
| P1 | Training with no job was a bare sentence | No direct path forward | Heading, explanation, job setup and records links. Real missing-job page rechecked |
| P1 | Completed-record “open evaluation” navigated to the room | A report action reopened an unrelated task surface | Direct `/reports/:id`; tested route and isolated browser report/evidence navigation |
| P1 | Pending, malformed or failed list data could look empty | Users could infer that historical data was gone | Array validation and distinct pending/error/confirmed-empty states; GET retry. Report detail identity/status and evidence shape now validated too |
| P1 | Empty-room delete submitted immediately | Irreversible mutation before a clear choice | Named confirmation dialog, retain/cancel, pending ref guard, explicit deleted=true receipt. Only fixture/unit calls tested; no real records deleted |
| P1 | Evaluation retry posted directly | A possibly paid operation was easy to trigger unintentionally | Explicit confirmation and cost context; verify report ID/interview association; pending guard. No real model retry |
| P1 | Unknown start outcome allowed ambiguous repeat creation | Duplicate quota/use or navigation uncertainty | Account-scoped unresolved intent, no automatic POST retry, records verification and explicit unlock. Client waiting is bounded; abort is not server cancellation |
| P1 | Reused Home component retained errors across view changes; late start response could navigate later | Wrong feedback or an unrelated delayed jump | View lifetime scope, cleanup and late-response guard; browser reproducer plus regression |
| P2 | Single-skill setup had no explanation when no skills were available | Disabled start with no recovery | Explain loading/error/no-skill, GET retry, job editing or full-simulation alternative; reset skill selection on job/profile change |
| P2 | Multiple equally strong start actions and nested report main landmark | Competing hierarchy and redundant navigation semantics | Subordinate dashboard guidance and one AppShell main landmark; no new design system/dependency |

The previous preparation phase remains in [INTERVIEW_PREPARATION_REDESIGN.md](INTERVIEW_PREPARATION_REDESIGN.md): independent resume/job workspace and account settings. Its historical verification is not reclassified as new testing here.

## Product capability inventory

| Capability | Owning source / actual entry | Current evidence and gap |
| --- | --- | --- |
| Login, registration, recovery, password change | Web AuthGate, SettingsPage; auth endpoints | Existing normal session used for read navigation. No fresh registration, email delivery or password change this phase; do not claim SMTP repaired |
| Target jobs / JD | PreparationLayout, JobsPage → skill-profile controller / JobReadinessService | CRUD/activate entry and transaction source checked in preparation phase; current real account still lacks a target job. New real write was not performed |
| Resume upload / stored context | ResumesPage → ResumeController / ResumeRAGService | Current normal-session practice page now reads a saved resume, unlike the earlier snapshot with zero. This is a nonempty read, not proof of upload/embedding quality. Existing pipeline parses, embeds/stores summary and generates supplemental questions |
| Complete resume management | Current list capped at10, no selected-version contract | Full archive, original-file retention/download, deletion and reliable version selection are not implemented by this UI. Prior9 other-scoped records are a historical aggregate, not proof they are the user's missing originals |
| Full / single-skill practice | HomePage practice view → owned interview start | Entry, modes, preconditions and receipts tested without a provider; actual initial question, natural follow-up and semantic relevance remain a real acceptance task |
| Interview room / answer stream | InterviewPage, useInterviewStream, presentation/confirmation services | Existing path preserved; this phase did not generate a new interview or answer. Native end/error alerts and finish flow still need a dedicated review |
| Reports / evidence | ReportPage → interview detail / evidence, end/report services | Fixture report/evidence rendered and correct route verified. Real scoring validity, repeatability, missing-evidence quality and comparison remain unverified |
| Readiness / skills | Home readiness; JobReadinessService and skill-profile controller | Do not estimate a score without evidence. No independent candidate skills/trend page currently routed. Long-term improvement claims unsupported |
| Training / retest | TrainingPage → recommendation complete/refresh/start | Recovery/receipt/scope tests preserved; missing-job dead end repaired. Actual assessment→recommendation→practice→retest→change remains unaccepted |
| Candidate knowledge / question library | Candidate `/question-bank` redirects Home; no candidate knowledge route | This is not a complete personal file/URL RAG experience. Lab governance is a separate product surface, not proof of a restored candidate knowledge library |
| Agent Lab governance, evaluation, Trace | Separate local5175 | Root HTML200 checked only in this phase. Permissions, evaluation reports, trace recovery and lifecycle were not newly accepted by this review |
| Personal website assistant | Separate local5174 | Root HTML200 checked only. No fresh answer, SSE, source, persona or public end-to-end test; previous evidence remains separately scoped |
| Release / new Mac / domain | Compose, gateway and Mac runbooks | Local frontend switch only. Target hardware, DNS/HTTPS, public isolation, backup/restore, reboot and exact CI remain separate gates |

## Verification performed

- TypeScript, targeted ESLint, final Docker Web build and diff whitespace check passed.
- **76 distinct related regression cases across rounds**. Initial run74 cases:73 passed, one new evidence test used the wrong accessible button name. Corrected that locator without dropping the recovery assertion. Added two more skill/lifetime cases; final18 affected cases passed. Unchanged remaining cases were not needlessly repeated. The renamed resume receipt test retains all five success/invalid/forged-flag cases against the new actual upload entry.
- Isolated browser: modes and skill gate, intentionally rejected synthetic start and unresolved lock, records search, direct report and evidence, and recovery on returning to practice. No real interview, report, delete, email or upload mutation.
- Practice, records and report at320×568,390×844,844×390:9 width checks without horizontal overflow. Effective widths reflect scrollbar differences. Screenshots reviewed; no physical Android/iPhone WeChat, WebKit or native keyboard certification.
- Actual signed-in browser before repair reproduced the duplicate practice dashboard and dead-end training sentence. After local switch, distinct practice heading and live prerequisites read; a saved resume is now visible and job setup is still needed. Training offers actionable links. No credentials read/copied or auth bypass.
- Local Web image `sha256:95fbbf3f7087885e3ba680e44519281103625c6a8aebea422d61b5f3e0315a74` served HTML200 on loopback5173; protected list without session401. Rollback `interview-web-rollback-journey-nov18` retained. API, database/volumes, grants and secrets unchanged.
- Roots5173/5174/5175 returned200. This is entry availability only. Synthetic origin/session was cleared and closed, temporary preview stopped, normal practice tab retained.
- No provider calls or new evaluation/benchmark were run by this review. No real quality/cost-effectiveness metric is claimed. No commit/push/merge; prior safety CI issue remains unresolved and remote status was not refreshed.

## Prioritized next delivery gates

1. Real candidate journey with owned job and real authorized resume: parse/storage readback→confirm presented resume→initial question→answer/follow-up→finish→report/evidence→training/retest. Record provider usage and unknown costs; use a bounded acceptance case and do not replay historical failures blindly.
2. Historical account/storage provenance and resume version contract. Preserve all data; current nonempty resume read does not reconcile other owners' historical records.
3. Mutation reliability: frontend confirmations/intents are not backend idempotency. Start/report/upload/job unknown outcomes and cross-entry retries require a server-level contract. Current delete controller enforces ownership but does not revalidate “still empty” before hard delete; prevent stale cleanup from deleting a now-answered record in a separate guarded backend phase.
4. Session/cache follow-up: the isolated synthetic expiry→B login regression reproduced the risk. A session-scoped cache/snapshot/tab candidate now passed75 related cases and final-image synthetic two-tab checks; not deployed or real backend accepted. See ../acceptance/SESSION_CACHE_ISOLATION.md for exact limits. Security CI/dependency audit remains its own scope before public delivery; then normal-session Lab permissions/evaluation/Trace checks. Do not infer latest green status from local tests.
5. Knowledge/file/URL retrieval and complete resume library, skills/progress and comparable report evidence; explicit API, isolation and evaluation contracts before adding promises in the UI.
6. New Mac, domain/HTTPS, restricted ingress, backup/recovery and reboot verification. Local HTTP200 is not public deployment acceptance.
