const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const product = createRequire(`${process.cwd()}/package.json`);
const { PrismaClient } = product('@prisma/client');
const { AgentRuntimeService } = product('./dist/modules/agent-lab/agent-runtime.service');
const { RuntimeAdapterRegistry } = product('./dist/modules/agent-lab/runtime-adapter.registry');
const { TraceEventService } = product('./dist/modules/agent-lab/trace-event.service');
const { tenantContext } = product('./dist/modules/organizations/tenant-context');
const { tenantMiddleware } = product('./dist/modules/organizations/tenant-policy');
module.exports = async ({ request, admin, check }) => {
  assert.equal(process.env.DATABASE_URL, 'postgresql://postgres@fixture-pg:5432/fixture');
  const raw = new PrismaClient(); const scoped = new PrismaClient(); scoped.$use(tenantMiddleware);
  try {
    const user = await raw.user.findUniqueOrThrow({ where: { id: 'fixture-ci-admin' } });
    const workspace = await raw.workspace.findUniqueOrThrow({ where: { slug: 'personal-fixture-ci-admin' } });
    const agent = await raw.agent.create({ data: { organizationId: user.organizationId, workspaceId: workspace.id, key: 'fixture-runtime-registry', name: 'fixture-runtime-registry', type: 'CUSTOM' } });
    const ids = ['fixture-adapter-one', 'fixture-adapter-two'];
    const ledgerBefore = await raw.usageLedger.count();
    const registry = new RuntimeAdapterRegistry(ids.map(id => ({ manifest: { id, mode: 'legacy', capabilities: ['message'] },
      prepare: async context => { assert.equal(context.workspaceId, workspace.id); return { ready: true }; },
      execute: async context => { assert.equal(context.prepared.ready, true); return { response: `synthetic:${id}` }; },
    })));
    const service = new AgentRuntimeService(scoped, {}, new TraceEventService(scoped), {}, undefined, registry);
    for (const [index, id] of ids.entries()) {
      const version = await raw.agentVersion.create({ data: { organizationId: user.organizationId, agentId: agent.id, version: `1.0.${index}`, status: 'PUBLISHED', runtimeConfig: { adapter: id } } });
      const run = await tenantContext.run({ organizationId: user.organizationId, userId: user.id }, () => service.runAgent(user.id, agent.id, { agentVersionId: version.id, input: { message: 'Synthetic adapter input' } }));
      const stored = await raw.run.findUniqueOrThrow({ where: { id: run.id } });
      const response = await request(`/agent-lab/runs/${run.id}`, { token: admin });
      const trace = await request(`/agent-lab/runs/${run.id}/trace`, { token: admin });
      check(`registered ${id} persists output/version and actual Trace through existing lifecycle`, stored.status === 'COMPLETED' && stored.agentVersionId === version.id && stored.output.response === `synthetic:${id}` && response.status === 200 && response.data.output.response === stored.output.response && trace.status === 200 && trace.data.some(event => event.type === 'turn.start') && trace.data.some(event => event.type === 'turn.end'));
    }
    const unknownVersion = await raw.agentVersion.create({ data: { organizationId: user.organizationId, agentId: agent.id, version: '1.0.2', status: 'PUBLISHED', runtimeConfig: { adapter: 'not-registered' } } });
    const countBefore = await raw.run.count({ where: { agentId: agent.id } });
    const denied = await request(`/agent-lab/agents/${agent.id}/run`, { method: 'POST', token: admin, body: { agentVersionId: unknownVersion.id, input: { message: 'Synthetic unknown adapter' } } });
    check('actual Nest registry rejects unknown engine before Run creation', denied.status === 400 && (await raw.run.count({ where: { agentId: agent.id } })) === countBefore);
    check('registered synthetic engines and unknown rejection add no model ledger', (await raw.usageLedger.count()) === ledgerBefore);
  } finally { await scoped.$disconnect(); await raw.$disconnect(); }
};
