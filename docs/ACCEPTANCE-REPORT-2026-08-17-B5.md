# B5 Training Recommendation Acceptance Report

Date: 2026-08-17

## Scope

This batch adds one evidence-grounded training loop for the current target job. It does not alter
Agent execution, Provider routing, Prompt behavior, scoring, CandidateSkillState aggregation or
the candidate SSE contract.

## Delivered Contract

- Recommendations are created only for active-target-job CandidateSkillState records below the
  documented evidence score threshold and only when they originate from a successful FINAL run.
- Every recommendation records the target-job profile version, source run and foreign-keyed source
  AssessmentEvidence. Additional source evidence IDs are retained for replay.
- Completing training creates a TrainingAttempt and changes recommendation state only. It never
  writes CandidateSkillState.
- A retest requires a completed attempt, an active unchanged target-job profile and matching skill
  practice. The created Interview is linked back to the attempt.
- The candidate training page refreshes and lists only owned recommendations. With no FINAL
  evidence, it explicitly renders an empty state rather than inventing a recommendation.

## Results

| Check | Result |
| --- | --- |
| Prisma schema validation and migration status | PASS |
| Local additive migration | PASS |
| API Jest | PASS, 29 suites / 256 tests |
| Web Vitest | PASS, 11 files / 76 tests |
| API and Web typecheck/build | PASS |
| Docker migration job, API health and Web build | PASS |
| Real JWT browser acceptance | PASS, 22/22 checks |

## Limits

The browser run verifies the owned empty state and does not create FINAL evidence, complete
training or start a retest. Those contracts are covered with mocked API tests to avoid real
Provider calls. Training completion remains intentionally separate from skill-score changes; only
a later successful FINAL evaluation can update CandidateSkillState.
