# Tasks

- 2026-11-27: portfolio homepage no longer inlines 77 article bodies; public HTML and `/articles/:id.js` are cacheable, while chat/SSE/health/search stay no-store. Verified locally (41 portfolio tests, local server, headless Chrome). Not deployed. A Cloudflare Cache Rule is still required before extensionless HTML leaves DYNAMIC; see CURRENT_STATE.
- Active P1 (partially closed Nov26): exact-source CI repair and supervised article content release are done on the Intel Mac native 8787 at 1f7d190 with green push/PR CI, backup and rollback evidence. Public route `zhezone.cn` verified after push (HTTP/2 200, 77 articles, health/route/security headers). Still open: single-primary decision, development Mac 8787 parity, separate hosted Site refresh (still 11 articles), and the PR82 merge decision. See ../acceptance/REDEPLOY_ARTICLES_2026-11-26.md and ../acceptance/REDEPLOY_2026-11-25.md.
- P1: Deploy script advertises rollback but only prints instructions; replace with a pinned, verified release workflow before unattended use. Current release must be supervised.
- P1: Intel server currently contains old rehearsal state; complete drain/fresh backup/restore/state inventory and single-primary cutover before calling server migration complete.
- Deferred P1: Nov19 supplier cost reconciliation remains UNRECONCILED; actual bill differs from Nov18 local range. No invented attribution or zero-cost assumption.
- Whole-product commercial/design/device acceptance, actual preparation/interview/report/training loops, permissions/provenance, complete resume/file/URL RAG, server receipt/idempotency and physical-device work remain open. Detailed existing backlog preserved in archive/release-before-nov25/TASKS.md.

- Pending clarification: diagnose WorkBuddy/get_jobs application conversion or tailored-resume quality from actual sent records and representative job/resume pairs. No authorization to submit additional applications inferred. Keep separate from deployment.
