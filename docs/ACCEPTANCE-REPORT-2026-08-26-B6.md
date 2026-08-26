# B6 Usage And Quota Acceptance Report

Date: 2026-08-26

## Scope

This run validates the minimal Usage Ledger and server-side interview quota boundary.

## Results

| Check | Result |
| --- | --- |
| Usage Ledger unit and interview-start contract tests | PASS |
| API Jest | PASS, 30 suites / 260 tests |
| API cache tests | PASS, 22 tests |
| Interview Web Vitest | PASS, 13 files / 78 tests |
| API, Interview Web and Agent Lab production build | PASS |
| Usage Ledger migration | PASS |
| Docker migration job and API readiness | PASS |
| Docker quota contract | PASS |

## Docker Contract

With `QUOTA_MONTHLY_INTERVIEW_LIMIT=1`, a random local candidate received:

```text
before: 0 used / 1 remaining
after ledger record: 1 used / 0 remaining
direct POST /api/interview/start: 429
```

The candidate usage summary contains only period, interview count, limit and remaining count. It does not
contain model, provider, token, tool or cost fields. The Docker API was then restarted with the default
empty quota configuration, which leaves quota enforcement disabled.

## Boundary

This feature protects access to new interviews. It does not replace provider cost tracking, Subscription,
Entitlement, Payment, Agent evaluation quality comparison or the Harness release decision. Provider calls
were not invoked during this acceptance run.
