# Active task

2026-11-25 — Deploy and synchronize the Gemini updates (copy, documentation, articles and application changes), explicitly requested by the user.

Source pin before release repair: agent-lab dfcf429c9c98ffa140bbeb398b341f8d0559a2f6; origin/agent-lab matches. Origin/main is 3c4f80b. Only unrelated untracked .workbuddy remains excluded.

Gate: fix the actual latest CI blocker, retain assertions, verify reviewed source and credentials/security parity, then push exact changes and require matching green CI before release/merge. Preserve data, runtime secrets and rollback. Whole product remains NOT_ACCEPTED. No paid model replay is authorized merely by deployment.

Evidence and live deployment inventory: ../acceptance/REDEPLOY_2026-11-25.md. Previous cost-audit task is deferred, not resolved; archived context: archive/release-before-nov25/.
