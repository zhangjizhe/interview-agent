const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const product = createRequire(`${process.cwd()}/package.json`);
const { PrismaClient } = product('@prisma/client');
const { AgentRuntimeService } = product('./dist/modules/agent-lab/agent-runtime.service');
const { tenantContext } = product('./dist/modules/organizations/tenant-context');
const { tenantMiddleware } = product('./dist/modules/organizations/tenant-policy');
module.exports = async ({ request, admin, check }) => {
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
  } finally { await scoped.$disconnect(); await raw.$disconnect(); }
};
