# Interview workflow UX — local candidate phase

Date: 2026-11-18. Branch: agent-lab, base 7405555946f2f68c921915a8fee03184e702f04b. Uncommitted; no remote delivery claimed. Earlier Lab/persona/auth modifications remain separate WIP.

## Source checked

- `apps/web/src/App.tsx`, `components/AppShell.tsx`: candidate routes, shell and navigation. Room is outside AppShell, so subtracting shell height left unused screen space.
- `pages/HomePage.tsx`: existing target jobs, resume reads/uploads and `/api/interview/start` entry. Old preparation overlay had no focus containment, own scroll or pending-dismiss lock.
- `pages/ReportPage.tsx`: existing detail/evidence reads and new-attempt start. Old catch silently discarded start failures.
- `pages/SettingsPage.tsx`: jobs list/save/activate. Failed or malformed reads could look like a new empty account.
- `pages/InterviewPage.tsx`: existing question presentation, confirmation, answer SSE, resume upload and room drawer. Preserve those contracts and ownership gates.
- `apps/api/src/modules/interview/controllers/resume.controller.ts`: existing PDF/MD/TXT acceptance and 10 MB limit; no Word support promised.

## Implemented

`WorkflowDialog` uses a body portal, labelled dialog, root inert, scroll lock, focus confinement/restoration and visible viewport sizing. Escape/backdrop/cancel are locked during preparation submission. Refs prevent same-tick duplicate start/upload. Home read failures offer explicit read-only recovery. Start receipts require a nonblank string ID.

Report creation failures are visible and advise checking records before retrying. Settings requires an array response, separates pending/error/empty, offers GET retry and serializes save/activate. Resume format/size checks share `resumeFileError`; existing server remains authoritative.

`useVisibleViewport` and `candidate-workflow.css` fit room/dialog to available height, constrain long content, preserve zoom, apply safe-area spacing, 44 px mobile touch targets and 16 px inputs. Room drawer supports inert background, Escape and focus return; answer/upload icon buttons are named. Navigation updates page title/focus and offers a skip link. No new component framework.

## Actual verification

- Web TypeScript and targeted ESLint: exit 0. Docker production Web build: exit 0. Diff whitespace check: exit 0.
- Docker isolated Vitest: 100/100 across Home, resume upload, report, room history/confirmation/upload, training, shell, auth and new workflow file. After adding one new format assertion, the workflow file passed 5/5. This is 101 distinct cases, not 105; no repeated unchanged broad suite.
- Browser with synthetic intercepted API on a separate loopback origin: 7 routes at 320×568, 390×844, 844×390 and 1440×900 = 28 width checks; no page errors or unknown fixture reads. Held start cannot submit twice or dismiss; failure appears in dialog. Failed jobs GET does not show create-empty and retry restores saved rows. Mobile room drawer Escape returns focus, typed answer remains unsubmitted. Settings/room/report screenshots reviewed.
- All fixture business writes stayed intercepted; metrics requests were also rejected by fixture/preview. No real uploads, email, model calls or scoring generated. Synthetic fixtures do not establish backend, authorization, persistence or model/report quality.
- Actual local frontend replaced only `interview-web`, on 127.0.0.1:5173. Image `sha256:1a0074f2a52672479980c424881607144bae71b808afa372fc256adaadccff9d`; HTML 200 matches image asset; anonymous `/api/interview/list` returns 401. Backup `interview-web-rollback-candidate-ux-nov18` retained. API, data volumes and secrets unchanged.
- Normal browser reload confirms real welcome/login page. No session obtained or bypassed. Temporary synthetic page/session cleaned and preview stopped; normal login tab retained.

## Remaining / next phase

Whole product remains NOT_ACCEPTED. Physical Android/iPhone WeChat, actual keyboard and mobile Chrome need device checks. Authenticated real resume → question → answer SSE → completed report and quality evaluation remain unverified this phase. No new Benchmark claimed and no external model test cost incurred.

Creation API has no new idempotency or timeout contract; pending guard stops concurrent clicks, not an explicit retry after an unknown server outcome. Report recommends records inspection. Preparation mode controls can still change while a submitted request waits; payload is captured at submission. Settings unsaved navigation protection and room end-confirmation/native alert refinements remain follow-ups. These were not silently represented as fixed.

Prior CI run 43812962156 failed production dependency audit; this phase did not re-read remote status or resolve it. No commit/push/merge; do not mix earlier historical WIP. Address security CI in its own scoped phase before claiming GitHub delivery/public release.
