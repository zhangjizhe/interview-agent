# Question presentation and answer binding

2026-10-23. Status: **FAILED / NOT_ACCEPTED**. Baseline: PR61 merge
`55230237f2ab7eeea7c4224577d2aee0dac8ba6d`. A persistence foundation is in the
working tree; no candidate API or browser product fix is included yet.

## Actual red test

`verify-question-presentation.mjs`, enabled only by `FIXTURE_PRESENTATION_PROBE=1`
in `verify-built-api.sh`, used the built API `interview-api:question-skill-final`,
actual PostgreSQL/Milvus/Qdrant and a private synthetic model provider. The script
requires production mode, an explicit synthetic flag and the exact private database.
It registers a new synthetic owner, creates a target job, uploads TXT, starts a
FULL_SIMULATION interview, confirms the resume, sends a start greeting through the
real SSE endpoint and reads scoped persistent records. It does not seed answers or
formal evaluation records. This is engineering evidence, not model quality.

The actual shell exit was **1**. The preceding existing API smoke was 93/93;
that success does not override the new failure. The probe recorded:

| Fact | Before greeting | After greeting |
| --- | --- | --- |
| Resume confirmed | true | unchanged |
| Assistant messages / pending tasks / normalized questions | 0 / 0 / 0 | not the presentation assertion |
| Actual pending question presented | false | no prior presentation |
| Normalized answers | 0 | 1, linked to the greeting message |
| Scored answer history | 0 | 1 |
| Completed tasks | 0 | 1 |
| Formal assessment evidence | 0 | 0 |

The greeting transport returned HTTP200, DONE, no error frame and persisted the
candidate message. Three assertions failed: no actual question presented at
confirmation; the greeting created answer/scoring records; an unanswered task was
completed. Evidence remained zero: this run does **not** show a new formal
AssessmentEvidence row. No external paid model request was made.

Original local diagnostic receipt: `question-presentation-actual-red.log` and
`question-presentation-actual-red.exit` in the temporary test output directory.
The independent acceptance Agent read the original facts, assertion and exit file,
and reviewed the script. This report retains the failure rather than weakening it.

## Source cause

`InterviewLifecycleController.confirmResume` only sets `resumeConfirmed`.
`InterviewAgentService.processMessage` initializes the queue when the first user
message arrives, selects the pending task, generates a reply, then unconditionally
calls `completeTask` with that message. The UI unlocks input on confirmation without
receiving a task presentation. Model wording is not proof that a specific stored
task was shown. Later replies can also diverge from the next pending task.

## Required protocol (design, not implementation)

1. The server owns an immutable presentation receipt tied to a normalized question,
   task, interview, organization and assistant message. Persist the exact public
   question before accepting an answer. Confirmation and history recovery return
   the same current receipt; repeated confirmation must not duplicate the queue.
2. Separate opening/control operations from ANSWER. ANSWER carries the presentation
   identity; validate ownership, current task and receipt on the server. Missing,
   stale, foreign or legacy-unpresented identities must not be graded. Do not use
   greeting keywords or a model classification as the authorization boundary.
3. Claim a presented task durably before paid scoring, independent of client message
   deduplication. Two different request IDs must not grade one task twice. Specify
   lease/failure/unknown-result recovery; do not silently release unknown paid work.
4. Bind the accepted answer to the exact presented question. After durable scoring
   and routing, persist the next actual task presentation. Assistant free text may
   provide a transition, but cannot override the authoritative question identity.
5. Refresh, relogin and interrupted SSE recover from persistent state. Replays
   return the same receipt/answer result. A failed next presentation must not silently
   regrade the previous answer. Keep FULL_SIMULATION scores private until report.

This changes candidate API/persistence semantics and needs an ADR before product
implementation. Reuse the queue, normalized questions, message delivery, gateway,
LangGraph and tenant boundaries. No migration or API protocol is claimed shipped.

## Acceptance gates still pending

Actual API plus independent browser checks must cover first and subsequent tasks,
explicit opening versus answer, repeated confirmation, refresh/relogin, same-ID
replay, different-ID concurrent answers, stale/foreign receipts, legacy sessions,
provider failure and unknown results, interrupted stream, and completed interviews.
Verify exact question IDs/text/message relations and no extra answer/history/model
work on rejected or replayed requests. Repeat strict restoration after any schema
change. Existing fixed-answer golden tests must be updated to answer presented
questions, not used as a substitute for these semantics. Exact candidate CI and
independent original-log review remain required before a new merge.

