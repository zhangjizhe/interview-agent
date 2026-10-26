const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const product = createRequire(`${process.cwd()}/package.json`);
const { PrismaClient } = product('@prisma/client');
const { AgentRuntimeService } = product('./dist/modules/agent-lab/agent-runtime.service');
const { tenantContext } = product('./dist/modules/organizations/tenant-context');
const { tenantMiddleware } = product('./dist/modules/organizations/tenant-policy');
module.exports = async ({ request, admin, owner, check }) => {
  assert.equal(process.env.DATABASE_URL, 'postgresql://postgres@fixture-pg:5432/fixture');
  const raw = new PrismaClient(); const scoped = new PrismaClient(); scoped.$use(tenantMiddleware);
  try {
    const user = await raw.user.findUniqueOrThrow({ where: { id: 'fixture-ci-admin' } });
    const workspace = await raw.workspace.findUniqueOrThrow({ where: { slug: 'personal-fixture-ci-admin' } });
    const agent = await raw.agent.create({ data: { organizationId: user.organizationId, workspaceId: workspace.id, key: 'fixture-external-init', name: 'fixture-external-init', type: 'CUSTOM' } });
    const version = await raw.agentVersion.create({ data: { organizationId: user.organizationId, agentId: agent.id, version: '1.0.0', status: 'PUBLISHED', systemPrompt: 'Synthetic required-message initialization', runtimeConfig: { adapter: 'interview-multi-agent' } } });
    await raw.agent.update({ where: { id: agent.id }, data: { currentVersionId: version.id } });
    const failure = new Error('Synthetic required message store unavailable');
    const ledgerBefore = await raw.usageLedger.count();
    const service = new AgentRuntimeService(scoped, {}, { append: async () => { throw failure; } }, {});
    await tenantContext.run({ organizationId: user.organizationId, userId: user.id }, async () => {
      await assert.rejects(service.startExternalRun(user.id, agent.id, { input: { message: 'Synthetic initialization failure' }, application: 'fixture-external-init', externalRunId: 'fixture-required-message' }), error => error === failure);
    });
    const run = await raw.run.findFirstOrThrow({ where: { agentId: agent.id, externalRunId: 'fixture-required-message' } });
    check('required message failure persists FAILED external Run instead of RUNNING', run.status === 'FAILED' && run.completedAt instanceof Date && run.error === 'Application 初始化失败：必需消息持久化未确认');
    const readback = await request(`/agent-lab/runs/${run.id}`, { token: admin });
    check('failed external initialization reads back through authenticated API', readback.status === 200 && readback.data.status === 'FAILED' && readback.data.agentVersionId === version.id && readback.data.error === run.error);
    check('external initialization failure creates no model usage receipt', await raw.usageLedger.count() === ledgerBefore);

    // Actual HTTP/SSE admission failure: temporarily point this isolated user's
    // built-in Agent at a draft; never alter production data or invoke a model.
    const application = await request('/agent-lab/applications/bootstrap/interview', { method: 'POST', token: owner });
    assert.equal(application.status, 201);
    const builtin = await raw.agent.findUniqueOrThrow({ where: { id: application.data.agentId } });
    const draft = await raw.agentVersion.create({ data: { organizationId: builtin.organizationId, agentId: builtin.id, version: '99.0.0', status: 'DRAFT', systemPrompt: 'synthetic-private-policy' } });
    const ownerUser = await raw.user.findUniqueOrThrow({ where: { id: 'fixture-ci-owner' } });
    const interview = await raw.interview.create({ data: { organizationId: ownerUser.organizationId, userId: ownerUser.id, position: 'Synthetic admission fixture', level: 'P5' } });
    const readStats = async () => { const response = await fetch('http://127.0.0.1:3335/fixture/stats', { signal: AbortSignal.timeout(5000) }); assert.equal(response.status, 200); const value = await response.json(); for (const key of ['chat', 'embedding', 'rerank', 'externalRequests']) assert.ok(Number.isSafeInteger(value[key]) && value[key] >= 0); return value; };
    const statsBefore = await readStats();
    const runCount = await raw.run.count();
    // Real confirmation publishes the provider-free queue and authoritative
    // receipt. A subsequent error must therefore come after a valid claim,
    // rather than from the missing-question protocol guard.
    const confirmation = await request(`/interview/${interview.id}/confirm-resume`, { method: 'POST', token: owner });
    assert.equal(confirmation.status, 201); assert.equal(confirmation.data.success, true);
    assert.equal(confirmation.data.questionProtocol, 'presentation/v1');
    const question = confirmation.data.currentQuestion;
    assert.ok(question && question.state === 'OPEN' && typeof question.presentationId === 'string' && question.presentationId.trim());
    const originalReceipt = await raw.interviewQuestionPresentation.findUniqueOrThrow({ where: { id: question.presentationId }, include: { task: true, message: true } });
    assert.equal(originalReceipt.interviewId, interview.id); assert.equal(originalReceipt.task.status, 'PENDING');
    assert.equal(originalReceipt.task.question, question.question); assert.equal(originalReceipt.message.content, question.question);
    assert.equal(originalReceipt.message.role, 'assistant');
    const publishedMessages = await raw.message.count({ where: { interviewId: interview.id } });
    assert.equal(publishedMessages, 1);
    let primaryFailure;
    try {
      await raw.agent.update({ where: { id: builtin.id }, data: { currentVersionId: draft.id } });
      for (let attempt = 0; attempt < 2; attempt++) {
        const reply = await fetch(`http://127.0.0.1:3001/api/interview/${interview.id}/message`, { method: 'POST', headers: { Authorization: `Bearer ${owner}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'Synthetic admission input', clientMessageId: 'fixture-policy-admission-1', operation: 'ANSWER', presentationId: question.presentationId }), signal: AbortSignal.timeout(5000) });
        const text = await reply.text();
        assert.equal(reply.status, 200); assert.match(text, /"type":"error"/);
        assert.match(text, /当前回答暂时无法处理/); assert.ok(!text.includes('[DONE]') && !text.includes('"type":"token"') && !text.includes('synthetic-private-policy'));
        assert.equal(await raw.message.count({ where: { interviewId: interview.id, role: 'user' } }), 0);
        assert.equal(await raw.message.count({ where: { interviewId: interview.id } }), publishedMessages);
        const released = await raw.interviewQuestionPresentation.findUniqueOrThrow({ where: { id: question.presentationId } });
        assert.equal(released.state, 'OPEN'); assert.equal(released.claimMessageId, null); assert.equal(released.claimToken, null);
        assert.equal(await raw.interviewAnswer.count({ where: { interviewId: interview.id } }), 0);
        assert.equal(await raw.answerHistory.count({ where: { interviewId: interview.id } }), 0);
      }
      check('draft policy actual SSE refuses twice with generic error and releases real candidate claims', true);
      check('required policy refusal adds no Run, model call or usage ledger', await raw.run.count() === runCount && await raw.usageLedger.count() === ledgerBefore && JSON.stringify(await readStats()) === JSON.stringify(statsBefore));
    } catch (error) { primaryFailure = error; throw error; } finally {
      try { await raw.agent.update({ where: { id: builtin.id }, data: { currentVersionId: builtin.currentVersionId } }); }
      catch (restoreError) { throw new AggregateError([...(primaryFailure ? [primaryFailure] : []), restoreError], 'Synthetic policy pointer restore failed'); }
    }

  } finally { await scoped.$disconnect(); await raw.$disconnect(); }
};
