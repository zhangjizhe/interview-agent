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
(async () => {
  if (process.argv[2] === 'prepare') {
    assert.ok(!fs.existsSync(file));
    const user = await prisma.user.findUniqueOrThrow({ where: { id: 'fixture-ci-owner' } });
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { slug: 'personal-fixture-ci-owner' } });
    const agent = await prisma.agent.findUniqueOrThrow({ where: { workspaceId_key: { workspaceId: workspace.id, key: 'interview-interviewer' } } });
    assert.equal(agent.organizationId, user.organizationId);
    const draft = await prisma.agentVersion.findUniqueOrThrow({ where: { agentId_version: { agentId: agent.id, version: '99.0.0' } } });
    assert.equal(draft.status, 'DRAFT');
    const interview = await prisma.interview.findFirstOrThrow({ where: { userId: user.id, position: 'Synthetic admission fixture' } });
    const alternate = await prisma.interview.create({ data: { organizationId: user.organizationId, userId: user.id, position: 'Synthetic error scope', resumeConfirmed: true } });
    const lifecycle = await prisma.interview.create({ data: { organizationId: user.organizationId, userId: user.id, position: 'Synthetic end lifecycle', resumeConfirmed: true } });
    const saved = { lifecycleId: lifecycle.id, alternateId: alternate.id, agentId: agent.id, originalVersionId: agent.currentVersionId, interviewId: interview.id, originalConfirmed: interview.resumeConfirmed, runs: await prisma.run.count(), ledger: await prisma.usageLedger.count(), stats: await stats() };
    fs.writeFileSync(file, JSON.stringify(saved), { mode: 0o600 });
    await prisma.interview.update({ where: { id: interview.id }, data: { resumeConfirmed: true } });
    await prisma.agent.update({ where: { id: agent.id }, data: { currentVersionId: draft.id } });
    console.log(JSON.stringify({ interviewId: interview.id, alternateId: alternate.id, lifecycleId: lifecycle.id }));
  } else if (process.argv[2] === 'verify-lifecycle-deleted') {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(await prisma.interview.findUnique({ where: { id: saved.lifecycleId } }), null);
  } else if (['verify-end-present', 'verify-end-deleted'].includes(process.argv[2])) {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    const interview = await prisma.interview.findUnique({ where: { id: saved.alternateId } });
    if (process.argv[2] === 'verify-end-deleted') assert.equal(interview, null);
    else { assert.ok(interview); assert.equal(interview.status, 'IN_PROGRESS'); assert.equal(await prisma.message.count({ where: { interviewId: saved.alternateId } }), 0); }
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
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    let primary;
    try {
      assert.equal(await prisma.message.count({ where: { interviewId: saved.interviewId } }), 0);
      assert.equal(await prisma.run.count(), saved.runs); assert.equal(await prisma.usageLedger.count(), saved.ledger);
      assert.deepEqual(await stats(), saved.stats);
    } catch (error) { primary = error; } finally {
      const restored = await Promise.allSettled([prisma.agent.update({ where: { id: saved.agentId }, data: { currentVersionId: saved.originalVersionId } }),
      prisma.interview.update({ where: { id: saved.interviewId }, data: { resumeConfirmed: saved.originalConfirmed } }), prisma.interview.deleteMany({ where: { id: { in: [saved.alternateId, saved.lifecycleId] }, userId: 'fixture-ci-owner' } })]);
      if (saved.confirmationResume) {
        try { await removeResume(); } catch (error) { restored.push({ status: 'rejected', reason: error }); }
      }
      const failures = restored.filter(item => item.status === 'rejected').map(item => item.reason);
      if (!failures.length) fs.unlinkSync(file);
      if (primary || failures.length) throw new AggregateError([...(primary ? [primary] : []), ...failures], 'Policy verification or restore failed');
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
