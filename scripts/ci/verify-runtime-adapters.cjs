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
    const adapters = ids.map(id => ({ manifest: { id, mode: 'legacy', capabilities: ['message'] },
      prepare: async context => { assert.equal(context.workspaceId, workspace.id); return { ready: true }; },
      execute: async context => { assert.equal(context.prepared.ready, true); return { response: `synthetic:${id}` }; },
    }));
    const registry = new RuntimeAdapterRegistry([...adapters, { manifest: { id: 'fixture-adapter-invalid', mode: 'legacy', capabilities: ['message'] },
      prepare: async () => undefined, execute: async () => ({ output: [], estimatedCostCny: 0.012, tokenUsage: { promptTokens: 4, completionTokens: 2, totalTokens: 6, calls: 1, models: ['synthetic-reported-usage'] } }),
    }]);
    const service = new AgentRuntimeService(scoped, {}, new TraceEventService(scoped), {}, undefined, registry);
    for (const [index, id] of ids.entries()) {
      const version = await raw.agentVersion.create({ data: { organizationId: user.organizationId, agentId: agent.id, version: `1.0.${index}`, status: 'PUBLISHED', runtimeConfig: { adapter: id } } });
      const run = await tenantContext.run({ organizationId: user.organizationId, userId: user.id }, () => service.runAgent(user.id, agent.id, { agentVersionId: version.id, input: { message: 'Synthetic adapter input' } }));
      const stored = await raw.run.findUniqueOrThrow({ where: { id: run.id } });
      const response = await request(`/agent-lab/runs/${run.id}`, { token: admin });
      const trace = await request(`/agent-lab/runs/${run.id}/trace`, { token: admin });
      check(`registered ${id} persists output/version and actual Trace through existing lifecycle`, stored.status === 'COMPLETED' && stored.agentVersionId === version.id && stored.output.response === `synthetic:${id}` && response.status === 200 && response.data.output.response === stored.output.response && trace.status === 200 && trace.data.some(event => event.type === 'turn.start') && trace.data.some(event => event.type === 'turn.end'));
    }
    const invalidVersion = await raw.agentVersion.create({ data: { organizationId: user.organizationId, agentId: agent.id, version: '1.0.2', status: 'PUBLISHED', runtimeConfig: { adapter: 'fixture-adapter-invalid' } } });
    await tenantContext.run({ organizationId: user.organizationId, userId: user.id }, () => assert.rejects(service.runAgent(user.id, agent.id, { agentVersionId: invalidVersion.id, input: { message: 'Synthetic malformed output' } }), /运行适配器最终输出无效/));
    const invalid = await raw.run.findFirstOrThrow({ where: { agentVersionId: invalidVersion.id } });
    const invalidRead = await request(`/agent-lab/runs/${invalid.id}`, { token: admin });
    const failedTrace = await request(`/agent-lab/runs/${invalid.id}/trace`, { token: admin });
    check('malformed adapter output persists FAILED and failure Trace instead of completion', invalid.status === 'FAILED' && invalid.output === null && invalidRead.status === 200 && invalidRead.data.status === 'FAILED' && failedTrace.data.some(event => event.type === 'run.failed') && !failedTrace.data.some(event => event.type === 'turn.end'));
    check('invalid output retains synthetic reported usage and estimate without claiming a bill receipt', invalid.estimatedCost === 0.012 && invalid.tokenUsage.calls === 1 && invalidRead.data.estimatedCost === 0.012 && failedTrace.data.some(event => event.type === 'run.failed' && event.estimatedCost === 0.012 && event.tokenUsage?.calls === 1));
    const unknownVersion = await raw.agentVersion.create({ data: { organizationId: user.organizationId, agentId: agent.id, version: '1.0.3', status: 'PUBLISHED', runtimeConfig: { adapter: 'not-registered' } } });
    const countBefore = await raw.run.count({ where: { agentId: agent.id } });
    const denied = await request(`/agent-lab/agents/${agent.id}/run`, { method: 'POST', token: admin, body: { agentVersionId: unknownVersion.id, input: { message: 'Synthetic unknown adapter' } } });
    check('actual Nest registry rejects unknown engine before Run creation', denied.status === 400 && (await raw.run.count({ where: { agentId: agent.id } })) === countBefore);
    check('registered synthetic engines and unknown rejection add no model ledger', (await raw.usageLedger.count()) === ledgerBefore);
  } finally { await scoped.$disconnect(); await raw.$disconnect(); }
};
