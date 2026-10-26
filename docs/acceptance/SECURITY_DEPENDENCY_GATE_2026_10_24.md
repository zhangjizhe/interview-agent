# PR63 CI prerequisite: runtime and dependency security

2026-10-24. In progress, not accepted. Main remains the PR62 foundation. PR63 candidate cb88de490ce36ba7105a2d02457da58533c8d8a5 is blocked; no merge or deployment approval follows from the prior local fixture results.

## Actual failure

Exact push40048015400 and PR40048049704 attempt1 failed. Original Docker jobs120734050260/120734156203 rejected Ubuntu26.04 browser dependency installation with Playwright1.58.2. Original lint jobs120734050518/120734156466 failed production audit before later business checks; summary jobs120735139392/120735325104 failed. Image builds alone were successful. Do not label skipped tests as passed.

Production audit reproduced exit1: 10 new unreviewed GHSA identifiers, aggregate6 high/3 moderate/2 low findings. Selected corrections: multer2.4.0 ->2.5.0, fast-uri3.1.8 ->3.1.9, undici6.28.1 ->6.29.1, qs6.16.0 ->6.16.1, body-parser2.3.0 ->2.4.0. Pin jobs to ubuntu-24.04. Existing audit rules were not removed.

The unused mem0ai3.0.6 SDK pulled Azure identity/MSAL. Actual Mem0CloudMemory already calls native fetch; no runtime SDK import was found. Remove SDK rather than force an unverified MSAL major override. The old SDK-specific follow-redirects test is replaced with actual Mem0CloudMemory loopback307 tests: same-origin keeps Token authorization, different-origin removes it, both preserve POST/user/message payload. Actual result2 passed, exit0; no cloud call. Existing Axios/follow-redirects security overrides remain unchanged.

## Zod compatibility and resource guard

Independent installed-chain red tests:72 failed/28 passed/exit1 on original dependencies, covering API Zod3 root and /v3, MCP's bundled /v4 and DeepAgents Zod4. Failures count actual element/refinement visits on small oversized inputs, not an OOM stress test. Real MCP, LangChain and OpenAI schema compatibility examples pass. No external model call.

Independent Zod4 is pinned4.6.6. Zod3 remains3.25.76 for existing consumers; simply replacing its package with Zod4 would neither prove compatibility nor fix the still-exported /v3 implementation. The v3/bundled-v4 backport is installed with pnpm patchedDependencies. CJS/ESM/TypeScript sources are patched consistently. Independent installed-chain126 and three-dialect57 checks pass with actual exit0. Original72-red/28-green evidence is retained; added compatibility cases are not miscounted as original red tests.

