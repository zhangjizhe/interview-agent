# Interview preparation hub redesign

2026-11-19 follow-up: receipt/recovery/focus/readability candidate and exact evidence are in ../acceptance/PREPARATION_PRODUCT_DESIGN_ACCEPTANCE.md. It is not deployed or real RAG accepted; earlier observations below remain historical.

2026-11-18. Branch agent-lab; base 7405555946f2f68c921915a8fee03184e702f04b. Local uncommitted phase; earlier unrelated WIP preserved. Whole product remains NOT_ACCEPTED.

## Source checked / problem

`App.tsx` routed the candidate's jobs to `/settings`; SettingsPage placed account security above job editing. HomePage upload required an active job and exposed no stable library view after a resume existed. ResumeController still supports upload-resume and resumes/:userId; ResumeRAGService still embeds a parsed summary into Milvus and verifies the insert by strong readback. Function discoverability was missing; backend storage was not deleted by this frontend phase.

`ResumeController.uploadResume` parses, stores, then generates supplemental questions through the existing model gateway. This is a potentially paid action. File selection must not submit. `getUserResumes` enforces self-user access and returns at most 10 records. `searchByUser` sorts only that returned window; neither a complete history nor a globally latest/selected resume is guaranteed. InterviewLifecycleController currently reads one stored resume for the session. No resume selection, original-file download, deletion, full-document chunk archive or pagination contract is implemented here.

JobReadinessService create/patch/activate uses owned job records and transactions. Empty optional PATCH strings normalize to null; omitting those fields preserves old values. Frontend now sends empty strings when the user clears an optional field. JD requires 20–12,000 characters if nonempty. Jobs do not call a model in this path.

## Implemented

- `/prepare` redirects to `/prepare/resumes`. PreparationLayout provides resumable navigation between My Resumes and Target Jobs, with practice entry.
- ResumesPage: always-visible picker and drag/drop, format/size validation, explicit upload-and-parse, independent of having a job. Choose current/saved/general parsing reference without activating a different job. Inspect saved summary and skill tags, search only loaded records, refresh reads, distinguish read errors from empty.
- In-flight upload guard, 90-second client wait bound, retained unresolved marker scoped to account in sessionStorage. Aborting or leaving does not prove server cancellation; refresh never replays parsing. An explicit user acknowledgement is required to unlock an unknown result. Marker contains no file content. Success requires both an HTTP success and boolean ragIngested=true. No automatic write retries.
- JobsPage: current/saved cards, expandable JD, visible activate/edit, modal creation/editing, required/optional guidance, pending guard and dirty-close confirmation. Field clearing fixed; save receipt must contain an ID.
- `/settings` now contains account settings only; password actions are collapsed until requested. Existing auth endpoints/verification behavior unchanged. Account entry is outside primary training navigation.
- Shell/home: primary workflow is Home → Preparation → Practice → Records → Training. Home always links to resumes and jobs, including when already populated. Preparation modal locks mode controls and hides escape links while a start/upload waits.
- Shared visual hierarchy, cards, typography, restrained actions, responsive layout and keyboard/focus behavior reuse React, TanStack Query and WorkflowDialog. No new dependency, schema, API, grant or provider implementation.

## Actual verification

- Web TypeScript, targeted ESLint and final Docker Web production build: passed. Diff whitespace check: passed.
- 64 distinct related regression cases across nine files passed across rounds. First run 63/64: the success test observed the earlier processing status; corrected it to wait for the final receipt, preserving the success assertion. Final 18/18 workflow/preparation checks passed after runtime refinements; remaining 46 unrelated-to-final-refinement cases were not needlessly repeated. No zero-test/stalled runs counted.
- Isolated browser origin with local synthetic API: create job → dirty close → continue → save → current-card feedback; resume picker → selected metadata without request → explicit upload → receipt → refreshed summary; stored summary expansion; account security collapsed; mobile 320×568/390×844 and landscape 844×390 plus default desktop views inspected. Measured narrow layouts did not exceed viewport (305/305, 375/375 CSS widths after scrollbar; landscape 829/829). Short job dialog measured 544px high with 792px scroll content; actions reachable. This is limited browser verification, not a full matrix or physical WeChat acceptance.
- Synthetic upload did not call real parser, embeddings or storage. It tests browser behavior only. Temporary synthetic session cleared by a dedicated cleanup page and preview closed/stopped; no test resume inserted into the user's real account.
- Local `interview-web` replaced on loopback5173, image `sha256:01c8bb3197e5373c5ff59a89a5f90be1da61948cd8ed93670ad5b5f7164b70af`. HTML200 matched asset and anonymous interview list remained401. Old container retained as interview-web-rollback-preparation-nov18; API, volumes and secrets unchanged.
- Actual already-signed-in browser: account settings displayed independently with security collapsed; preparation redirect, upload UI, real empty resume list and empty jobs read successfully. No credentials read, login bypass, real writes, password/mail or model calls performed.
- Read-only strong Milvus aggregate: resumes collection exists, 9 stored rows total, 0 under the current signed-in account. This proves other-scoped records still exist, not that they are the user's missing originals. No content/owner IDs exported, reassignment or cross-account access exposed by the UI.

## Remaining boundaries

Historical resume/account/storage reconciliation is still required. Preserve all rows and data volumes; do not assign other owners' records to the current user without verified provenance and authorization. Full real upload → paid parsing/embedding → persistence → session confirmation → answer/report acceptance was not newly run. Current account has no target job/resume; the user can now supply them through fixed visible entries.

Original-file/version management, full archive/pagination and general file/URL knowledge RAG require a separate backend contract and delivery phase. This page restores access to the existing resume pipeline, not those unimplemented capabilities. Auth session and physical Android/iPhone WeChat behavior remain separate acceptance.

No external model test spend incurred this phase. Prior unresolved remote CI security audit block and historical WIP remain; remote state was not refreshed and no commit/push/merge claimed. Next phase: verify provenance of historical records and complete real user preparation flow, then separately resolve CI before remote delivery.
