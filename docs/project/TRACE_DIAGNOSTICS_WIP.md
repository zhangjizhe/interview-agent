# Trace diagnostics — unaccepted follow-up

2026-11-10. Source54efb535016913830d539959b0c41a5fea0a6f31 pushed to agent-lab; PR #71 remains unmerged. Initial local359 tests and live historical Run inspection passed, but push42733160267/job129555915554 and PR42733256507/job129556223075 failed the unchanged lab-external-init-evidence browser assertion: failure reason rendered without role=alert. Raw CI evidence retained through GitHub.

Uncommitted fix now preserved in RunInspector.tsx and agent-lab-trace-workbench.test.tsx: restore accessible failed-Run alert and name read/Trace alerts; add redaction/accessibility regression. Focused20 tests passed. Latest full360 run had359 passed/1 failed: report integration could not find “查看 eval 的逐项证据” while asset lists remained empty. Do not call full suite green or blindly rerun; inspect async fixture/selection behavior and preserve all assertions.

The corrected alert image was NOT built/deployed: automatic approval review could not complete due its usage limit, not a safety rejection or external-model budget shortage. Last actually deployed Trace image is the pre-alert-fix candidate already recorded in the private receipt. No merge, no new model calls. Further Docker build/Git writes requiring unavailable approval remain pending.

User next prioritized question-bank availability. Preserve all independent data-governance/history WIP and the33-file/2-shared-file fingerprints. Do not mix that work into the Trace fix or claim restored ingestion/RAG.

2026-11-10 subsequent question UX phase: approval became available; the alert repair is included in the actually deployed frontend. The unchanged report integration passed8 focused tests and the full isolated candidate passed377. No root cause is inferred for the earlier isolated failure. Exact remote CI/merge remains its own gate; see QUESTION_BANK_UX.md.

Remote follow-up d896e952: PR Product42741794043/job129584513536 failed only after external-init passed. Browser still targeted old builder li/pre nodes; captured state already showed run.failed in the new timeline. Test-only follow-up targets the exact owned Run region and timeline buttons, verifies business output stays collapsed, expands it explicitly before exact output checks, and scopes cancellation status to avoid duplicated summary text. Original provider/ledger, terminal, version, cost and output assertions remain. Requires a fresh exact-source CI result; no blind rerun of d896.
