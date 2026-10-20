# Security prerequisite for policy admission delivery

Overall NOT_ACCEPTED. Baseline pushed agent-lab1b3e0f31e409ade529746ff4b70353ce26e3ca1e; no PR created/merged at start of this prerequisite.

## Actual CI failure

Exact push run39488684415: docker-build-test succeeded, lint-type-test failed at production security-audit before lint/type/tests ran, summary failed. This is not a lint or test regression result. Prior local policy API93/candidate+Lab browser/strict restore evidence remains limited to its old lock/images.

On 2026-10-21 official advisories identify Hono4.13.7 as affected with4.13.11 patched ([GHSA-5r4p-p66f-jhc7](https://github.com/advisories/GHSA-5r4p-p66f-jhc7)), and follow-redirects1.16.0 as affected with1.16.1 patched for array-form credential headers and sensitive-header regex escaping ([GHSA-q3jh-wrc6-jgq8](https://github.com/advisories/GHSA-q3jh-wrc6-jgq8), [GHSA-8r9p-f939-6h3c](https://github.com/advisories/GHSA-8r9p-f939-6h3c)). New audit findings are not waived based on assumed reachability.

## Source checked and minimal change

Root pnpm overrides/lock pin Hono4.13.11 and follow-redirects1.16.1. MCP SDK1.32.1 consumes Hono/@hono node-server; Mem0→Axios1.20.0 consumes follow-redirects. No other package version changes, schema/API/permission changes or new allowlist. Registry refreshed two unrelated deprecation annotations during lock generation; retained prior annotations to avoid unrelated lock churn. Frozen install succeeded.

## This iteration actually verified

- Original unchanged security-audit passed after patch install:0 moderate,1 high,0 critical upstream; remaining braces advisory stays explicitly reported with existing checksum-verified local mitigation. This does not mean zero vulnerabilities or an upstream braces fix.
- Installed actual Mem0→Axios redirect dependency exercised against loopback servers: array-form headers and custom caret/pipe-sensitive names do not cross hosts, public header/normal redirect still work. Together with prior installed braces regressions:2 suites/12 passed.
- Offline MCP loader/reload and memory dual-write consumers:3 suites/27 passed, synthetic failure paths retained; no external memory/model calls.
- Focused ESLint/API typecheck/build passed.
- New API/Interview/Lab image builds passed. First complete new-image chain exited0: actual MCP stdio/streamable HTTP protocol, API93/93, Lab and candidate browser, PostgreSQL schema/row-multiset/sequence equality and actual Milvus question/Qdrant vector-payload restore passed. Independent source/test/report review found no blockers. API config sha256:b17a8f6e17d20f43318d1687f260751917dcac266e3e315558b716de19eeb8b6; Interview sha256:8acdc4a6ab86297875bb5c20b01d7c8cc867451991eceac1e951856a7ae9b58f; Lab sha256:047577e44b6822b1d6b4065e884db05972f58c9300b6fa31e9b449f6136a9bd0. Exact latest commit CI/PR still required before main merge; original failed audit remains in history.

External model spend0. Unknown historical bills, real model quality, full product runtime coverage and deployment remain unresolved.
