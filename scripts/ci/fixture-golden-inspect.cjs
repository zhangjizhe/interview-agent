const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
assert.equal(process.env.GOLDEN_FIXTURE_SYNTHETIC, '1');
assert.equal(process.env.DATABASE_URL, 'postgresql://postgres@fixture-pg:5432/fixture');
const mode = process.argv[2];
(async () => {
  if (['profile-baseline', 'profile-retest', 'profile-off'].includes(mode)) {
    const stage = mode === 'profile-off' ? null : mode.slice('profile-'.length);
    const response = await fetch('http://127.0.0.1:3335/fixture/golden-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage }), signal: AbortSignal.timeout(3000) });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { stage });
    console.log(JSON.stringify({ stage })); return;
  }
  assert.equal(mode, 'inspect');
  const userId = process.argv[3]; assert.match(userId || '', /^synthetic-golden-browser-[a-f0-9]{6}$/);
  const product = createRequire(`${process.cwd()}/package.json`);
  const { PrismaClient } = product('@prisma/client'); const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, organizationId: true } });
    const jobs = await prisma.targetJob.findMany({ where: { userId }, include: { skillRequirements: { include: { skill: true } } } });
    for (const job of jobs) for (const requirement of job.skillRequirements) {
      assert.equal(requirement.targetJobId, job.id); assert.equal(requirement.organizationId, user.organizationId);
    }
    const interviews = await prisma.interview.findMany({ where: { userId }, orderBy: { startedAt: 'asc' } });
    const where = { interviewId: { in: interviews.map(row => row.id) } };
    const [messages, questions, answers, history, runs, reports, evidence, states, recommendations, attempts, usage] = await Promise.all([
      prisma.message.findMany({ where }), prisma.interviewQuestion.findMany({ where }), prisma.interviewAnswer.findMany({ where }),
      prisma.answerHistory.findMany({ where }), prisma.evaluationRun.findMany({ where }), prisma.report.findMany({ where }),
      prisma.assessmentEvidence.findMany({ where }), prisma.candidateSkillState.findMany({ where: { userId } }),
      prisma.trainingRecommendation.findMany({ where: { userId } }), prisma.trainingAttempt.findMany({ where: { userId } }),
      prisma.usageLedger.findMany({ where: { userId }, select: { id: true, organizationId: true, interviewId: true, type: true, units: true } }),
    ]);
    for (const rows of [jobs, interviews, messages, questions, answers, history, runs, reports, evidence, states, recommendations, attempts, usage]) {
      for (const row of rows) assert.equal(row.organizationId, user.organizationId);
    }
    const response = await fetch('http://127.0.0.1:3335/fixture/stats', { signal: AbortSignal.timeout(3000) }); assert.equal(response.status, 200);
    const stats = await response.json(); assert.equal(stats.externalRequests, 0);
    console.log(JSON.stringify({ user, jobs, interviews, messages, questions, answers, history, runs, reports, evidence, states, recommendations, attempts, usage, stats }));
  } finally { await prisma.$disconnect(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
