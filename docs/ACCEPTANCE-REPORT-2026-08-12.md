# Delivery Acceptance Report

Date: 2026-08-12

## Scope

This acceptance run validates the commercial-readiness hardening delivered for the default NestJS service:

- Password-based account registration and login
- JWT default-deny access control
- USER/ADMIN role-based access control
- Interview resource ownership isolation
- Authenticated web shell and administrator route protection
- Docker Compose deployment health

## Automated Checks

| Check | Result |
| --- | --- |
| API TypeScript typecheck | PASS |
| API Jest | PASS, 214 tests |
| Web TypeScript typecheck | PASS |
| Web Vitest | PASS, 59 tests |
| API production build | PASS |
| Web production build | PASS |
| Prisma schema validation | PASS |
| Docker Compose service health | PASS |
| Real browser acceptance | PASS, 9/9 checks |

## Real API Verification

The Docker deployment was rebuilt from the current repository. The following runtime checks passed:

1. `GET /api/health` returned 200.
2. `GET /api/health/ready` returned ready with PostgreSQL and Redis connected.
3. An unauthenticated request to `/api/interview/list` returned 401.
4. A registered USER could log in and access their interview list.
5. The same USER received 403 from `/api/admin/mcp-servers`.
6. The controlled bootstrap administrator received 200 from `/api/admin/mcp-servers`.

## Browser Acceptance

The browser test used the running Docker Compose web/API services at `http://localhost:5173`.

1. Login gate is shown without a session.
2. A newly registered user receives a USER session.
3. A USER reaches the authenticated home page.
4. A USER is redirected away from `/admin/mcp`.
5. The configured administrator receives an ADMIN session.
6. The administrator can open the MCP management page.
7. The mobile login view renders at 390 x 844.

## Content Workflow Regression

With valid Qwen and DeepSeek credentials loaded into the restarted API container:

1. Provider health checks passed for Qwen and DeepSeek.
2. The bundled knowledge base reused all 142 indexed records without failures.
3. A Markdown resume upload returned 201, parsed the name as `Li Ming`, ingested the resume into RAG, and produced personalized questions.
4. The uploaded resume was listed for the authenticated owner, then an interview was created and its resume confirmation persisted.
5. A Markdown question-bank file imported 2 questions and an immediate search returned matching results.
6. A public TypeScript documentation URL produced 5 generated interview questions and an immediate search returned matching results.
7. The repeatable content workflow suite completed 10/10 checks, including resume ownership isolation and SSRF rejection.

The following regressions were fixed during this run:

- Markdown heading syntax is stripped from the parsed resume name.
- Question-bank writes are flushed before returning, so a successful import is immediately searchable.
- Empty hybrid results fall back to dense retrieval while BM25 materialization catches up.
- URL imports include document titles, permit evidence-based question generation from technical documentation, and return 400 rather than a false-success 201 when no questions can be produced.

## Evidence

| Screenshot | Scenario |
| --- | --- |
| `apps/web/e2e/screenshots/acceptance-2026-08-12/05-real-login-desktop.png` | Desktop login gate |
| `apps/web/e2e/screenshots/acceptance-2026-08-12/06-real-user-home.png` | Authenticated USER home page |
| `apps/web/e2e/screenshots/acceptance-2026-08-12/07-real-admin-mcp.png` | Authenticated ADMIN MCP management |
| `apps/web/e2e/screenshots/acceptance-2026-08-12/08-real-login-mobile.png` | Mobile login gate |
| `apps/web/e2e/screenshots/acceptance-2026-08-12/real-results.json` | Browser acceptance assertion results |
| `apps/web/e2e/screenshots/acceptance-2026-08-12/09-resume-confirmation.png` | Real uploaded resume confirmation page |
| `apps/web/e2e/screenshots/acceptance-2026-08-12/10-question-bank-url-search.png` | URL-imported TypeScript questions returned by the admin search UI |
| `apps/web/e2e/screenshots/acceptance-2026-08-12/content-workflow-results.json` | Real API content workflow, 10/10 passed |

## Remaining Test Boundary

The content workflow used valid Qwen and DeepSeek credentials and verified resume parsing, embedding ingestion, question generation, and question-bank retrieval. It was not a production load test or a full evaluation of cache quality, provider failover under outage, or long-running SSE reconnection. Those scenarios still need environment-specific testing before a production release.
