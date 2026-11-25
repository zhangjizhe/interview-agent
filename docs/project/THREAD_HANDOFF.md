# Thread handoff

Active: user-requested Nov25 redeployment of Gemini code/copy/articles. See ACTIVE_TASK.md and ../acceptance/REDEPLOY_2026-11-25.md.

Use agent-lab; initial pin dfcf429 matches remote. Never stage unrelated .workbuddy, private runtime files or logs. Latest CI45531537241 failed only isolated Builder browser pending lock at lab-builder-run-context-evidence.mjs:109. Source disables the selector through start.isPending; wait for batched rendered state before asserting, keeping held receipt and all freeze checks.78 component tests passed; fresh browser proof pending.

Current production-like writable stack is on development machine. Remote Intel machine is an old rehearsal (restored Nov18 DB), not confirmed primary. Preserve all volumes and runtime secrets. Do not run scripts/deploy/deploy-mac.sh blindly: its rollback mode only prints instructions, and it neither pins a reviewed SHA nor updates the portfolio.

Prior billing reconciliation deferred at user request; not resolved by deployment. All previous limits retained in archive/release-before-nov25/. Whole product NOT_ACCEPTED.
