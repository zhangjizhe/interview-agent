# Agent Lab mobile layout repair

2026-11-17. Local frontend phase; overall product remains NOT_ACCEPTED.

## Source checked

Baseline agent-lab at7405555946f2f68c921915a8fee03184e702f04b plus preceding local workspace-flow changes. The default path remains React/NestJS. Existing styles.css/lab.css/visual-theme.css and individual workspace styles used overlapping typography/action-size rules, fixed minimum tracks and unbroken identifiers. The earlier390px desktop-style viewport check did not cover mobile layout-viewport expansion or all pages/content states.

This phase's Chromium mobile metrics reproduced375px pages expanding to485–586px on overview, questions, evaluation, experiments, release, audit and operations. Small buttons existed across workspaces. Further checks identified unwrapped dataset identifiers in summary small text, internal Trace-card overflow and more-specific old rules overriding44px targets. Failures were retained and fixed rather than hidden by root overflow clipping.

## Implemented locally

- mobile-layout.css is loaded last, with shared min-width, wrapping and responsive constraints for all12 workspaces. Long identifiers, URLs, cards, grid children and native controls fit the available content width. The static architecture illustration reflows vertically on mobile. No global overflow-x:hidden workaround.
- Touch actions have44px minimum targets; mobile text inputs/selects/textarea use16px. Specific old question/Trace/login action rules are overridden explicitly. Smaller explanatory text is readable while desktop density is retained. Viewport-fit and safe-area spacing are provided; user pinch zoom is not disabled.
- LabShell uses a sticky mobile header and independently scrollable drawer with backdrop, close/current-page selection, Escape, focus loop, background inert state and resize cleanup. Long navigation remains reachable on short landscape screens.
- AccountSecurityDialog uses a body portal outside the inert shell, scroll/focus restoration, Escape protection while pending, keyboard focus containment and visualViewport height/offset listeners. The light palette matches the console. page-scroll-lock shares ownership so navigation/dialog handoff cannot accidentally unlock the page. No password/email API or auth-policy change.
- Added six behavior regressions and a reusable isolated mobile layout fixture/runner (e2e:mobile). Runner binds only loopback5186 and blocks undefined API calls; fake ADMIN state belongs exclusively to static UI fixtures and never establishes real authorization. The new runner's CLI entry itself was syntax checked, not separately launched against a headless browser in this phase; the fixture/check programs were executed through Tabbit.

No schema, model, provider, prompt, pricing or backend change. No real mail, ingestion or paid model requests were made.

## Actually verified

- Final Chromium mobile-layout matrix:320×568,360×800,375×667,390×844,393×852,412×915,430×932,768×1024,844×390;12 workspaces each =108 checks. Touch emulation and mobile device metrics with requested DPR3 were used. No root horizontal expansion, undersized visible action targets, inputs below16px, captured page-script errors, unknown fixture routes or unexpected writes. A later CSS-only login-button specificity correction does not match shell pages, so the unchanged108 shell cases were not repeated needlessly.
- Desktop1024×768 and1440×900 checked all12 workspaces without width failure before the auth check exposed40px login buttons. Those24 checks were completed within that program; its overall receipt failed at the later auth assertion, so it is not a wholly successful combined run. After correction, login/register/forgot-password at320×568,390×844 and844×390 passed all9 checks without submitting auth requests.
- Final expanded states: Agent version editor; password form; question file selection (not uploaded) and URL entry (not imported); Trace filters/content; evaluation asset configuration; collection/record form; landscape navigation. All8 checks had no page width/visible target/font failure, captured script error or unexpected write. Menu-to-dialog focus/scroll restoration and reduced375×360 visible area were checked. The only synthetic email challenge response was intercepted locally; it proves no actual delivery.
-148 UI tests in nine relevant files passed in an isolated no-network Docker container with explicit worker bounds. Seven additional password/email-form regressions passed. The six newly added behavior tests cover scroll-lock overlap, inert background, current-page drawer close, Escape/focus restoration, visual viewport updates and portal handoff. Assertions were retained. A fireEvent test was corrected to model browser focus before click; initial parallel container execution had two mock-loading timeout failures, then bounded workers passed the original contracts. One maxWorkers-only run returned zero tests; it is explicitly not accepted as a pass. Final accepted reports contain148/148 and7/7 actual tests.
- Web typecheck, relevant ESLint, new script syntax, diff whitespace checks and Docker Agent Lab typecheck/production build passed. Native Vite/Vitest processes stalled (including a bounded Node22 attempt); they were not counted as passes. Only matching task processes were stopped. Docker provided final build/regression evidence. An initial temporary Dockerfile build failed on an unrelated protected temp-directory xattr; moving that temporary Dockerfile into its own directory allowed the tests to execute. A browser helper-import request exceeded its deadline; the retained page was inspected and the equivalent fixture body was then executed in the task evaluator. No product mutation was replayed.
- Actual local frontend switch:5175 HTML200 matched index-CwZAG0hd.js, anonymous protected API remained401. Previous frontend retained for rollback-mobile-nov17. Backend/data containers were not replaced, no volume was deleted and no secret was changed. Final image manifest fecd0872394a79d1330908cf414292f6965d20849d2050f23b7147b6319a1cbc.

