# B4 Interview Mode and Candidate SSE Acceptance Report

Date: 2026-08-15

## Scope

This batch establishes a durable interview-mode and candidate-stream contract without changing the
LangGraph topology, Provider selection, retrieval strategy or candidate-visible SSE whitelist.

## Delivered Contract

- `Interview` stores `FULL_SIMULATION` or `SKILL_PRACTICE`, selected target-job skill, and the
  target-job profile-version snapshot.
- Skill practice requires an owned target job and one of its active skill requirements.
- `InterviewQuestion` stores selected skill, optional sub-skill, parent question, follow-up
  purpose and immutable selection metadata.
- The browser generates one client message ID per submission and reuses it for retries.
- The API persists that ID with the candidate message. A completed duplicate request replays the
  persisted assistant message without calling the Agent; an in-progress duplicate is not processed
  a second time.
- Candidate SSE remains limited to text, actionable errors and completion.

## Results

| Check | Result |
| --- | --- |
| Prisma schema validation | PASS |
| Local additive migration and status | PASS |
| API Jest | PASS, 27 suites / 249 tests |
| Web Vitest | PASS, 10 files / 75 tests |
| API and Web typecheck/build | PASS |
| Docker migration job, API health and Web build | PASS |
| Real JWT browser acceptance | PASS, 21/21 checks |

## Browser Coverage

The local Docker acceptance creates a random USER and target jobs, then verifies the existing
ownership and readiness path plus the B4 mode selector. The candidate can select full simulation
or skill practice, and the skill-practice menu contains only skills returned for the selected target
job. The run does not start an interview, send an answer or call a Provider.

## Limits

This delivers request-level retry idempotency and completed-response replay. It does not yet
implement `Last-Event-ID`, token offsets or a persisted per-token event log, so a reconnect during
an active generation may wait for the original request to complete before replaying its saved
response. Real Provider streaming, quality and cost canaries remain subject to the Harness release
gate.
