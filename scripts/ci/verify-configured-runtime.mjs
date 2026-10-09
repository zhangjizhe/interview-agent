// Real HTTP/PostgreSQL/Gateway, deterministic localhost-only provider. Not model quality.
export async function verifyConfigured({ request, admin, owner, check }) {
  const single = { version: '1.0.0', systemPrompt: 'fixture-route', modelConfig: { provider: 'qwen', maxTokens: 32, temperature: 0 },
    runtimeConfig: { adapter: 'single-agent-v1', maxEstimatedCostCny: 0.1, maxDurationMs: 60000 },
    inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'], additionalProperties: false },
    outputSchema: { type: 'object', properties: { response: { type: 'string' } }, required: ['response'], additionalProperties: false } };
  const create = async (key, initialVersion) => request('/agent-lab/configured-agents', { method: 'POST', token: admin, body: { key, name: key, type: 'CUSTOM', initialVersion } });
  check('USER configured Agent creation denied', (await request('/agent-lab/configured-agents', { method: 'POST', token: owner, body: { key: 'synthetic-denied', name: 'Denied', type: 'CUSTOM', initialVersion: single } })).status === 403);
  check('invalid configured creation is rejected atomically', (await create('synthetic-invalid', { ...single, systemPrompt: '' })).status === 400);
  check('invalid creation leaves no Agent', !(await request('/agent-lab/agents', { token: admin })).data.some(a => a.key === 'synthetic-invalid'));
  const first = await create('synthetic-first', single);
  const second = await create('synthetic-second', { ...single, systemPrompt: 'fixture-final' });
  check('custom Agent and initial DRAFT are persisted atomically', first.status === 201 && second.status === 201 && first.data.versions[0].status === 'DRAFT' && first.data.currentVersion === null);
  const versions = await request(`/agent-lab/agents/${first.data.id}/versions`, { token: admin });
  check('version configuration reads back', versions.data[0].systemPrompt === single.systemPrompt && versions.data[0].modelConfig.maxTokens === 32);
  const runBody = { input: { message: 'initial' }, agentVersionId: first.data.versions[0].id, requestKey: 'fixture_configured_single_01' };
  check('production run rejects DRAFT', (await request(`/agent-lab/agents/${first.data.id}/runs`, { method: 'POST', token: admin, body: runBody })).status === 409);
  const starts = await Promise.all(Array.from({ length: 3 }, () => request(`/agent-lab/agents/${first.data.id}/test-runs`, { method: 'POST', token: admin, body: runBody })));
  check('concurrent duplicate requests share one durable run', starts.every(r => r.status === 202 && r.data.id === starts[0].data.id));
  async function waitRun(id) {
    for (let i = 0; i < 40; i++) { const result = await request(`/agent-lab/runs/${id}`, { token: admin });
      if (!['PENDING', 'RUNNING'].includes(result.data.status)) return result.data;
      await new Promise(resolve => setTimeout(resolve, 500)); }
    throw new Error('fixture run timeout');
  }
  const completed = await waitRun(starts[0].data.id);
  check('draft executes actual Gateway and persists synthetic output/usage', completed.status === 'COMPLETED' && completed.output.response === 'route-yes' && completed.tokenUsage.calls === 1 && completed.estimatedCost > 0);
  check('different payload cannot reuse billing request key', (await request(`/agent-lab/agents/${first.data.id}/test-runs`, { method: 'POST', token: admin, body: { ...runBody, input: { message: 'different' } } })).status === 409);
  check('draft test does not activate current version', (await request(`/agent-lab/agents/${first.data.id}`, { token: admin })).data.currentVersion === null);
  const workflowVersion = { version: '1.0.0', modelConfig: {}, runtimeConfig: { adapter: 'finite-workflow-v1', maxEstimatedCostCny: 0.1, maxDurationMs: 60000, nodes: [
    { id: 'route-node', agentVersionId: first.data.versions[0].id, inputFrom: 'input', branch: { contains: 'route-yes', then: 'yes-node', else: 'no-node' } },
    { id: 'yes-node', agentVersionId: second.data.versions[0].id, inputFrom: 'previous' },
    { id: 'no-node', agentVersionId: second.data.versions[0].id, inputFrom: 'input' },
  ] }, inputSchema: single.inputSchema, outputSchema: single.outputSchema };
  const workflow = await create('synthetic-workflow', workflowVersion);
  check('workflow stores pinned dependency fingerprints', workflow.status === 201 && workflow.data.versions[0].runtimeConfig.nodes.every(n => /^[0-9a-f]{64}$/.test(n.versionHash)));
  const launched = await request(`/agent-lab/agents/${workflow.data.id}/test-runs`, { method: 'POST', token: admin, body: { input: { message: 'initial' }, agentVersionId: workflow.data.versions[0].id, requestKey: 'fixture_configured_workflow_01' } });
  const finished = await waitRun(launched.data.id);
  check('actual workflow branch and previous-output mapping execute', finished.status === 'COMPLETED' && finished.output.response === 'fixture-response:route-yes' && finished.tokenUsage.calls === 2 && finished.output.nodes.map(n => n.id).join(',') === 'route-node,yes-node');
  const children = await request(`/agent-lab/runs/${finished.id}/sub-runs`, { token: admin });
  check('workflow persists completed child runs', children.status === 200 && children.data.length === 2 && children.data.every(r => r.status === 'COMPLETED' && r.estimatedCost > 0));
  const trace = await request(`/agent-lab/runs/${finished.id}/trace`, { token: admin });
  check('workflow Trace has actual node start/end pairs', trace.data.filter(e => e.type === 'workflow.node.start').length === 2 && trace.data.filter(e => e.type === 'workflow.node.end').length === 2);
  check('workflow publication does not accept draft dependencies', (await request(`/agent-lab/agents/${workflow.data.id}/versions/${workflow.data.versions[0].id}/publish`, { method: 'POST', token: admin })).status === 400);
  const stats = await fetch('http://127.0.0.1:3335/fixture/stats').then(r => r.json());
  check('deterministic fixture proves bounded calls and no external requests', stats.chat === 3 && stats.externalRequests === 0);
}
