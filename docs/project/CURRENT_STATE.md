# Current state

2026-11-25 redeployment in progress on agent-lab, source dfcf429. Gemini updates already match origin/agent-lab; main remains 3c4f80b. The latest applicable CI45531537241 (ce170e2) failed the isolated Builder pending-state browser assertion; other jobs passed. Release is blocked pending its repair and matching green CI.

This round: portfolio build (77 articles),38 portfolio contracts, lint and three application typechecks passed; Builder78 component tests passed. Isolated browser repair now waits for the rendered pending state while holding the real synthetic response; no assertion removed. This still needs browser/CI proof.

Live inventory: development machine currently serves the public portfolio via native8787, API3001, Interview5173 and Lab5175. The reachable Intel deployment machine contains an older7405555 rehearsal database and unhealthy API with stopped data services. It is not established as the current writable primary. Do not cut over or overwrite its data based on its README.

Whole product NOT_ACCEPTED. Real provider quality/cost reconciliation, physical devices, complete commercial journeys and target-machine production migration remain separate open gates. Previous detailed status retained in archive/release-before-nov25/.
