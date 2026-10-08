# B3 Target Job Browser Acceptance Report

Date: 2026-08-15

## Scope

This local Docker Compose acceptance run validates the target-job contract through real JWT
sessions. It covers create, list, update, activate, versioning, readiness and ownership behavior.

## Results

| Check | Result |
| --- | --- |
| Docker API and dependencies | PASS, API healthy |
| Real browser acceptance | PASS, 19/19 checks |

## Browser Coverage

1. A newly registered USER can create an owned target job.
2. The created job is active and starts at profile version 1.
3. Editing the job increments its profile version.
4. Creating a second job immediately leaves exactly one active job.
5. Activating the prior job preserves the single-active invariant.
6. Readiness returns the updated job profile version and remains unavailable with a null score when
   no successful FINAL evaluation evidence exists.
7. A second USER receives 404 for both readiness and activation requests on the first USER's job.
8. Existing candidate/admin route isolation and the mobile login gate remain covered by the same
   real-browser script.

## Reproduction

Start the local Docker Compose stack, then run:

```bash
pnpm --filter @interview-agent/web run e2e:auth:real
```

Set `CHROME_PATH` when the Playwright-managed browser is unavailable. The script writes screenshots
and a JSON result to its local untracked evidence directory. It creates timestamped local test
accounts and target jobs; no generated identifiers are included in this report or committed.

## Limits

This is a bounded local acceptance run. It validates neither a production backup/recovery procedure
nor paid Provider behavior, Agent quality, training outcomes or quota enforcement.
