# B1 Migration Baseline Acceptance Report

Date: 2026-08-15

## Scope

This acceptance run establishes a recoverable Prisma baseline and removes DDL from the API runtime.

## Results

| Check | Result |
| --- | --- |
| Source to isolated restore Schema fingerprint | PASS |
| Source to isolated restore table row counts | PASS, 22 tables |
| Empty database Baseline migration | PASS |
| LangGraph checkpoint initialization | PASS |
| Prisma migration status after Baseline | PASS |
| Local development baseline registration | PASS |
| API Jest | PASS, 24 suites / 237 tests |
| API cache tests | PASS, 22 tests |
| API typecheck and production build | PASS |
| Docker migration job and API readiness | PASS |

## Deployment Contract

- `apps/api/prisma/migrations/` contains only `20260815000000_production_baseline`.
- Legacy migration SQL remains in `apps/api/prisma/migrations-legacy/` for audit and is not executed.
- The migration job runs `migrate deploy`, checkpoint initialization and `migrate status`.
- API startup never runs `db push`, `migrate deploy` or checkpoint DDL.
- `/api/health/ready` requires PostgreSQL, Redis and the Baseline record; a failed check returns 503 without raw dependency errors.

## Remaining Boundary

The local development database was baseline-registered only after the isolated restore drill. Production
rollout still requires its own write freeze, encrypted backup, isolated restore, Schema/data reconciliation
and release approval. This B1 run does not alter evaluation, skills, training, Agent prompts, providers or
candidate UI behavior.
