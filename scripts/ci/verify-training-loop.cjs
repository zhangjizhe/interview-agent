// Isolated synthetic database fixtures, using the built product services.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const product = createRequire(`${process.cwd()}/package.json`);
const { PrismaClient } = product('@prisma/client');
const { TrainingService } = product('./dist/modules/interview/services/training.service');
const { SkillStateAggregationService } = product('./dist/modules/interview/services/skill-state-aggregation.service');
const { tenantContext } = product('./dist/modules/organizations/tenant-context');
const { tenantMiddleware } = product('./dist/modules/organizations/tenant-policy');

module.exports = async ({ request, owner, targetJobId, check }) => {
  const raw = new PrismaClient(); const scoped = new PrismaClient(); scoped.$use(tenantMiddleware);
  try {
    const user = await raw.user.findUniqueOrThrow({ where: { id: 'fixture-ci-owner' } });
    const org = user.organizationId;
    const skill = await raw.skillDefinition.create({ data: { slug: 'fixture-training', name: 'Synthetic training skill', taxonomyVersion: 'isolated-ci-v1', applicableRoles: ['Fixture'] } });
    const definition = await raw.evaluationDefinition.create({ data: {
      version: 'isolated-ci-definition', definitionHash: 'isolated-ci-definition', evaluatorVersion: 'offline-fixture', promptVersion: 'offline-fixture', rubricVersion: 'offline-fixture', modelProvider: 'offline-fixture', modelVersion: 'offline-fixture', evaluationMode: 'FINAL', fallbackPolicyVersion: 'offline-fixture',
    } });
    async function evidence(label, score) {
      const interview = await raw.interview.create({ data: { organizationId: org, userId: user.id, targetJobId, targetJobProfileVersion: 1, mode: 'SKILL_PRACTICE', practiceSkillId: skill.id, position: 'Synthetic CI Role', status: 'COMPLETED' } });
      const message = await raw.message.create({ data: { organizationId: org, interviewId: interview.id, role: 'user', content: 'Synthetic answer with one explicit constraint' } });
      const question = await raw.interviewQuestion.create({ data: { organizationId: org, interviewId: interview.id, question: 'Explain a constraint', skillId: skill.id, category: 'Fixture', difficulty: 'medium', source: 'offline-ci-fixture' } });
      const answer = await raw.interviewAnswer.create({ data: { organizationId: org, interviewId: interview.id, questionId: question.id, messageId: message.id, content: message.content } });
      const run = await raw.evaluationRun.create({ data: { organizationId: org, interviewId: interview.id, definitionId: definition.id, inputRevision: label, idempotencyKey: `isolated-ci-${label}`, mode: 'FINAL', status: 'SUCCEEDED' } });
      await raw.assessmentEvidence.create({ data: { organizationId: org, evaluationRunId: run.id, interviewId: interview.id, questionId: question.id, answerId: answer.id, skillId: skill.id, answerExcerpt: message.content, expectedEvidence: ['explicit constraint'], missingEvidence: ['verification'], score, confidence: 1 } });
      return { run, interview };
    }
    const baseline = await evidence('baseline', 0.4);
    const aggregate = new SkillStateAggregationService();
    const scope = fn => tenantContext.run({ organizationId: org, userId: user.id }, fn);
    const apply = sample => scope(() => scoped.$transaction(tx => aggregate.aggregateFinalRun(tx, { id: sample.run.id, interviewId: sample.interview.id, interview: { userId: user.id, targetJobId } })));
    await apply(baseline);
    const before = await raw.candidateSkillState.findFirstOrThrow({ where: { userId: user.id, skillId: skill.id } });
    check('formal baseline skill evidence is persisted', before.score === 40 && before.sourceRunId === baseline.run.id);
    const refresh = await request(`/interview/target-jobs/${targetJobId}/training-recommendations/refresh`, { method: 'POST', token: owner });
    const recommendation = refresh.data.find(item => item.skillId === skill.id);
    check('real API recommendation links final evidence', refresh.status === 201 && recommendation?.sourceRunId === baseline.run.id);
    const completions = await Promise.all(Array.from({ length: 10 }, () => request(`/interview/training-recommendations/${recommendation.id}/complete`, { method: 'POST', token: owner })));
    const attempts = await raw.trainingAttempt.findMany({ where: { recommendationId: recommendation.id } });
    check('concurrent completion creates exactly one attempt', attempts.length === 1 && completions.every(item => item.status === 201 && item.data?.id === attempts[0].id));
    check('training completion does not fabricate skill improvement', (await raw.candidateSkillState.findUniqueOrThrow({ where: { id: before.id } })).score === 40);
    const retest = await evidence('retest', 0.9);
    const training = new TrainingService(scoped);
    await scope(() => training.attachRetest(user.id, recommendation.id, retest.interview.id, targetJobId, skill.id));
    await apply(retest); await apply(retest);
    const after = await raw.candidateSkillState.findUniqueOrThrow({ where: { id: before.id } });
    check('comparable final retest updates actual persisted skill state once', after.score === 65 && after.trend === 50 && after.evidenceCount === 2 && after.sourceRunId === retest.run.id);
    check('attempt retains the real retest interview link', (await raw.trainingAttempt.findUniqueOrThrow({ where: { id: attempts[0].id } })).retestInterviewId === retest.interview.id);
    const list = await request('/interview/training-recommendations', { token: owner });
    check('real API exposes retest link and completed recommendation', list.status === 200 && list.data.some(item => item.id === recommendation.id && item.status === 'RETEST_STARTED' && item.attempts[0]?.retestInterviewId === retest.interview.id));
    assert.equal(await raw.usageLedger.count({ where: { organizationId: org, type: 'LLM_CALL' } }), 0);
  } finally { await Promise.all([raw.$disconnect(), scoped.$disconnect()]); }
};