## Boundaries and handoff

This is Chromium emulation at phone dimensions, not physical iPhone/Android, Safari, WeChat, assistive technology or actual software-keyboard certification. An optional device/browser question is pending. Real authenticated data acceptance remains unverified because the controlled normal5175 tab showed login. No whole-product, RAG ingestion or model-quality acceptance is claimed.

GitHub base's prior recorded Product verification failure remains a release blocker; this source has no matching green remote CI and was not committed/pushed/merged. Preserve unrelated earlier WIP. Next: apply any concrete user device evidence; physical Safari/WeChat and keyboard checks; normal-login real-data acceptance; separate dependency/CI and server/domain phases. See LAB_WORKSPACE_FLOWS.md for preceding lifecycle and runtime boundaries.


## 2026-11-18 WeChat and mobile Chrome follow-up

User clarified that both Android and iPhone WeChat are affected and also uses mobile Chrome. No specific OS/browser versions, failing URL or physical-device repro was supplied. The actual device root cause remains unconfirmed.

Source change: request interactive-widget=resizes-content in viewport metadata, retain visualViewport-based dialog fitting, add window.resize/innerHeight fallback when that API is absent, ignore invalid zero/nonfinite heights, clamp negative top offsets, and provide focus scroll clearance. No browser-name/UA detection, zoom lock, backend/auth/schema/model change.

The Chrome team's official viewport-resize article was checked2026-11-18 (article updated2022-10-28): it describes the Android Chrome108 resize change, resizes-content opt-in, and explicit WebView/iOS scope caveats. It does not establish the installed WeChat kernels or current physical device behavior. Source: https://developer.chrome.com/blog/viewport-resize-behavior .

Actual follow-up validation:23 relevant UI regressions passed in no-network Docker, including two new missing/invalid viewport cases and existing navigation, password/email protections. Web typecheck, targeted ESLint, production Docker typecheck/build and diff checks passed. Browser evaluator ran three synthetic keyboard models: layout390×844→390×320; visual-only height320/offset90; window-only fallback height320. In all three, the focused code input was within the visible dialog, close restored menu focus/body scroll, and844×390 question-URL entry had no page/target/font failure. No captured script errors, unknown fixture routes, real email, import, model call or unexpected writes. The same keyboard-check body is retained in the reusable mobile fixture/runner; standalone CLI was syntax checked, not separately executed. Earlier unchanged108 layout/155 regression evidence was not represented as rerun.

Follow-up frontend local deployment and physical-device boundary are recorded in CURRENT_STATE/THREAD_HANDOFF. Physical Android/iPhone WeChat and Chrome remain unverified; no native WebKit/WeChat engine or real OS keyboard was driven by this browser simulation. Prior remote CI/public deployment/real-login blockers remain. No source commit/push/merge in this follow-up.
