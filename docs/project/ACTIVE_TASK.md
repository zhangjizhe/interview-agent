# Active task

2026-11-26 — User explicitly requested redeployment of updated articles, continuing the supervised Gemini release.

Canonical article source is the tracked examples/portfolio-site/src/articles.json; its hash differs from both native published copies. Preserve article routes/dates, runtime secrets, original data volumes and rollback. Do not publish arbitrary uncommitted workspace or .workbuddy.

PR82 at420857a remained red: Builder pending test passed after repair; Golden Interview now failed because completed ChatBubble direct text shares its node with new feedback controls. Separate answer text from controls without weakening the exact-text/persistence assertions; require new matching green push/PR CI before release. Portfolio77 build/38 tests and Bubble8 tests passed this round; root lint/Web types passed.

Original server API restarted on its original image after checking zero pending Runs/tasks; readiness200. No candidate app deployed yet. See ../acceptance/REDEPLOY_2026-11-25.md and REDEPLOY_ARTICLES_2026-11-26.md. Whole product remains NOT_ACCEPTED.

2026-11-26 — article content release COMPLETED for the remote Intel Mac native 8787 at 1f7d190, after matching green push/PR CI (45734426232 rerun success, 45734433784 success, all 10 PR82 checks pass, CLEAN). Only articles.json/site-html.mjs were replaced, with backup, rollback script and independent hash/health/route/security checks. Development Mac 8787, PR merge, public tunnel hostname verification and the separate hosted Site remain out of scope and unverified. Next gates: public route verification, single-primary decision, and whether to merge PR82. Whole product NOT_ACCEPTED.
