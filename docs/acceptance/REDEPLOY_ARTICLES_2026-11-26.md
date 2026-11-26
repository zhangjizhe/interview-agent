# Article redeployment — 2026-11-26

Status IN_PROGRESS. User requested publishing updated articles. Canonical tracked article SHA256 ac5d3efaebe5e31986b22ef4f8a3480396a046f12092a5f36b648e3aebc3b26a; both native published copies still40f46f6e21879c3556c9f23cd8065274eb16bcb788a7b07f988d6c60d5d95336. Same77 count does not establish freshness.

## Actual checks

- New readback: PR82 remains open/red at420857a. Both push/PR suites failed Golden Interview exact answer visibility, after the Builder assertions passed. New feedback buttons share the answer text container. The minimal repair wraps answer text separately only when feedback is present; existing golden exact-text and persistence assertions remain unchanged.
- This round: Node22 portfolio build77 and38 contracts passed; ChatBubble8 tests, Web types and root lint passed; Web build pending.
- Server original API restarted only after actual pending Runs0 and tasks0; original image identity matched, readiness200. No migration or new candidate release performed by that recovery. Existing data volumes retained.

## Required before release

Matching green CI; reproducible artifact and credential scan; protected static/config backups; candidate/public article hash and route checks; security parity and browser. Keep two-host tunnel consistency explicit. No paid model call this round and no commercial acceptance claim.

## Nov26 supervised release (continuation after CI green)

Status: content release COMPLETED for the remote Intel Mac native 8787 only. Whole product NOT_ACCEPTED.

- Matching green CI: push run 45734426232 was rerun and completed success (docker-build-test 17m36s, ci-summary pass); PR run 45734433784 success. All 10 PR82 checks pass, mergeStateStatus CLEAN, head 1f7d1900b117050adb83a4f3243bca9bf0b719c5. PR82 left open, unmerged.
- Access: UU Remote daemons were confirmed alive on the Intel Mac. Per the 2026-11-18 agreement, UU is a desktop maintenance entry only; all release actions used the pinned SSH alias `buildserver` with a restricted user. No root login and no GUI automation were used.
- Candidate `~/deploy/article-release-1f7d190`: articles.json ac5d3efa… (77), site-html.mjs fb5e1167…. Credential-shape scan of the candidate source found no token/key literals; the candidate ran on 17887 without `.env`.
- dist: rebuilt in an isolated copy with the deployed runtime build.mjs and is byte-identical to the candidate (5ee9843b…, 77 embedded articles). The `Built 11 articles` line is a stale hardcoded log string in that older build script, not stale data; the current repo build.mjs reports 77 (f85ef837…, saved under `reproducible-dist/`). No dist replacement was required.
- Cutover `cutover.sh`: replaced only `src/articles.json` and `src/site-html.mjs`, preserved file modes, `.env`, data volumes and every other runtime file, and restarted the launchd job `com.interviewagent.portfolio-site`. Backup `before-20261126-101437/` holds the old hashes (40f46f6e… / 67527d02…), `.env` and health snapshot; `rollback.sh` restores them.
- Independent post-cutover checks: live hashes ac5d3efa… / fb5e1167…; health articles 77; GET / 200 (883314 bytes); /api/nope 404; CSP, x-content-type-options and cache-control present; `.env` byte-identical; launchd job alive.
- Public verification (added after the cutover): the named tunnel ingress config (container log version=5) maps `zhezone.cn` -> `http://host.docker.internal:8787`, plus portfolio-api / interview / lab subdomains. `https://zhezone.cn/` returns HTTP/2 200 with `全部 77 篇` and `data-nav="articles"`; `/api/health` returns articles 77 with agentConfigured true; `/api/nope` 404; CSP, referrer-policy, x-content-type-options and cache-control are present. The uncompressed 883314B homepage timed out at 25s after 557086B over the tunnel, but completed 200 in 15.5s (208420B) with `--compressed` — a transfer-speed observation, not a content failure. The public site does not expose articles.json, so no byte-level public hash comparison was possible; the evidence is health count, page markers and route/header checks.
- Boundaries: development Mac native 8787 deliberately untouched per user decision. The separately hosted Site (`jizhe-ai-portfolio…chatgpt.site`) still serves the older ~125KB / 11-article page through a different deployment path and was not updated. No PR merge, no main change, no paid model call, no commercial acceptance claim.
