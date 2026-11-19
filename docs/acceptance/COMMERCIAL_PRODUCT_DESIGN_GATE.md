# Commercial product and design acceptance gate

2026-11-18. User requirement: product, interaction/visual design and supported-device acceptance must pass **before delivery**. Local builds, fixture flows and screenshots are provisional evidence. Current overall verdict: **NOT_ACCEPTED / do not deliver as commercially accepted**.

This adds a stricter gate to PRODUCT_REACCEPTANCE_PLAN.md; it does not replace the feature inventory or relabel old results as current passes. No promise of zero defects on all future devices can be evidenced; the declared support matrix must be tested, with no known blocking defects or unexplained exclusions in that matrix.

## Acceptance scope and criteria

| Gate | Required evidence / rejection condition | Current disposition |
| --- | --- | --- |
| Product contract | Published scope, route inventory, user goals, inputs/outputs, ownership, costs, error/retry semantics; no visible promised capability silently missing | NOT_ACCEPTED: capability inventory exists, missing archive/knowledge and history contracts remain |
| Candidate golden journey | Normal login→job/JD→authorized resume upload→real parsing/storage readback→confirm presented resume→question/answer/follow-up→finish→persisted report/evidence→training/retest; API/storage plus browser receipts for the same version | NOT_ACCEPTED: no new complete real journey/evaluation evidence |
| Trust / data safety | Cross-user/session/tab/late-response isolation, no wrong-account cache, explicit consent for irreversible or paid action, server idempotency and appropriate transactional state checks | NOT_ACCEPTED: session isolation candidate locally verified, not deployed/real-server accepted; other mutation/history gaps remain |
| Interaction design | Navigation matches destination, each task has a clear principal action, action consequences disclosed at decision point, progressive disclosure, retained drafts, distinguish pending/error/empty, recovery and back/refresh/deep-link behavior | NOT_ACCEPTED: local repairs only; whole inventory still requires runtime expansion |
| Visual design | Consistent typography/spacing/color/control tokens; readable dense/empty/long/error states; restrained hierarchy; aligned controls; no clipping, overlap, misleading disabled controls or competing principal actions | NOT_ACCEPTED: no whole-product signed visual review across all states |
| Accessibility | WCAG2.2 AA target; keyboard/focus/labels/status/reflow/contrast checks, assistive technology review; minimum44px project touch target, mobile form16px, text enlargement200% and reflow320 CSS px | NOT_ACCEPTED: full automated/manual evidence missing; project44px rule is stricter than the AA target-size minimum, not a claim about WCAG wording |
| Desktop engines | Chromium/Chrome and Edge, Safari/WebKit, Firefox on supported desktop OS; critical paths/refresh/back/multiple tabs/slow network errors | NOT_ACCEPTED: current Chromium evidence is partial; not all engines/platforms checked |
| Mobile devices | Actual iPhone+WeChat, Android+WeChat, mobile Chrome; portrait/landscape, safe area, native keyboard/composition, scroll/focus/file picker, dialog and network interruption | NOT_ACCEPTED: viewport mocks are not physical-device evidence |
| AI quality | Frozen input/reference sources, real model/version, grounded output/refusal/follow-up/rubric consistency, traceable report, bounded spend and cost reconciliation; explicit quality thresholds agreed in dataset contract | NOT_ACCEPTED: no new quality Benchmark; ordinary successful chat is not sufficient |
| Release/recovery | Exact source SHA, image/config contract, latest corresponding CI green, reviewed diff/secrets, isolated permissions, persisted data retained, backup/restore/reboot/rollback and target HTTPS deployment | NOT_ACCEPTED: large uncommitted WIP and unresolved CI/deployment gates |

## Support matrix and evidence rules

Required candidate responsive review:320×568,375×667,390×844,414×896,768×1024,1024×768,1280×800,1440×900 plus mobile landscape and virtual keyboard-visible layouts. Dimensions are only layout probes. Browser engine emulation, OS device simulation and physical devices must have separate labels. Do not turn one screenshot into a device compatibility certificate.

Every route/template must expand normal, pending, success, empty, filtered-empty, read failure, write rejection, unknown outcome, long content, permission/session expiry and keyboard states where applicable. Every record includes version/image, source branch, account category, deterministic steps, expected/actual, API/storage evidence, DOM/screenshot, date, severity and verdict. Synthetic data stays on an isolated origin; do not put synthetic tokens or records in a real user account.

P0/P1 defects, broken principal journeys, wrong-account data, unconfirmed writes presented as successful, unavailable recovery, clipped main controls or missing required device evidence block delivery. Design rejection cannot be waived solely because lint/type/build passed. NOT_SHIPPED requires removing promises, not hiding a failing feature to inflate pass rates.

Use PASS only for the precise tested item and version. Overall PASS requires all in-scope product/design/device/release gates PASS and no required BLOCKED/unknown item. No unsupported percentage, commercial maturity score, performance/learning-effect claim or new costs recorded as zero.

## Reference systems (official sources checked2026-11-18)

- [W3C WCAG2.2](https://www.w3.org/TR/WCAG22/) supplies testable accessibility criteria. This document sets targets, not a certification.
- [IBM Carbon button guidance](https://www.carbondesignsystem.com/building-blocks/core/components/button/guidelines): distinguish navigation/action and primary/lower-emphasis/danger behavior. Reuse principles without copying brand decoration or importing a new framework.
- [Atlassian message design](https://atlassian.design/foundations/content/designing-messages/): distinguish information, errors, success and warnings, with useful next actions.
- [WAI dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) and [form feedback](https://www.w3.org/WAI/tutorials/forms/notifications/): focus, modal context and clear recovery feedback.

Visual direction: quiet neutral surfaces, a restrained brand accent, an explicit type/spacing scale and clear task hierarchy. Beauty must coexist with truthful data, readable text, accessible focus and complete states. No full restyling pass can substitute for a working product journey.

## Current execution

Focused first repair: authenticated-session query/data lifetime, including expiry→different login, late old reads, same-tab session replacement and cross-tab login/logout. Preserve backend auth/RBAC and do not copy credentials between origins. Other open gates remain in docs/project/TASKS.md and INTERVIEW_UX_PRODUCT_AUDIT.md. A progress checkpoint is not product delivery.


Focused execution checkpoint: [Web session/cache evidence](SESSION_CACHE_ISOLATION.md). Final75 related tests, types/lint/build and final-bundle synthetic browser tab-switch check passed. Candidate was not installed at the real entry. Native iOS simulator automation timed out before visiting the site; physical devices/other engines remain missing. These bounded checks do not change the overall NOT_ACCEPTED verdict or waive the table above.


2026-11-19 focused checkpoint: [preparation workflow](PREPARATION_PRODUCT_DESIGN_ACCEPTANCE.md),45 related tests plus bounded synthetic normal/recovery/layout evidence. Candidate only, with exact browser/build version limits preserved. No real backend/model/physical-device acceptance, no deployment or refreshedCI. Overall NOT_ACCEPTED remains unchanged.
