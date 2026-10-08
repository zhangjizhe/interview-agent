# B0 Delivery Acceptance Report

Date: 2026-08-15

## Scope

This B0 run freezes the executable candidate boundary before subsequent refactor batches:

- JWT login and current candidate navigation browser acceptance;
- USER target-job creation and ADMIN route isolation;
- candidate-visible SSE event filtering in API and Web;
- offline Golden Dataset structural validation.

## Results

| Check | Result |
| --- | --- |
| API Jest | PASS, 23 suites / 235 tests |
| API cache tests | PASS, 22 tests |
| Web Vitest | PASS, 10 files / 75 tests |
| API and Web typecheck | PASS |
| API and Web production build | PASS |
| Golden Dataset structural validation | PASS, 30 cases, no Provider call |
| Docker health | PASS, PostgreSQL and Redis ready |
| Real browser acceptance | PASS, 10/10 checks |

## Browser Coverage

The local Docker web and API services verified:

1. The login gate is visible without a session.
2. A random test user can register and receive a USER session.
3. A USER reaches the candidate home page.
4. The USER can create an owned target job.
5. The USER is redirected away from `/admin/mcp`.
6. The configured administrator receives an ADMIN session and can access MCP management.
7. The mobile login view renders at 390 x 844.

The test produces local screenshots and JSON results under
`apps/web/e2e/screenshots/acceptance-2026-08-15/`. They are generated evidence and are not
included in the source change.

## SSE Boundary

The API maps Agent output to candidate events before writing SSE. The Web independently accepts
only `token`, `error`, and completion events. Tool calls/results, planning, search, retrieval,
model metadata and token-cost events are excluded from the candidate contract. Provider errors are
replaced with a generic actionable message.

## Remaining Boundary

The structural validation proves only that the Golden Dataset conforms to its schema. It does not
measure evaluator, interview, retrieval or follow-up quality and must not be treated as an Agent
release approval. Provider evaluation remains governed by the bounded canary and Harness gates in
`docs/harness/RELEASE_GATE.md`.
