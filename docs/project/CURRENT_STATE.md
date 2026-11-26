# Current state

2026-11-25 redeployment in progress on agent-lab, source dfcf429. Gemini updates already match origin/agent-lab; main remains 3c4f80b. The latest applicable CI45531537241 (ce170e2) failed the isolated Builder pending-state browser assertion; other jobs passed. Release is blocked pending its repair and matching green CI.

This round: portfolio build (77 articles),38 portfolio contracts, lint and three application typechecks passed; Builder78 component tests passed. Isolated browser repair now waits for the rendered pending state while holding the real synthetic response; no assertion removed. This still needs browser/CI proof.

Live inventory: development machine currently serves the public portfolio via native8787, API3001, Interview5173 and Lab5175. The reachable Intel deployment machine contains an older7405555 rehearsal database and unhealthy API with stopped data services. It is not established as the current writable primary. Do not cut over or overwrite its data based on its README.

Whole product NOT_ACCEPTED. Real provider quality/cost reconciliation, physical devices, complete commercial journeys and target-machine production migration remain separate open gates. Previous detailed status retained in archive/release-before-nov25/.

Nov26 continuation: see ../acceptance/REDEPLOY_2026-11-25.md for the latest observed progress. Repair420857a pushed; PR82 and exact CI45560851674 not yet verified complete. Two hosts were connected to the same public tunnel. The server API was deliberately stopped before data-service recovery and had not been restarted at last observation; no new release or public cutover occurred. Database backup restore counts matched, but full release/security parity checks remain incomplete. Automatic approval review then failed from usage-limit exhaustion; no bypass permitted. User additionally reports poor WorkBuddy get_jobs application results; clarification requested, no applications submitted or application files modified. Keep deployment active and record this as a separate pending task.

Nov26 new article release request: canonical article hash differs from both live copies despite77 count. Original server API has now been restarted on its unchanged image after zero-pending checks; readiness200. PR82 readback red due exact answer text mixed with feedback labels; Builder issue passed. Minimal content-node repair and current article release verification in progress. See ../acceptance/REDEPLOY_ARTICLES_2026-11-26.md.
