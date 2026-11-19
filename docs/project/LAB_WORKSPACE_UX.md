# Agent Lab workspace and Trace UX

2026-11-17. Local development phase only; not whole-product or public deployment acceptance.

## Source checked

Baseline: `agent-lab` at `7405555946f2f68c921915a8fee03184e702f04b`. Before changes, `main.tsx/ControlCenter` rendered twelve flat navigation items, a global MCP reload action and a shared gate on MCP, dashboard and recorded-import queries. A failure in those summaries replaced navigation even for independently readable Trace/data pages. `RuntimeTraceWorkspace` and `RunInspector` already read protected persisted Run/Trace APIs and filtered diagnostic business content. These existing contracts are retained.

## Implemented locally

- `LabShell`, `lab-navigation` and `useLabNavigation`: three navigation groups, current-page semantics, page explanations, breadcrumb, account footer, narrow-screen disclosure, Escape/focus handling and skip link. Page selection is restored from an allowlisted URL parameter and works with browser navigation; question-processing navigation lock is retained.
- `main.tsx/ControlCenter`: page-specific read dependencies and loading/error states inside the shell. Unrelated summaries no longer block Trace. MCP actions are scoped to the tool page. HTTP401 still expires the session through the existing API/session gate; retryable errors do not discard a valid login.
- `RuntimeTraceWorkspace`: labelled status badges, result count, resettable filters, existing Run ID lookup, selection in the URL, contextual empty/error states. Narrow screens can expand filters on demand and opening a Run scrolls to its inspector.
- `RunInspector`: copy the Run ID with confirmation/failure feedback; existing event ordering, first-failure jump, input/output opt-in and credential/system-message filtering remain. Missing costs remain unknown, not zero.
- `index.html` now declares language, viewport and page title. `bootstrap.tsx` owns mounting; the existing session gate is retained in `main.tsx` and is directly regression tested.

No API/schema/role/provider/prompt changes; no new dependencies. URL state is a UI convenience, not authorization. Existing server ownership/RBAC checks still decide access to bookmarked Run IDs. No model requests were made in this phase. Earlier persona cost reconciliation remains outstanding.

## Actually verified

- 47 relevant component/contract tests across seven files passed, including new shell/navigation/workspace isolation tests and existing Trace/evaluation/data/knowledge/password protections. Following the narrow-screen filter refinement, the 17 affected Trace/workspace tests passed again. Agent Lab build/typecheck, Web typecheck, relevant ESLint, E2E-script syntax and diff whitespace checks passed. Earlier failed TypeScript icon import and an Escape keyboard defect were corrected and rechecked, not counted as passes before correction.
- Browser checks used an isolated loopback static preview with clearly labelled synthetic Run/event data and intercepted APIs. Desktop and390px viewport had no horizontal page overflow or captured page-script errors. Run selection/refresh, first-failure navigation, explicit business-content expansion, hidden test credential, filter reset, navigation/account disclosure and Escape focus were checked. A simulated503 dashboard failure left Trace reachable. These are UI regressions, not real model, real authorization, email delivery, ingestion or whole-product acceptance. An undefined catalog fixture returned404; no claim that catalog storage passed.
- The first preview server attempt was denied socket access, causing a connection-refused browser result; an approved loopback-only preview was started and the same page rechecked. A task expiry produced an unexecuted mobile step; the original page was reacquired. The actual Escape failure found by browser testing was fixed, and the final responsive flow passed.
- Both original controlled5175 tabs showed the login screen, despite the user's login confirmation. No credentials were copied from another browser and no login bypass was used. Real authenticated data/Trace acceptance remains pending.

## Release boundary

The current committed base's Product verification was re-read through GitHub: run43812962156 remains completed/failure. Prior recorded security-audit findings remain blocking; they were not waived or patched in this UI theme. This UX work is still local and has no matching green remote CI. Do not merge or call it a public release. Keep unrelated persona, website, authentication and migration WIP out of a future scoped commit.

Remaining work: real normal-login acceptance of this version; current CI/security resolution as a separate theme; targeted question import/editor feedback, common file/URL/resume ingestion, evaluation/report interactions, and server/domain migration. The user reports Tencent Cloud purchase and is configuring the Cloudflare nameservers; DNS activation and target-Mac access are unverified.

Local frontend update: the verified build is served on loopback5175, with the previous frontend retained as rollback-ux-nov17. HTML200 matched the expected asset; an unauthenticated protected Run request returned401. No backend or data container was restarted. This is the development machine, not the target server or public domain.

Interaction reference: W3C disclosure-navigation guidance informed native buttons/landmarks, expanded/current-page state and Escape focus recovery (https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/). This phase does not claim complete WCAG or assistive-technology certification.