Primary references: [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [upstream bounded collection fix](https://github.com/colinhacks/zod/commit/a0ebf970f2d752e5f58527cd2942ff48be4f46bd), [MSAL advisory](https://github.com/advisories/GHSA-xcx6-jx8p-x3h5), [MSAL fix](https://github.com/AzureAD/microsoft-authentication-library-for-js/pull/8901). The local backport is not an upstream-supported Zod3 release and must remain explicit.

## Initial lock verification (superseded by later receipts)

Lockfile resolution and frozen install with scripts disabled exited0. New-lock audit exited1: only Zod3 advisory remains (high1, moderate/low0); this is not a green audit or accepted mitigation. Mem0 REST redirect2, targeted ESLint and API TypeScript exited0. Memory/MCP5 suites35 passed and workspace TypeScript exited0. Dependency changes require new API/Web/Lab builds and private full default API/browser/persistence/recovery verification; old-lock images cannot serve as evidence.

No migration or business API change is introduced by this prerequisite. Retain prior protocol failed-run history. Do not submit/merge before patch validation, diff review, independent evidence review and latest exact push/PR CI all green. Overall990-row acceptance, real model quality, unknown historical costs and target deployment remain unaccepted. No paid external testing.

## Limited security review completed; full release gate remains open

Independent review approved the bounded compatibility patch and narrowed audit mitigation only. Audit policy tests3 pass, rejecting unknown module/advisory/range/version, sparse/null findings, unsafe/missing counts and nonzero vulnerabilities with empty advisories. Gate verifies registered patch path, SHA2564e2e8949d787d7c7fb0bd9177a0c56dcc401537945d389846f25f89f70d62929 and six actual installed source hashes. Actual reviewed audit exits0 while explicitly reporting upstream high1; no claim of upstream Zod3 repair. A plain pnpm audit still exits1. The root Zod copy hashes plus actual SDK-chain tests are the evidence; the hash loop does not enumerate every transitive copy.

Full API1011 passed/21 skipped (before four added semantic cases); final focused Zod126 covers those additional cases without claiming a full1015 run. Web307, full lint, final workspace types and frozen offline install exited0; build completed before patch installation, matching final images subsequently built0 (final receipts below). Memory/MCP35 and native REST2 passed. Independent reviewer read original logs and the policy/source diff.

Actual Set semantic comparison: original bundled-v4 accepts oversized raw Set['a','A'] after element uppercase transform collapses it; the backport and official4.6.6 reject before transforms (visits0). This intentionally applies upper bounds to original input. Container overwrite/custom checks before size retain original order. Unbounded schemas receive no new universal cap, and older Zod3/bundled-v4 expose no bounded Map API; no generic DoS immunity is claimed.

2026-10-25 readback: final API/Web/Lab image build exits are0. The complete default private runner exited0 on2026-10-24: actual MCP stdio/HTTP, API93, presentation persistence45, tenant saved-bank first-question/OPEN no-dispatch checks, golden default-multi API, complete Lab browser, candidate policy/history/UNKNOWN/native60s/training reads and writes, both actual PG next-question branches and golden FINAL/training/retest UI all passed. Strict PostgreSQL schema/row-multiset/sequence and actual Milvus/Qdrant recovery passed. Browser scope was default all, with presentation-store/probe and golden enabled; this is not the earlier focused-only run. Model work used internal synthetic providers; no external requests or real model-quality claim.

The separate question-transfer storage runner also exited0: actual SDK insert/flush/Strong union, idempotence and unchanged source, unknown acknowledgement reconciliation, tenant-B separation, independent PostgreSQL workers/locking and persistent metadata receipts. Its limits remain fixture session coordination, not a production historical data migration or proof of ordinary-writer fencing. No historical16-question ownership was inferred.

Private original logs and exit receipts: presentation-security-full-private and presentation-security-transfer. Current npm review gate was rerun after overnight interruption and exited0 with upstream high1 still disclosed. Final independent whole-diff/log review and new exact push/PR CI remain pending. Do not merge PR63 yet.

2026-10-25 final PR review found a missed normal branch: fresh confirmation publishes an assistant question but local messages remain empty; the old sidebar abandoned via navigation without POST/end. New component red3/original34 passed, then minimal fix37 passed. Empty-message confirmed exit now uses end with a no-report label; confirming blocks exit. Root added real browser/API/PG cascade and refused/malformed receipt checks (no answer POST). New Web full/image/default browser verification was initially pending and is superseded by the final local freeze receipt; earlier complete default pass does not cover this new branch. UI inventory only existing exit nodes UI0266/268/269 are source-reconciled; all990 baseline verdicts remain NOT_ACCEPTED and other nodes retain old baseline.

2026-10-25 tool interruption: fresh-exit full-private stopped after store45 with no exit receipt or browser result; host process was absent and unique synthetic containers were cleaned. Treat as interrupted/unaccepted, not a failed assertion or success. Durable fresh-exit-retry runner is now executing the same final source/images with explicit log/exit receipts; unchanged completed unit/security/image checks are not rerun.

## Final local freeze gate (2026-10-25)

Durable presentation-fresh-exit-retry exited0 at11:17:52UTC. Independent original-log review confirms complete default ALL: API93/store45, actual saved-bank confirmation/GET/OPEN with no scoring dispatch, all Lab and candidate policy/session/history/confirmation/UNKNOWN/native60s/training GET+POST recovery, fresh-confirm zero-answer exit with refused/empty receipts and actual no_answers/PG cascade, both golden PG queue branches and full scoring/FINAL/training/retest UI. Strict PG schema/row-multiset/sequence plus actual Milvus/Qdrant recovery passed. Web310, matching new Web image, relevant types/full lint/diff passed. Prior API1011/21skip, focused Zod126 and other unchanged security/transfer passes retained. Independent reviewer approved only limited local freeze; no external model quality, overall product or deployment acceptance.

The earlier fresh full-private tool interruption had no exit and never reached browser acceptance; old nohup launch produced no fixture/process, replaced with its own durable process session. Both remain explicit non-success attempts. No assertion was removed, no product container was changed and no paid historical test replay occurred. Next freeze related files, push/update PR63, inspect latest exact push+PR CI and independent original logs, then expected-head merge/read back remote. Old cb88 CI failed and must not be merged.
