const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const product = createRequire(`${process.cwd()}/package.json`);
const { PrismaClient } = product('@prisma/client');
assert.equal(process.env.DATABASE_URL, 'postgresql://postgres@fixture-pg:5432/fixture');
const file = '/tmp/fixture-policy-browser.json';
const prisma = new PrismaClient();
const { MilvusClient, ConsistencyLevelEnum } = product('@zilliz/milvus2-sdk-node');
const resumeMarker = 'Synthetic confirmation race';
async function resumeClient() {
  assert.equal(process.env.MILVUS_URL, 'http://fixture-milvus:19530');
  return new MilvusClient({ address: process.env.MILVUS_URL });
}
async function removeResume() {
  const client = await resumeClient();
  try {
    const result = await client.deleteEntities({ collection_name: 'resumes', filter: `userId == "fixture-ci-owner" and name == "${resumeMarker}"` });
    assert.equal(result.status.error_code, 'Success');
    const read = await client.query({ collection_name: 'resumes', filter: `userId == "fixture-ci-owner" and name == "${resumeMarker}"`, output_fields: ['id'], consistency_level: ConsistencyLevelEnum.Strong });
    assert.equal(read.status.error_code, 'Success');
    assert.ok(Array.isArray(read.data));
    assert.equal(read.data.length, 0);
  } finally { await client.closeConnection(); }
}
async function stats() {
  const r = await fetch('http://127.0.0.1:3335/fixture/stats', { signal: AbortSignal.timeout(5000) });
  assert.equal(r.status, 200); const value = await r.json();
  for (const key of ['chat', 'embedding', 'rerank', 'externalRequests']) assert.ok(Number.isSafeInteger(value[key]) && value[key] >= 0);
  return value;
}
// I06 uses actual HTTP uploads. This control never inserts a resume.
async function resumeUploadControl(mode) {
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (mode === 'resume-upload-prepare') {
    assert.ok(!saved.resumeUpload);
    const suffix = require('node:crypto').randomBytes(6).toString('hex');
    const userId = `fixture-resume-${suffix}`, organizationId = `synthetic-resume-${suffix}`, jobId = `synthetic-resume-job-${suffix}`;
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: 'fixture-ci-owner' } });
    saved.resumeUpload = { userId, organizationId, jobId, baseline: await stats(), ledger: await prisma.usageLedger.count(), runs: await prisma.run.count() };
    fs.writeFileSync(file, JSON.stringify(saved), { mode: 0o600 });
    await prisma.$transaction(async tx => {
      await tx.organization.create({ data: { id: organizationId, name: 'Synthetic resume upload', planId: 'free' } });
      await tx.user.create({ data: { id: userId, email: `${userId}@example.invalid`, organizationId, passwordHash: owner.passwordHash, role: 'USER' } });
      await tx.targetJob.create({ data: { id: jobId, organizationId, userId, title: 'Synthetic Resume Engineer', level: 'P5', isActive: true } });
    });
    return { userId, jobId, position: 'Synthetic Resume Engineer' };
  }
  const state = saved.resumeUpload;
  if (!state && mode === 'resume-upload-cleanup') return { cleaned: true };
  assert.ok(state); assert.match(state.userId, /^fixture-resume-[a-f0-9]{12}$/);
  const current = await stats();
  const afterFailure = ['resume-upload-failure', 'resume-upload-inspect'].includes(mode);
  const expected = { ...state.baseline, embedding: state.baseline.embedding + (afterFailure ? 1 : 2), chat: state.baseline.chat + (afterFailure ? 0 : 1) };
  if (mode !== 'resume-upload-cleanup') assert.deepEqual(current, expected);
  if (mode === 'resume-upload-failure') {
    assert.equal(await prisma.usageLedger.count({ where: { userId: state.userId } }), 0);
    return { stats: current };
  }
  const client = await resumeClient();
  try {
    const filter = `userId == ${JSON.stringify(state.userId)}`;
    if (mode === 'resume-upload-cleanup') {
      const removed = await client.deleteEntities({ collection_name: 'resumes', filter, timeout: 5000 });
      assert.equal(removed.status.error_code, 'Success');
    }
    const read = await client.query({ collection_name: 'resumes', filter, timeout: 5000, consistency_level: ConsistencyLevelEnum.Strong,
      output_fields: ['id', 'userId', 'name', 'position', 'summary', 'skills', 'createdAt'], limit: 10 });
    assert.equal(read.status.error_code, 'Success'); assert.ok(Array.isArray(read.data));
    if (mode === 'resume-upload-inspect') return { rows: read.data, stats: current };
    if (mode === 'resume-upload-read') {
      const ledger = await prisma.usageLedger.findMany({ where: { userId: state.userId } });
      assert.equal(ledger.length, 1); assert.equal(ledger[0].type, 'LLM_CALL'); assert.equal(ledger[0].units, 1);
      assert.equal(await prisma.run.count(), state.runs);
      state.verified = true; state.expected = expected;
      fs.writeFileSync(file, JSON.stringify(saved), { mode: 0o600 });
      return { rows: read.data, stats: current, ledger: ledger.length };
    }
    assert.equal(mode, 'resume-upload-cleanup'); assert.equal(read.data.length, 0);
  } finally { await client.closeConnection(); }
  // No model counters are reset. Accept only previously verified exact deltas.
  let verificationFailure;
  try { assert.ok(state.verified); assert.deepEqual(current, state.expected); } catch (error) { verificationFailure = error; }
  await prisma.$transaction(async tx => {
    await tx.usageLedger.deleteMany({ where: { userId: state.userId, organizationId: state.organizationId } });
    await tx.targetJob.deleteMany({ where: { id: state.jobId, userId: state.userId } });
    await tx.user.deleteMany({ where: { id: state.userId, organizationId: state.organizationId } });
    await tx.organization.deleteMany({ where: { id: state.organizationId } });
  });
  assert.equal(await prisma.usageLedger.count(), state.ledger); assert.equal(await prisma.run.count(), state.runs);
  if (!verificationFailure) saved.resumeUploadAllowance = { chat: current.chat - state.baseline.chat, embedding: current.embedding - state.baseline.embedding, rerank: 0, externalRequests: 0 };
  delete saved.resumeUpload; fs.writeFileSync(file, JSON.stringify(saved), { mode: 0o600 });
  if (verificationFailure) throw verificationFailure;
  return { cleaned: true, allowance: saved.resumeUploadAllowance };
}
// Training fixtures seed formal evidence; they never call an evaluator or embedder.
async function trainingControl(mode) {
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (mode === 'training-prepare') {
    assert.ok(!saved.training);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: 'fixture-ci-owner' } });
    const { randomUUID } = require('node:crypto');
    const key = `synthetic-training-ui-${randomUUID()}`;
    const ids = { job: `${key}-job`, skill: `${key}-skill`, definition: `${key}-definition`, interview: `${key}-baseline`, run: `${key}-run` };
    saved.training = { ids, organizationId: user.organizationId,
      activeJobs: (await prisma.targetJob.findMany({ where: { userId: user.id, isActive: true }, select: { id: true } })).map(item => item.id),
      ledger: await prisma.usageLedger.count(), stats: await stats() };
    fs.writeFileSync(file, JSON.stringify(saved), { mode: 0o600 });
    await prisma.$transaction(async tx => {
      await tx.targetJob.updateMany({ where: { userId: user.id, isActive: true }, data: { isActive: false } });
      await tx.targetJob.create({ data: { id: ids.job, organizationId: user.organizationId, userId: user.id, title: 'Synthetic training UI role', level: 'P5', isActive: true } });
      await tx.skillDefinition.create({ data: { id: ids.skill, slug: key, name: 'Synthetic training UI skill', taxonomyVersion: key, applicableRoles: ['Fixture'] } });
      await tx.jobSkillRequirement.create({ data: { organizationId: user.organizationId, targetJobId: ids.job, skillId: ids.skill, importance: 3, source: 'offline-ui-fixture' } });
      await tx.evaluationDefinition.create({ data: { id: ids.definition, version: key, definitionHash: key, evaluatorVersion: 'offline-fixture', promptVersion: 'offline-fixture', rubricVersion: 'offline-fixture', modelProvider: 'offline-fixture', modelVersion: 'offline-fixture', evaluationMode: 'FINAL', fallbackPolicyVersion: 'offline-fixture' } });
      await tx.interview.create({ data: { id: ids.interview, organizationId: user.organizationId, userId: user.id, targetJobId: ids.job, targetJobProfileVersion: 1, mode: 'SKILL_PRACTICE', practiceSkillId: ids.skill, position: 'Synthetic training UI role', status: 'COMPLETED' } });
      const message = await tx.message.create({ data: { organizationId: user.organizationId, interviewId: ids.interview, role: 'user', content: 'Synthetic training UI baseline constraint' } });
      const question = await tx.interviewQuestion.create({ data: { organizationId: user.organizationId, interviewId: ids.interview, question: 'Explain a synthetic constraint', skillId: ids.skill, category: 'Fixture', difficulty: 'medium', source: 'offline-ui-fixture' } });
      const answer = await tx.interviewAnswer.create({ data: { organizationId: user.organizationId, interviewId: ids.interview, questionId: question.id, messageId: message.id, content: message.content } });
      await tx.evaluationRun.create({ data: { id: ids.run, organizationId: user.organizationId, interviewId: ids.interview, definitionId: ids.definition, inputRevision: key, idempotencyKey: key, mode: 'FINAL', status: 'SUCCEEDED' } });
      await tx.assessmentEvidence.create({ data: { organizationId: user.organizationId, evaluationRunId: ids.run, interviewId: ids.interview, questionId: question.id, answerId: answer.id, skillId: ids.skill, answerExcerpt: message.content, expectedEvidence: ['explicit constraint'], missingEvidence: ['verification'], reason: 'Synthetic missing verification evidence', score: 0.4, confidence: 1 } });
    });
    const { tenantContext } = product('./dist/modules/organizations/tenant-context');
    const { tenantMiddleware } = product('./dist/modules/organizations/tenant-policy');
    const { SkillStateAggregationService } = product('./dist/modules/interview/services/skill-state-aggregation.service');
    const scoped = new PrismaClient(); scoped.$use(tenantMiddleware);
    try { await tenantContext.run({ organizationId: user.organizationId, userId: user.id }, () => scoped.$transaction(tx => new SkillStateAggregationService().aggregateFinalRun(tx, { id: ids.run, interviewId: ids.interview, interview: { userId: user.id, targetJobId: ids.job } }))); }
    finally { await scoped.$disconnect(); }
    assert.equal((await prisma.candidateSkillState.findFirstOrThrow({ where: { userId: user.id, targetJobId: ids.job, skillId: ids.skill } })).score, 40);
    return { targetJobId: ids.job, skillId: ids.skill, sourceRunId: ids.run };
  }
  const training = saved.training;
  if (!training && mode === 'training-cleanup') return { cleaned: true };
  assert.ok(training);
  const { ids } = training;
  if (mode === 'training-cleanup') {
    await prisma.$transaction(async tx => {
      const interviews = await tx.interview.findMany({ where: { userId: 'fixture-ci-owner', targetJobId: ids.job }, select: { id: true } });
      await tx.usageLedger.deleteMany({ where: { userId: 'fixture-ci-owner', type: 'INTERVIEW_START', interviewId: { in: interviews.map(item => item.id) } } });
      await tx.trainingRecommendation.deleteMany({ where: { userId: 'fixture-ci-owner', targetJobId: ids.job } });
      await tx.candidateSkillState.deleteMany({ where: { userId: 'fixture-ci-owner', targetJobId: ids.job } });
      await tx.assessmentEvidence.deleteMany({ where: { evaluationRunId: ids.run } });
      await tx.interview.deleteMany({ where: { userId: 'fixture-ci-owner', targetJobId: ids.job } });
      await tx.targetJob.deleteMany({ where: { id: ids.job, userId: 'fixture-ci-owner' } });
      await tx.evaluationDefinition.deleteMany({ where: { id: ids.definition } });
      await tx.skillDefinition.deleteMany({ where: { id: ids.skill } });
      await tx.targetJob.updateMany({ where: { id: { in: training.activeJobs }, userId: 'fixture-ci-owner' }, data: { isActive: true } });
    });
    assert.deepEqual(await stats(), training.stats);
    assert.equal(await prisma.usageLedger.count(), training.ledger);
    delete saved.training; fs.writeFileSync(file, JSON.stringify(saved), { mode: 0o600 });
    return { cleaned: true };
  }
  const recommendation = await prisma.trainingRecommendation.findFirstOrThrow({ where: { userId: 'fixture-ci-owner', targetJobId: ids.job, skillId: ids.skill, sourceRunId: ids.run }, include: { attempts: true } });
  assert.equal(recommendation.attempts.length, 1);
  const attempt = recommendation.attempts[0];
  assert.equal((await prisma.candidateSkillState.findFirstOrThrow({ where: { targetJobId: ids.job, skillId: ids.skill } })).score, 40);
  if (mode === 'training-verify-complete') {
    assert.equal(recommendation.status, 'COMPLETED'); assert.equal(attempt.retestInterviewId, null);
    assert.equal(await prisma.usageLedger.count(), training.ledger);
  } else if (mode === 'training-verify-retest') {
    assert.equal(recommendation.status, 'RETEST_STARTED'); assert.ok(attempt.retestInterviewId);
    const interview = await prisma.interview.findUniqueOrThrow({ where: { id: attempt.retestInterviewId } });
    assert.equal(interview.userId, 'fixture-ci-owner'); assert.equal(interview.organizationId, training.organizationId);
    assert.equal(interview.targetJobId, ids.job); assert.equal(interview.targetJobProfileVersion, 1);
    assert.equal(interview.practiceSkillId, ids.skill); assert.equal(interview.mode, 'SKILL_PRACTICE'); assert.equal(interview.status, 'IN_PROGRESS');
    const retests = await prisma.interview.findMany({ where: { userId: 'fixture-ci-owner', targetJobId: ids.job, id: { not: ids.interview } }, select: { id: true } });
    assert.deepEqual(retests.map(item => item.id), [interview.id]);
    const usage = await prisma.usageLedger.findMany({ where: { interviewId: interview.id } });
    assert.equal(usage.length, 1); assert.equal(usage[0].type, 'INTERVIEW_START'); assert.equal(usage[0].units, 1);
    assert.equal(await prisma.usageLedger.count(), training.ledger + 1);
  } else throw Error('Unknown training fixture mode');
  assert.deepEqual(await stats(), training.stats);
  return { recommendationId: recommendation.id, attemptId: attempt.id, retestInterviewId: attempt.retestInterviewId };
}
// Isolated UNKNOWN view fixture: real services, no scoring/provider dispatch.
async function unknownControl(mode) {
  assert.equal(process.env.NODE_ENV, 'production');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (mode === 'unknown-prepare') {
    assert.ok(!saved.unknown);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: 'fixture-ci-owner' } });
    const id = `synthetic-unknown-${require('node:crypto').randomUUID()}`;
    saved.unknown = { id, organizationId: user.organizationId, ledger: await prisma.usageLedger.count(), runs: await prisma.run.count(), stats: await stats() };
    fs.writeFileSync(file, JSON.stringify(saved), { mode: 0o600 });
    await prisma.interview.create({ data: { id, userId: user.id, organizationId: user.organizationId, position: 'Synthetic Frontend UNKNOWN fixture', resumeConfirmed: false } });
    return { interviewId: id };
  }
  const fixture = saved.unknown;
  if (!fixture) { assert.equal(mode, 'unknown-cleanup'); return {}; }
  assert.match(fixture.id, /^synthetic-unknown-[0-9a-f-]{36}$/);
  if (mode === 'unknown-cleanup') {
    // Cleanup still executes when an assertion below fails; preserve both errors.
    let verificationError;
    try { assert.equal(await prisma.usageLedger.count(), fixture.ledger); assert.equal(await prisma.run.count(), fixture.runs); assert.deepEqual(await stats(), fixture.stats); }
    catch (error) { verificationError = error; }
    try {
      await prisma.interview.deleteMany({ where: { id: fixture.id, userId: 'fixture-ci-owner', organizationId: fixture.organizationId } });
      assert.equal(await prisma.interview.count({ where: { id: fixture.id } }), 0);
      delete saved.unknown; fs.writeFileSync(file, JSON.stringify(saved), { mode: 0o600 });
    } catch (cleanupError) { throw new AggregateError([...(verificationError ? [verificationError] : []), cleanupError], 'UNKNOWN fixture cleanup failed'); }
    if (verificationError) throw verificationError;
    return {};
  }
  if (mode === 'unknown-mark') {
    const { tenantContext } = product('./dist/modules/organizations/tenant-context');
    const { tenantMiddleware } = product('./dist/modules/organizations/tenant-policy');
    const { QuestionPresentationService } = product('./dist/modules/interview/services/question-presentation.service');
    const scoped = new PrismaClient(); scoped.$use(tenantMiddleware);
    try {
      await tenantContext.run({ organizationId: fixture.organizationId, userId: 'fixture-ci-owner' }, async () => {
        const service = new QuestionPresentationService(scoped);
        const receipt = await service.readCurrent(fixture.id, 'fixture-ci-owner'); assert.equal(receipt?.state, 'OPEN');
        const message = await scoped.message.create({ data: { interviewId: fixture.id, role: 'user', content: 'Synthetic controlled UNKNOWN input; no provider dispatched' } });
        const claim = await service.claimAnswer(fixture.id, 'fixture-ci-owner', receipt.presentationId, message.id);
        assert.equal(claim.state, 'CLAIMED'); assert.ok(claim.claimToken);
        await service.markUnknown(fixture.id, 'fixture-ci-owner', receipt.presentationId, message.id, claim.claimToken);
      });
    } finally { await scoped.$disconnect(); }
  } else assert.equal(mode, 'unknown-verify');
  const interview = await prisma.interview.findFirstOrThrow({ where: { id: fixture.id, userId: 'fixture-ci-owner', organizationId: fixture.organizationId } });
  assert.equal(interview.status, 'IN_PROGRESS'); assert.equal(interview.resumeConfirmed, true);
  const receipts = await prisma.interviewQuestionPresentation.findMany({ where: { interviewId: fixture.id } }); assert.equal(receipts.length, 1);
  assert.equal(receipts[0].state, 'UNKNOWN'); assert.ok(receipts[0].claimMessageId); assert.ok(receipts[0].claimToken);
  assert.equal(await prisma.interviewAnswer.count({ where: { interviewId: fixture.id } }), 0);
  assert.equal(await prisma.answerHistory.count({ where: { interviewId: fixture.id } }), 0);
  assert.equal(await prisma.message.count({ where: { interviewId: fixture.id, role: 'user' } }), 1);
  assert.equal(await prisma.usageLedger.count(), fixture.ledger); assert.equal(await prisma.run.count(), fixture.runs); assert.deepEqual(await stats(), fixture.stats);
  return { interviewId: fixture.id, presentationId: receipts[0].id, question: receipts[0].question, state: receipts[0].state };
}
(async () => {
  if (process.argv[2]?.startsWith('unknown-')) {
    console.log(JSON.stringify(await unknownControl(process.argv[2])));
  } else if (process.argv[2]?.startsWith('resume-upload-')) {
    console.log(JSON.stringify(await resumeUploadControl(process.argv[2])));
  } else if (process.argv[2]?.startsWith('training-')) {
    console.log(JSON.stringify(await trainingControl(process.argv[2])));
  } else if (process.argv[2] === 'prepare') {
    assert.ok(!fs.existsSync(file));
    const user = await prisma.user.findUniqueOrThrow({ where: { id: 'fixture-ci-owner' } });
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { slug: 'personal-fixture-ci-owner' } });
    const agent = await prisma.agent.findUniqueOrThrow({ where: { workspaceId_key: { workspaceId: workspace.id, key: 'interview-interviewer' } } });
    assert.equal(agent.organizationId, user.organizationId);
    const draft = await prisma.agentVersion.findUniqueOrThrow({ where: { agentId_version: { agentId: agent.id, version: '99.0.0' } } });
    assert.equal(draft.status, 'DRAFT');
    const interview = await prisma.interview.findFirstOrThrow({ where: { userId: user.id, position: 'Synthetic admission fixture' } });
    const freshExit = await prisma.interview.create({ data: { organizationId: user.organizationId, userId: user.id, position: 'Synthetic fresh confirmation exit', resumeConfirmed: false } });
    const alternate = await prisma.interview.create({ data: { organizationId: user.organizationId, userId: user.id, position: 'Synthetic error scope', resumeConfirmed: true } });
    const lifecycle = await prisma.interview.create({ data: { organizationId: user.organizationId, userId: user.id, position: 'Synthetic end lifecycle', resumeConfirmed: true } });
    const timeoutInterview = await prisma.interview.create({ data: { organizationId: user.organizationId, userId: user.id, position: 'Synthetic end timeout', resumeConfirmed: true } });
    const saved = { freshExitId: freshExit.id, timeoutId: timeoutInterview.id, lifecycleId: lifecycle.id, alternateId: alternate.id, agentId: agent.id, originalVersionId: agent.currentVersionId, interviewId: interview.id, originalConfirmed: interview.resumeConfirmed, runs: await prisma.run.count(), ledger: await prisma.usageLedger.count(), stats: await stats() };
    saved.questionMessages = (await prisma.message.findMany({ where: { interviewId: interview.id }, orderBy: { id: 'asc' }, select: { id: true, role: true, content: true } }));
    const receipts = await prisma.interviewQuestionPresentation.findMany({ where: { interviewId: interview.id } });
    assert.equal(receipts.length, 1); assert.equal(receipts[0].state, 'OPEN');
    assert.deepEqual(saved.questionMessages, [{ id: receipts[0].messageId, role: 'assistant', content: receipts[0].question }]);
    fs.writeFileSync(file, JSON.stringify(saved), { mode: 0o600 });
    await prisma.interview.update({ where: { id: interview.id }, data: { resumeConfirmed: true } });
    await prisma.agent.update({ where: { id: agent.id }, data: { currentVersionId: draft.id } });
    console.log(JSON.stringify({ freshExitId: freshExit.id, interviewId: interview.id, alternateId: alternate.id, lifecycleId: lifecycle.id, timeoutId: timeoutInterview.id }));
  } else if (['verify-fresh-exit-present', 'verify-fresh-exit-deleted'].includes(process.argv[2])) {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    const interview = await prisma.interview.findUnique({ where: { id: saved.freshExitId } });
    if (process.argv[2] === 'verify-fresh-exit-deleted') {
      assert.equal(interview, null);
      for (const model of ['message', 'interviewTask', 'interviewQuestionPresentation', 'interviewAnswer', 'answerHistory']) {
        assert.equal(await prisma[model].count({ where: { interviewId: saved.freshExitId } }), 0);
      }
    } else {
      assert.ok(interview); assert.equal(interview.status, 'IN_PROGRESS'); assert.equal(interview.resumeConfirmed, true);
      const receipt = await prisma.interviewQuestionPresentation.findFirstOrThrow({ where: { interviewId: saved.freshExitId, state: 'OPEN' } });
      assert.deepEqual(await prisma.message.findMany({ where: { interviewId: saved.freshExitId }, select: { id: true, role: true, content: true } }), [{ id: receipt.messageId, role: 'assistant', content: receipt.question }]);
      assert.equal(await prisma.interviewAnswer.count({ where: { interviewId: saved.freshExitId } }), 0);
      assert.equal(await prisma.answerHistory.count({ where: { interviewId: saved.freshExitId } }), 0);
    }
  } else if (process.argv[2] === 'verify-timeout-deleted') {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(await prisma.interview.findUnique({ where: { id: saved.timeoutId } }), null);
  } else if (process.argv[2] === 'verify-lifecycle-deleted') {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(await prisma.interview.findUnique({ where: { id: saved.lifecycleId } }), null);
  } else if (['verify-end-present', 'verify-end-deleted'].includes(process.argv[2])) {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    const interview = await prisma.interview.findUnique({ where: { id: saved.alternateId } });
    if (process.argv[2] === 'verify-end-deleted') assert.equal(interview, null);
    else {
      assert.ok(interview); assert.equal(interview.status, 'IN_PROGRESS');
      const receipt = await prisma.interviewQuestionPresentation.findFirstOrThrow({ where: { interviewId: saved.alternateId, state: 'OPEN' } });
      const messages = await prisma.message.findMany({ where: { interviewId: saved.alternateId }, select: { id: true, role: true, content: true } });
      assert.deepEqual(messages, [{ id: receipt.messageId, role: 'assistant', content: receipt.question }]);
      assert.equal(await prisma.interviewAnswer.count({ where: { interviewId: saved.alternateId } }), 0);
    }
  } else if (process.argv[2] === 'verify-confirmation') {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal((await prisma.interview.findUniqueOrThrow({ where: { id: saved.interviewId } })).resumeConfirmed, true);
  } else if (process.argv[2] === 'prepare-confirmation') {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    saved.confirmationResume = true;
    fs.writeFileSync(file, JSON.stringify(saved), { mode: 0o600 });
    const client = await resumeClient();
    try {
      const result = await client.insert({ collection_name: 'resumes', data: [{ vector: Array.from({ length: 1024 }, (_, i) => i === 0 ? 1 : 0), userId: 'fixture-ci-owner', name: resumeMarker, position: 'Synthetic engineer', summary: 'Synthetic confirmation fixture only', skills: 'Testing', createdAt: new Date().toISOString() }] });
      assert.equal(result.status.error_code, 'Success');
      assert.equal(Number(result.insert_cnt), 1);
      const flushed = await client.flushSync({ collection_names: ['resumes'] });
      assert.equal(flushed.status.error_code, 'Success');
    } finally { await client.closeConnection(); }
    await prisma.interview.update({ where: { id: saved.interviewId }, data: { resumeConfirmed: false } });
    console.log(JSON.stringify({ interviewId: saved.interviewId, alternateId: saved.alternateId }));
  } else {
    if (!fs.existsSync(file)) return;
    let saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    let trainingFailure;
    if (saved.unknown) { try { await unknownControl('unknown-cleanup'); saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { trainingFailure = trainingFailure ? new AggregateError([trainingFailure, error], 'Synthetic fixture cleanup failures') : error; } }
    if (saved.resumeUpload) { try { await resumeUploadControl('resume-upload-cleanup'); saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { trainingFailure = trainingFailure ? new AggregateError([trainingFailure, error], 'Synthetic fixture cleanup failures') : error; } }
    if (saved.training) { try { await trainingControl('training-cleanup'); saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { trainingFailure = trainingFailure ? new AggregateError([trainingFailure, error], 'Synthetic fixture cleanup failures') : error; } }
    let primary = trainingFailure;
    try {
      assert.deepEqual(await prisma.message.findMany({ where: { interviewId: saved.interviewId }, orderBy: { id: 'asc' }, select: { id: true, role: true, content: true } }), saved.questionMessages);
      assert.equal(await prisma.interviewAnswer.count({ where: { interviewId: saved.interviewId } }), 0);
      assert.equal(await prisma.answerHistory.count({ where: { interviewId: saved.interviewId } }), 0);
      assert.equal(await prisma.run.count(), saved.runs); assert.equal(await prisma.usageLedger.count(), saved.ledger);
      const expectedStats = { ...saved.stats };
      for (const [key, delta] of Object.entries(saved.resumeUploadAllowance || {})) expectedStats[key] += delta;
      assert.deepEqual(await stats(), expectedStats);
    } catch (error) { primary = primary ? new AggregateError([primary, error], 'Fixture verification failed') : error; } finally {
      const restored = await Promise.allSettled([prisma.agent.update({ where: { id: saved.agentId }, data: { currentVersionId: saved.originalVersionId } }),
      prisma.interview.update({ where: { id: saved.interviewId }, data: { resumeConfirmed: saved.originalConfirmed } }), prisma.interview.deleteMany({ where: { id: { in: [saved.alternateId, saved.lifecycleId, saved.timeoutId, saved.freshExitId] }, userId: 'fixture-ci-owner' } })]);
      if (saved.confirmationResume) {
        try { await removeResume(); } catch (error) { restored.push({ status: 'rejected', reason: error }); }
      }
      const failures = restored.filter(item => item.status === 'rejected').map(item => item.reason);
      if (trainingFailure) failures.push(trainingFailure);
      if (!failures.length) fs.unlinkSync(file);
      if (primary || failures.length) throw new AggregateError([...(primary ? [primary] : []), ...failures], 'Policy verification or restore failed');
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
