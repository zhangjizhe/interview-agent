// Private persistence fixture only. It seeds synthetic scoring rows to exercise
// the store contract; it is not an API, browser, model-quality or scoring test.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
assert.equal(process.env.GOLDEN_FIXTURE_SYNTHETIC, '1');
assert.equal(process.env.NODE_ENV, 'production');
assert.equal(process.env.DATABASE_URL, 'postgresql://postgres@fixture-pg:5432/fixture');
const product = createRequire(`${process.cwd()}/package.json`);
const { PrismaClient } = product('@prisma/client');
const { DynamicTaskQueueService } = product('./dist/modules/interview/services/dynamic-task-queue.service');
const { QuestionPresentationService } = product('./dist/modules/interview/services/question-presentation.service');
const { tenantContext } = product('./dist/modules/organizations/tenant-context');
const { tenantMiddleware } = product('./dist/modules/organizations/tenant-policy');
const raw = new PrismaClient(); const scoped = new PrismaClient(); scoped.$use(tenantMiddleware);
const service = new QuestionPresentationService(scoped);
let failNextPresentation = false; let failNextFollowUp = false;
scoped.$use(async (params, next) => {
  if (failNextPresentation && params.model === 'InterviewQuestionPresentation' && params.action === 'create') { failNextPresentation = false; throw new Error('Synthetic presentation persistence failure'); }
  if (failNextFollowUp && params.model === 'InterviewTask' && params.action === 'create' && params.args.data.type === 'FOLLOW_UP') { failNextFollowUp = false; throw new Error('Synthetic follow-up persistence failure'); }
  return next(params);
});
let checks = 0;
const check = (label, value) => { assert.ok(value, label); checks++; console.log(`PASS presentation persistence: ${label}`); };
const refuses = async (promise, status) => assert.rejects(promise, error => error.getStatus?.() === status);
const dbRefuses = async (promise, code) => assert.rejects(promise, error => error.code === code);
async function run() {
  const owner = await raw.user.findUniqueOrThrow({ where: { id: 'fixture-ci-owner' } });
  const foreign = await raw.user.findUniqueOrThrow({ where: { id: 'fixture-ci-admin' } });
  const scope = work => tenantContext.run({ organizationId: owner.organizationId, userId: owner.id }, work);
  const present = iv => scope(() => service.presentCurrent(iv.id, owner.id));
  const tokens = new Map();
  const token = receipt => tokens.get(receipt.presentationId);
  const claim = async (iv, receipt, message) => {
    const result = await scope(() => service.claimAnswer(iv.id, owner.id, receipt.presentationId, message.id));
    if (result.state === 'CLAIMED') { assert.ok(result.claimToken); tokens.set(receipt.presentationId, result.claimToken); }
    else assert.equal(result.claimToken, undefined);
    return result;
  };
  async function fixture(confirmed = true) {
    const iv = await raw.interview.create({ data: { organizationId: owner.organizationId, userId: owner.id, position: 'Synthetic presentation store', resumeConfirmed: confirmed } });
    for (const priority of [1, 2]) await raw.interviewTask.create({ data: {
      organizationId: owner.organizationId, interviewId: iv.id, type: 'QUESTION', category: 'frontend', difficulty: 'easy', priority, question: `Synthetic task ${priority}: explain a constraint`,
    } });
    return iv;
  }
  const message = iv => raw.message.create({ data: { organizationId: owner.organizationId, interviewId: iv.id, role: 'user', content: 'Synthetic answer to the presented constraint' } });
  const beforeLedger = await raw.usageLedger.count();
  const iv = await fixture();
  check('legacy task has no fabricated receipt', await raw.interviewQuestionPresentation.count({ where: { interviewId: iv.id } }) === 0);
  const receipts = await Promise.all(Array.from({ length: 8 }, () => present(iv)));
  const receipt = receipts[0]; assert.ok(receipt);
  check('eight concurrent presentations return one receipt', receipts.every(row => row.presentationId === receipt.presentationId));
  const presentedMessage = await raw.message.findUniqueOrThrow({ where: { id: receipt.messageId } });
  check('one exact assistant question is durably published', presentedMessage.role === 'assistant' && presentedMessage.content === receipt.question && await raw.message.count({ where: { interviewId: iv.id } }) === 1);
  const empty = await raw.message.create({ data: { organizationId: owner.organizationId, interviewId: iv.id, role: 'user', content: '   ' } });
  await refuses(claim(iv, receipt, empty), 409);
  check('blank persisted input does not acquire an answer claim', (await present(iv)).state === 'OPEN');
  const first = await message(iv); const second = await message(iv);
  const claims = await Promise.allSettled([claim(iv, receipt, first), claim(iv, receipt, second)]);
  check('different concurrent answers acquire one claim', claims.filter(row => row.status === 'fulfilled' && row.value.state === 'CLAIMED').length === 1 && claims.filter(row => row.status === 'rejected' && row.reason.getStatus?.() === 409).length === 1);
  const winner = claims[0].status === 'fulfilled' ? first : second;
  check('same-message replay never authorizes a second dispatch', (await claim(iv, receipt, winner)).state === 'PROCESSING');
  await scope(() => service.markUnknown(iv.id, owner.id, receipt.presentationId, winner.id, token(receipt)));
  check('unknown survives GET-like presentation recovery', (await present(iv)).state === 'UNKNOWN' && (await claim(iv, receipt, winner)).state === 'UNKNOWN');
  await refuses(scope(() => service.releaseBeforeDispatch(iv.id, owner.id, receipt.presentationId, winner.id, token(receipt))), 409);
  await refuses(scope(() => service.finishAnswer(iv.id, owner.id, receipt.presentationId, winner.id, token(receipt))), 409);
  check('unknown is neither automatically released nor completed', (await present(iv)).state === 'UNKNOWN');
  await refuses(scope(() => service.presentCurrent(iv.id, foreign.id)), 404);
  await refuses(tenantContext.run({ organizationId: foreign.organizationId, userId: foreign.id }, () => service.presentCurrent(iv.id, owner.id)), 404);
  check('foreign user and foreign tenant cannot recover a receipt', true);

  const releasable = await fixture(); const releaseReceipt = await present(releasable); const rejectedInput = await message(releasable);
  await claim(releasable, releaseReceipt, rejectedInput);
  const oldToken = token(releaseReceipt);
  await scope(() => service.releaseBeforeDispatch(releasable.id, owner.id, releaseReceipt.presentationId, rejectedInput.id, token(releaseReceipt)));
  check('proven pre-dispatch release restores the same OPEN receipt', (await present(releasable)).presentationId === releaseReceipt.presentationId && (await present(releasable)).state === 'OPEN');
  const acceptedInput = rejectedInput; await claim(releasable, releaseReceipt, acceptedInput);
  assert.notEqual(oldToken, token(releaseReceipt));
  await refuses(scope(() => service.markUnknown(releasable.id, owner.id, releaseReceipt.presentationId, acceptedInput.id, oldToken)), 409);
  await refuses(scope(() => service.releaseBeforeDispatch(releasable.id, owner.id, releaseReceipt.presentationId, acceptedInput.id, oldToken)), 409);
  await refuses(scope(() => service.finishAnswer(releasable.id, owner.id, releaseReceipt.presentationId, acceptedInput.id, oldToken)), 404);
  check('old claim attempt callbacks cannot mutate a reclaimed message', (await present(releasable)).state === 'PROCESSING');
  await refuses(scope(() => service.finishAnswer(releasable.id, owner.id, releaseReceipt.presentationId, acceptedInput.id, token(releaseReceipt))), 409);
  check('completion without durable scoring is refused', (await present(releasable)).state === 'PROCESSING');
  const question = await raw.interviewQuestion.create({ data: { organizationId: owner.organizationId, interviewId: releasable.id, sourceTaskId: releaseReceipt.taskId, question: releaseReceipt.question, category: 'frontend', difficulty: 'easy', source: 'synthetic-store-fixture' } });
  const answer = await raw.interviewAnswer.create({ data: { organizationId: owner.organizationId, interviewId: releasable.id, questionId: question.id, messageId: acceptedInput.id, content: acceptedInput.content } });
  await refuses(scope(() => service.releaseBeforeDispatch(releasable.id, owner.id, releaseReceipt.presentationId, acceptedInput.id, token(releaseReceipt))), 409);
  check('a persisted answer cannot be released', true);
  await raw.answerHistory.create({ data: { organizationId: owner.organizationId, interviewId: releasable.id, questionId: question.id, answerId: answer.id, question: question.question, answer: answer.content, score: 0.5 } });
  await raw.interviewTask.update({ where: { id: releaseReceipt.taskId }, data: { status: 'COMPLETED' } });
  await raw.interviewQuestion.update({ where: { id: question.id }, data: { question: 'Synthetic wrong normalized question' } });
  await refuses(scope(() => service.finishAnswer(releasable.id, owner.id, releaseReceipt.presentationId, acceptedInput.id, token(releaseReceipt))), 409);
  await raw.interviewQuestion.update({ where: { id: question.id }, data: { question: question.question } });
  await raw.interviewAnswer.update({ where: { id: answer.id }, data: { content: 'Synthetic different answer' } });
  await refuses(scope(() => service.finishAnswer(releasable.id, owner.id, releaseReceipt.presentationId, acceptedInput.id, token(releaseReceipt))), 409);
  await raw.interviewAnswer.update({ where: { id: answer.id }, data: { content: answer.content } });
  await raw.interviewTask.update({ where: { id: releaseReceipt.taskId }, data: { question: 'Synthetic different task after claim' } });
  await refuses(scope(() => service.finishAnswer(releasable.id, owner.id, releaseReceipt.presentationId, acceptedInput.id, token(releaseReceipt))), 409);
  await raw.interviewTask.update({ where: { id: releaseReceipt.taskId }, data: { question: releaseReceipt.question } });
  const history = await raw.answerHistory.findFirstOrThrow({ where: { answerId: answer.id } });
  await raw.answerHistory.update({ where: { id: history.id }, data: { question: 'Synthetic different scoring history question' } });
  await refuses(scope(() => service.finishAnswer(releasable.id, owner.id, releaseReceipt.presentationId, acceptedInput.id, token(releaseReceipt))), 409);
  await raw.answerHistory.update({ where: { id: history.id }, data: { question: releaseReceipt.question } });
  check('completion rejects task, normalized question, history and answer snapshot drift', true);
  await scope(() => service.finishAnswer(releasable.id, owner.id, releaseReceipt.presentationId, acceptedInput.id, token(releaseReceipt)));
  await scope(() => service.finishAnswer(releasable.id, owner.id, releaseReceipt.presentationId, acceptedInput.id, token(releaseReceipt)));
  const next = await present(releasable);
  check('confirmed answer advances to a different persisted task', next.presentationId !== releaseReceipt.presentationId && next.taskId !== releaseReceipt.taskId && next.question.includes('task 2'));
  check('repeated completion retains one history and answer', await raw.interviewAnswer.count({ where: { interviewId: releasable.id } }) === 1 && await raw.answerHistory.count({ where: { interviewId: releasable.id } }) === 1);
  await refuses(claim(releasable, releaseReceipt, await message(releasable)), 409);
  await refuses(claim(releasable, next, first), 404);
  check('stale receipt and cross-session answer message are refused', true);

  const changed = await fixture(); const changedReceipt = await present(changed);
  await raw.interviewTask.update({ where: { id: changedReceipt.taskId }, data: { question: 'Synthetic changed task text' } });
  await refuses(claim(changed, changedReceipt, await message(changed)), 409);
  check('task text changes cannot silently change a presented question', true);
  const unconfirmed = await fixture(false);
  await refuses(present(unconfirmed), 409);
  check('unconfirmed interview publishes no receipt', await raw.interviewQuestionPresentation.count({ where: { interviewId: unconfirmed.id } }) === 0);
  await raw.interview.update({ where: { id: iv.id }, data: { status: 'COMPLETED' } });
  await refuses(scope(() => service.finishAnswer(iv.id, owner.id, receipt.presentationId, winner.id, token(receipt))), 409);
  await refuses(claim(iv, receipt, winner), 409);
  check('late completion and replay on ended interviews are refused', true);

  const guardIv = await fixture(); const guardReceipt = await present(guardIv); const guardInput = await message(guardIv);
  await claim(guardIv, guardReceipt, guardInput);
  // Make finish otherwise eligible, so its token rejection cannot be explained
  // by missing scoring or a closed interview. These are synthetic store rows.
  const guardQuestion = await raw.interviewQuestion.create({ data: { organizationId: owner.organizationId, interviewId: guardIv.id, sourceTaskId: guardReceipt.taskId, question: guardReceipt.question, category: 'frontend', difficulty: 'easy', source: 'synthetic-token-guard-fixture' } });
  const guardAnswer = await raw.interviewAnswer.create({ data: { organizationId: owner.organizationId, interviewId: guardIv.id, questionId: guardQuestion.id, messageId: guardInput.id, content: guardInput.content } });
  await raw.answerHistory.create({ data: { organizationId: owner.organizationId, interviewId: guardIv.id, questionId: guardQuestion.id, answerId: guardAnswer.id, question: guardReceipt.question, answer: guardInput.content, score: 0.5 } });
  await raw.interviewTask.update({ where: { id: guardReceipt.taskId }, data: { status: 'COMPLETED' } });
  const guardBefore = await raw.interviewQuestionPresentation.findUniqueOrThrow({ where: { id: guardReceipt.presentationId } });
  const releaseGuardIv = await fixture(); const releaseGuardReceipt = await present(releaseGuardIv); const releaseGuardInput = await message(releaseGuardIv);
  await claim(releaseGuardIv, releaseGuardReceipt, releaseGuardInput);
  const releaseGuardBefore = await raw.interviewQuestionPresentation.findUniqueOrThrow({ where: { id: releaseGuardReceipt.presentationId } });
  await refuses(scope(() => service.claimAnswer(guardIv.id, owner.id, undefined, guardInput.id)), 404);
  for (const invalidToken of [undefined, null, '', 'not-a-claim-token']) {
    await refuses(scope(() => service.markUnknown(guardIv.id, owner.id, guardReceipt.presentationId, guardInput.id, invalidToken)), 409);
    await refuses(scope(() => service.releaseBeforeDispatch(releaseGuardIv.id, owner.id, releaseGuardReceipt.presentationId, releaseGuardInput.id, invalidToken)), 409);
    await refuses(scope(() => service.finishAnswer(guardIv.id, owner.id, guardReceipt.presentationId, guardInput.id, invalidToken)), 409);
  }
  const guardAfter = await raw.interviewQuestionPresentation.findUniqueOrThrow({ where: { id: guardReceipt.presentationId } });
  const releaseGuardAfter = await raw.interviewQuestionPresentation.findUniqueOrThrow({ where: { id: releaseGuardReceipt.presentationId } });
  check('active PROCESSING claims reject missing identifiers/tokens without mutation', releaseGuardAfter.state === 'PROCESSING' && releaseGuardAfter.claimToken === releaseGuardBefore.claimToken && releaseGuardAfter.updatedAt.getTime() === releaseGuardBefore.updatedAt.getTime() && guardAfter.state === 'PROCESSING' && guardAfter.claimToken === guardBefore.claimToken && guardAfter.claimMessageId === guardBefore.claimMessageId && guardAfter.updatedAt.getTime() === guardBefore.updatedAt.getTime());
  const foreignIv = await raw.interview.create({ data: { organizationId: foreign.organizationId, userId: foreign.id, position: 'Synthetic foreign receipt constraint' } });
  const foreignTask = await raw.interviewTask.create({ data: { organizationId: foreign.organizationId, interviewId: foreignIv.id, type: 'QUESTION', question: 'Synthetic foreign task', category: 'frontend', difficulty: 'easy' } });
  const foreignMessage = await raw.message.create({ data: { organizationId: foreign.organizationId, interviewId: foreignIv.id, role: 'assistant', content: foreignTask.question } });
  const constraintIv = await fixture(); const constraintTask = await raw.interviewTask.findFirstOrThrow({ where: { interviewId: constraintIv.id } });
  const constraintMessage = await raw.message.create({ data: { organizationId: owner.organizationId, interviewId: constraintIv.id, role: 'assistant', content: constraintTask.question } });
  const base = { organizationId: owner.organizationId, interviewId: constraintIv.id, taskId: constraintTask.id, messageId: constraintMessage.id, question: constraintTask.question };
  await dbRefuses(raw.interviewQuestionPresentation.create({ data: { ...base, messageId: foreignMessage.id } }), 'P2003');
  await dbRefuses(raw.interviewQuestionPresentation.create({ data: { ...base, taskId: foreignTask.id } }), 'P2003');
  await assert.rejects(raw.interviewQuestionPresentation.create({ data: { ...base, state: 'PROCESSING' } }), error => /23514/.test(String(error)) && /question_presentation_claim_state_check/.test(String(error)));
  check('database rejects foreign-session links and invalid claim state', true);
  const constraintReceipt = await present(constraintIv);
  const secondTask = await raw.interviewTask.findFirstOrThrow({ where: { interviewId: constraintIv.id, id: { not: constraintReceipt.taskId } } });
  const secondQuestion = await raw.message.create({ data: { organizationId: owner.organizationId, interviewId: constraintIv.id, role: 'assistant', content: secondTask.question } });
  await dbRefuses(raw.interviewQuestionPresentation.create({ data: { ...base, taskId: secondTask.id, messageId: secondQuestion.id } }), 'P2002');
  await dbRefuses(raw.message.delete({ where: { id: constraintReceipt.messageId } }), 'P2003');
  check('database permits one unresolved question and protects its message', true);
  await raw.interview.delete({ where: { id: constraintIv.id } });
  check('whole-interview cascade removes receipts and messages', await raw.interviewQuestionPresentation.count({ where: { interviewId: constraintIv.id } }) === 0 && await raw.message.count({ where: { interviewId: constraintIv.id } }) === 0);
  await raw.interviewTask.update({ where: { id: changedReceipt.taskId }, data: { priority: 10 } });
  check('an OPEN receipt remains frozen when queue priorities change', (await present(changed)).presentationId === changedReceipt.presentationId);
  const rollback = await fixture(); failNextPresentation = true;
  await assert.rejects(present(rollback), /Synthetic presentation persistence failure/);
  check('failed presentation persistence rolls back its assistant message', await raw.message.count({ where: { interviewId: rollback.id } }) === 0 && await raw.interviewQuestionPresentation.count({ where: { interviewId: rollback.id } }) === 0);
  check('retry after rolled-back presentation creates one receipt', Boolean(await present(rollback)));
  const racing = await fixture(); const racingReceipt = await present(racing); const racingInput = await message(racing);
  await claim(racing, racingReceipt, racingInput);
  const racingQuestion = await raw.interviewQuestion.create({ data: { organizationId: owner.organizationId, interviewId: racing.id, sourceTaskId: racingReceipt.taskId, question: racingReceipt.question, category: 'frontend', difficulty: 'easy', source: 'synthetic-store-race-fixture' } });
  const racingAnswer = await raw.interviewAnswer.create({ data: { organizationId: owner.organizationId, interviewId: racing.id, questionId: racingQuestion.id, messageId: racingInput.id, content: racingInput.content } });
  await raw.answerHistory.create({ data: { organizationId: owner.organizationId, interviewId: racing.id, questionId: racingQuestion.id, answerId: racingAnswer.id, question: racingReceipt.question, answer: racingInput.content, score: 0.5 } });
  await raw.interviewTask.update({ where: { id: racingReceipt.taskId }, data: { status: 'COMPLETED' } });
  const terminalRace = await Promise.allSettled([
    scope(() => service.finishAnswer(racing.id, owner.id, racingReceipt.presentationId, racingInput.id, token(racingReceipt))),
    scope(() => service.markUnknown(racing.id, owner.id, racingReceipt.presentationId, racingInput.id, token(racingReceipt))),
  ]);
  const terminalReceipt = await raw.interviewQuestionPresentation.findUniqueOrThrow({ where: { id: racingReceipt.presentationId } });
  check('completion versus unknown race admits one durable transition', terminalRace.filter(row => row.status === 'fulfilled').length === 1 && terminalRace.filter(row => row.status === 'rejected' && row.reason.getStatus?.() === 409).length === 1 && ['ANSWERED', 'UNKNOWN'].includes(terminalReceipt.state));
  // Integrated confirmation/end persistence tests. Selection/provider work is
  // deliberately excluded: prepared rows are explicit synthetic store input.
  const snapshotOf = row => Object.fromEntries(['position', 'level', 'mode', 'targetJobId', 'targetJobProfileVersion', 'practiceSkillId'].map(key => [key, row[key]]));
  const preparedFor = row => [1, 2].map(priority => ({
    interviewId: row.id, organizationId: owner.organizationId, type: 'QUESTION',
    category: 'frontend', difficulty: 'easy', priority,
    question: `Synthetic confirmation question ${priority}`,
    context: JSON.stringify({ ...snapshotOf(row), questionSelectionSource: 'synthetic-store-fixture/v1' }),
  }));
  const confirm = row => scope(() => service.confirmPrepared(row.id, owner.id, snapshotOf(row), preparedFor(row)));
  const freshConfirmation = data => raw.interview.create({ data: {
    organizationId: owner.organizationId, userId: owner.id,
    position: 'Synthetic atomic confirmation', resumeConfirmed: false, ...data,
  } });
  const concurrent = await freshConfirmation();
  const confirmed = await Promise.all(Array.from({ length: 8 }, () => confirm(concurrent)));
  check('concurrent confirmation publishes exactly one queue and receipt', confirmed.every(row => row?.presentationId === confirmed[0]?.presentationId)
    && await raw.interviewTask.count({ where: { interviewId: concurrent.id } }) === 2
    && await raw.message.count({ where: { interviewId: concurrent.id } }) === 1
    && await raw.interviewQuestionPresentation.count({ where: { interviewId: concurrent.id } }) === 1
    && (await raw.interview.findUniqueOrThrow({ where: { id: concurrent.id } })).resumeConfirmed);
  const atomic = await freshConfirmation(); failNextPresentation = true;
  await assert.rejects(confirm(atomic), /Synthetic presentation persistence failure/);
  check('failed confirmation atomically rolls back flag queue message and receipt', !(await raw.interview.findUniqueOrThrow({ where: { id: atomic.id } })).resumeConfirmed
    && await raw.interviewTask.count({ where: { interviewId: atomic.id } }) === 0
    && await raw.message.count({ where: { interviewId: atomic.id } }) === 0
    && await raw.interviewQuestionPresentation.count({ where: { interviewId: atomic.id } }) === 0);
  await confirm(atomic);
  check('explicit retry after atomic rollback creates one prepared queue', await raw.interviewTask.count({ where: { interviewId: atomic.id } }) === 2);
  const originalActiveIds = (await raw.targetJob.findMany({ where: { userId: owner.id, organizationId: owner.organizationId, isActive: true }, select: { id: true } })).map(row => row.id).sort();
  const temporaryJobIds = []; let jobFailure;
  try {
    await raw.targetJob.updateMany({ where: { id: { in: originalActiveIds }, userId: owner.id, organizationId: owner.organizationId }, data: { isActive: false } });
  for (const change of [{ profileVersion: 2 }, { isActive: false }]) {
    const job = await raw.targetJob.create({ data: { organizationId: owner.organizationId, userId: owner.id, title: 'Synthetic pinned confirmation job', isActive: true } });
    temporaryJobIds.push(job.id);
    const stale = await freshConfirmation({ targetJobId: job.id, targetJobProfileVersion: 1 });
    await raw.targetJob.update({ where: { id: job.id }, data: change });
    await refuses(confirm(stale), 409);
    check(`confirmation refuses changed job ${Object.keys(change)[0]} before any publication`, !(await raw.interview.findUniqueOrThrow({ where: { id: stale.id } })).resumeConfirmed
      && await raw.interviewTask.count({ where: { interviewId: stale.id } }) === 0
      && await raw.message.count({ where: { interviewId: stale.id } }) === 0);
    // Respect the real one-active-job-per-user index between independent cases.
    await raw.targetJob.update({ where: { id: job.id }, data: { isActive: false } });
  }
  } catch (error) { jobFailure = error; throw error; }
  finally {
    const failures = [];
    try { await raw.targetJob.updateMany({ where: { id: { in: temporaryJobIds }, userId: owner.id, organizationId: owner.organizationId }, data: { isActive: false } }); } catch (error) { failures.push(error); }
    const restored = await Promise.allSettled(originalActiveIds.map(id => raw.targetJob.update({ where: { id }, data: { isActive: true } })));
    for (const result of restored) if (result.status === 'rejected') failures.push(result.reason);
    if (failures.length) throw new AggregateError([...(jobFailure ? [jobFailure] : []), ...failures], 'Synthetic confirmation job fixture restoration failed');
  }
  check('confirmation job cases restore the original active job IDs', JSON.stringify((await raw.targetJob.findMany({ where: { userId: owner.id, organizationId: owner.organizationId, isActive: true }, select: { id: true } })).map(row => row.id).sort()) === JSON.stringify(originalActiveIds));
  const noAnswer = await freshConfirmation(); await confirm(noAnswer);
  const emptyEnd = await scope(() => service.reserveEnd(noAnswer.id, owner.id));
  check('only presented questions exit as no_answers with complete cascade', emptyEnd.state === 'EMPTY_DELETED' && emptyEnd.reason === 'no_answers'
    && await raw.interview.count({ where: { id: noAnswer.id } }) === 0
    && await raw.interviewTask.count({ where: { interviewId: noAnswer.id } }) === 0
    && await raw.message.count({ where: { interviewId: noAnswer.id } }) === 0
    && await raw.interviewQuestionPresentation.count({ where: { interviewId: noAnswer.id } }) === 0);
  const legacyUnscored = await freshConfirmation();
  const legacyMessage = await raw.message.create({ data: { organizationId: owner.organizationId, interviewId: legacyUnscored.id, role: 'assistant', content: 'Synthetic legacy message without a presentation receipt' } });
  await refuses(scope(() => service.reserveEnd(legacyUnscored.id, owner.id)), 409);
  check('legacy unscored messages without receipts are preserved instead of treated as empty', await raw.interview.count({ where: { id: legacyUnscored.id, status: 'IN_PROGRESS' } }) === 1
    && await raw.message.count({ where: { id: legacyMessage.id, content: legacyMessage.content } }) === 1
    && await raw.interviewQuestionPresentation.count({ where: { interviewId: legacyUnscored.id } }) === 0);
  const blockedEnd = await freshConfirmation(); const blockedReceipt = await confirm(blockedEnd); const blockedInput = await message(blockedEnd);
  await claim(blockedEnd, blockedReceipt, blockedInput);
  await scope(() => service.markUnknown(blockedEnd.id, owner.id, blockedReceipt.presentationId, blockedInput.id, token(blockedReceipt)));
  await refuses(scope(() => service.reserveEnd(blockedEnd.id, owner.id)), 409);
  check('UNKNOWN prevents closing or deleting the interview', (await raw.interview.findUniqueOrThrow({ where: { id: blockedEnd.id } })).status === 'IN_PROGRESS'
    && (await raw.interviewQuestionPresentation.findUniqueOrThrow({ where: { id: blockedReceipt.presentationId } })).state === 'UNKNOWN');
  // releasable already contains one explicit synthetic scored answer above.
  // That avoids an unrelated no-answer/history rejection deciding this race.
  const endRaceInput = await message(releasable);
  const endRace = await Promise.allSettled([
    claim(releasable, next, endRaceInput),
    scope(() => service.reserveEnd(releasable.id, owner.id)),
  ]);
  check('end versus answer claim admits exactly one side under the parent lock', endRace.filter(row => row.status === 'fulfilled').length === 1
    && endRace.filter(row => row.status === 'rejected' && row.reason.getStatus?.() === 409).length === 1);
  const endRaceInterview = await raw.interview.findUniqueOrThrow({ where: { id: releasable.id } });
  const endRaceReceipt = await raw.interviewQuestionPresentation.findUniqueOrThrow({ where: { id: next.presentationId } });
  check('end versus claim leaves no processing claim on a completed interview', (endRaceInterview.status === 'COMPLETED' && endRaceReceipt.state === 'OPEN')
    || (endRaceInterview.status === 'IN_PROGRESS' && endRaceReceipt.state === 'PROCESSING'));
  // Actual business method with an explicit in-process synthetic LLM dependency.
  // No gateway/provider is contacted and no scored rows are seeded for these cases.
  let syntheticDecisionCalls = 0; let requestFollowUp = false;
  const queue = new DynamicTaskQueueService(scoped, { chat: async () => {
    syntheticDecisionCalls++;
    return { content: JSON.stringify({ score: 0.5, completeness: 0.5, correctness: 0.5, depth: 0.5,
      feedback: 'Synthetic business recovery decision', keyPoints: ['constraint'], missingPoints: [],
      shouldFollowUp: requestFollowUp, followUpQuestion: requestFollowUp ? 'Synthetic follow-up constraint?' : null,
      followUpReason: requestFollowUp ? 'Synthetic recovery fixture' : null, shouldAdvance: false, advancedQuestion: null }) };
  } });
  const durableCounts = async interviewId => ({
    answers: await raw.interviewAnswer.count({ where: { interviewId } }),
    history: await raw.answerHistory.count({ where: { interviewId } }),
    ledger: await raw.usageLedger.count(), syntheticDecisionCalls,
  });
  const nextRecovery = await freshConfirmation(); const nextRecoveryReceipt = await confirm(nextRecovery); const nextRecoveryInput = await message(nextRecovery);
  await claim(nextRecovery, nextRecoveryReceipt, nextRecoveryInput);
  await scope(() => queue.completeTask(nextRecovery.id, owner.id, nextRecoveryReceipt.taskId, nextRecoveryInput.content, nextRecoveryInput.id, { presentationId: nextRecoveryReceipt.presentationId, claimToken: token(nextRecoveryReceipt) }));
  await scope(() => service.finishAnswer(nextRecovery.id, owner.id, nextRecoveryReceipt.presentationId, nextRecoveryInput.id, token(nextRecoveryReceipt)));
  const completedCounts = await durableCounts(nextRecovery.id);
  assert.equal(completedCounts.answers, 1); assert.equal(completedCounts.history, 1); assert.equal(completedCounts.syntheticDecisionCalls, 1);
  failNextPresentation = true;
  await assert.rejects(present(nextRecovery), /Synthetic presentation persistence failure/);
  check('failed next presentation preserves the completed answer with pure read returning null', await scope(() => service.readCurrent(nextRecovery.id, owner.id)) === null
    && (await raw.interviewQuestionPresentation.findUniqueOrThrow({ where: { id: nextRecoveryReceipt.presentationId } })).state === 'ANSWERED');
  const recoveredQuestion = await confirm(nextRecovery);
  assert.notEqual(recoveredQuestion.presentationId, nextRecoveryReceipt.presentationId); assert.equal(recoveredQuestion.state, 'OPEN');
  assert.deepEqual(await durableCounts(nextRecovery.id), completedCounts);
  check('explicit confirmation repairs next presentation without repeated score history ledger or synthetic decision', recoveredQuestion.taskId !== nextRecoveryReceipt.taskId);
  check('failed next presentation rolls back assistant message before successful repair', await raw.message.count({ where: { interviewId: nextRecovery.id, role: 'assistant' } }) === 2);

  const followFailure = await freshConfirmation(); const followReceipt = await confirm(followFailure); const followInput = await message(followFailure);
  await claim(followFailure, followReceipt, followInput); requestFollowUp = true; failNextFollowUp = true;
  await assert.rejects(scope(() => queue.completeTask(followFailure.id, owner.id, followReceipt.taskId, followInput.content, followInput.id, { presentationId: followReceipt.presentationId, claimToken: token(followReceipt) })), /Synthetic follow-up persistence failure/);
  check('real completeTask can fail follow-up insertion after durable normalized scoring', await raw.interviewAnswer.count({ where: { interviewId: followFailure.id } }) === 1
    && await raw.answerHistory.count({ where: { interviewId: followFailure.id } }) === 1
    && (await raw.interviewTask.findUniqueOrThrow({ where: { id: followReceipt.taskId } })).status === 'COMPLETED'
    && await raw.interviewTask.count({ where: { interviewId: followFailure.id, type: 'FOLLOW_UP' } }) === 0 && !failNextFollowUp);
  await scope(() => service.markUnknown(followFailure.id, owner.id, followReceipt.presentationId, followInput.id, token(followReceipt)));
  const unknownCounts = await durableCounts(followFailure.id);
  const replayClaim = await claim(followFailure, followReceipt, followInput);
  assert.equal(replayClaim.state, 'UNKNOWN'); assert.equal(replayClaim.claimToken, undefined);
  await refuses(claim(followFailure, followReceipt, await message(followFailure)), 409);
  await refuses(scope(() => service.reserveEnd(followFailure.id, owner.id)), 409);
  assert.deepEqual(await durableCounts(followFailure.id), unknownCounts);
  check('post-scoring failure remains UNKNOWN and replay cannot authorize another dispatch', (await scope(() => service.readCurrent(followFailure.id, owner.id))).state === 'UNKNOWN' && syntheticDecisionCalls === 2);
  check('store tests create no model usage ledger entries', await raw.usageLedger.count() === beforeLedger);
  console.log(`Question presentation persistence: ${checks} checks passed; synthetic direct-service/database fixture only; candidate API/browser fix remains pending.`);
}
run().finally(async () => { await Promise.all([raw.$disconnect(), scoped.$disconnect()]); }).catch(error => { console.error(error); process.exitCode = 1; });
