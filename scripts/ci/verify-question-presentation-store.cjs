// Private persistence fixture only. It seeds synthetic scoring rows to exercise
// the store contract; it is not an API, browser, model-quality or scoring test.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
assert.equal(process.env.GOLDEN_FIXTURE_SYNTHETIC, '1');
assert.equal(process.env.NODE_ENV, 'production');
assert.equal(process.env.DATABASE_URL, 'postgresql://postgres@fixture-pg:5432/fixture');
const product = createRequire(`${process.cwd()}/package.json`);
const { PrismaClient } = product('@prisma/client');
const { QuestionPresentationService } = product('./dist/modules/interview/services/question-presentation.service');
const { tenantContext } = product('./dist/modules/organizations/tenant-context');
const { tenantMiddleware } = product('./dist/modules/organizations/tenant-policy');
const raw = new PrismaClient(); const scoped = new PrismaClient(); scoped.$use(tenantMiddleware);
const service = new QuestionPresentationService(scoped);
let failNextPresentation = false;
scoped.$use(async (params, next) => {
  if (failNextPresentation && params.model === 'InterviewQuestionPresentation' && params.action === 'create') { failNextPresentation = false; throw new Error('Synthetic presentation persistence failure'); }
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
  check('store tests create no model usage ledger entries', await raw.usageLedger.count() === beforeLedger);
  console.log(`Question presentation persistence: ${checks} checks passed; synthetic direct-service/database fixture only; candidate API/browser fix remains pending.`);
}
run().finally(async () => { await Promise.all([raw.$disconnect(), scoped.$disconnect()]); }).catch(error => { console.error(error); process.exitCode = 1; });