## Persistence foundation in progress

ADR25 selects an additive InterviewQuestionPresentation table and provider-free
QuestionPresentationService. The service is not yet registered in the application
module or called by a candidate route. No API behavior is claimed changed.

Composite foreign keys bind task, presentation message and claimed answer message
to one interview/organization. PostgreSQL enforces one unresolved receipt per
interview and legal state/claim/timestamp combinations. Existing tasks/messages
are not reclassified or given invented receipts. OPEN freezes the question;
only a newly claimed attempt returns its random token. Mutation callbacks require
the token and reject missing runtime IDs rather than allowing undefined Prisma
filters. UNKNOWN cannot be released or automatically completed. Completion checks
the normalized answer/scoring history and all question/answer text snapshots.

Independent source review found and prompted fixes for OPEN omission, stale claim
callbacks after release/reclaim, and completion text drift. These review findings
are not claimed to have been production incidents. The tests isolate composite FK
checks from pre-existing unique keys; a uniqueness rejection would not prove FK
isolation.

Actual local checks so far: Prisma validate/generate, relevant lint, typecheck and
build passed. The final API image built successfully. Fresh installation and the
actual pre-tenant legacy upgrade passed, retaining PENDING/COMPLETED task facts and
the old assistant message without any receipt; the existing 3 database suites / 19
tests passed. Receipts: `presentation-migration.log/.exit` (exit0),
`presentation-store-final-image.log/.exit` (exit0).

The first actual private chain (`presentation-store-real-chain.log/.exit`, exit1)
passed the existing API93 and the first 20 persistence checks, then the test
incorrectly expected Prisma P2004 for a CHECK rejection. The actual PostgreSQL
error was SQLSTATE23514 naming question_presentation_claim_state_check, wrapped by
PrismaClientUnknownRequestError. The test now requires that exact SQLSTATE and
constraint, not a generic rejection; the database check itself was not weakened.
That run did not reach strict restoration. A final-image run with the correction,
blank-input guard and extra drift/fencing/race assertions is pending. No new
commit/push/merge or exact CI is claimed for this unfinished theme.

Next: connect queue initialization, confirmation/history, explicit answer identity,
stream reply recovery, task completion and end coordination, then candidate UI.
Current method-level ended-session rejection does not prove the old end route
coordinates with claims. The private store fixture explicitly seeds synthetic
scoring rows to exercise persistence; it is not evidence that the product Agent
graded those rows or that the original greeting bug is fixed.


Final local foundation result: **limited persistence gate passed**, independently
reviewed; product remains NOT_ACCEPTED. `presentation-store-final-chain.log/.exit`
was exit0: API93,29 direct-service/PG checks, strict complete PostgreSQL
schema/row-multiset/sequence equality, actual Milvus/Qdrant restoration and recovery.
The original invalid-token case used an ended session and is excluded as token
validation evidence. It was replaced by `presentation-store-final-guards.log/.exit`
(exit0,29 checks) using two active PROCESSING claims: a scored claim eligible for
finish/markUnknown and a separate unscored claim eligible for release. Undefined,
null, empty and malformed tokens are refused without state/token/updatedAt change.
The narrow runner does not start a model/API server or repeat unchanged recovery.
Intermediate token-guard/active-token runs also exit0; the final guard script is the
maintained source. Independent acceptance Agent reviewed final script and original
exit/log receipts.

Full local API `presentation-api-tests.log/.exit` first exited1 with3 suites/11
failures because sandbox denied listen127.0.0.1 with EPERM. After allowing local
loopback, `presentation-api-tests-loopback.log/.exit` exited0:100 suites/871 passed,
21 tests skipped. This does not assert skipped Redis/database tests passed; the
separate real migration19 tests and store29 checks have their own evidence.

The CI Docker chain now enables FIXTURE_PRESENTATION_STORE=1 alongside the existing
API/golden/browser/recovery gates. New exact candidate CI is pending. Do not merge
until both latest push and PR runs are green and original logs reviewed. No paid
external model replay occurred; private provider calls in the full chain remain
synthetic, and direct store fixtures do not validate semantic scoring.
