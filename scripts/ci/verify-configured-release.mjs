// Actual HTTP/PG/evaluation jobs with the localhost synthetic provider; never model quality.
export async function verifyConfiguredRelease({ request, admin, check }) {
  const call = async (path, body) => request(path, { method: 'POST', token: admin, body });
  const single = { version: '1.0.0', systemPrompt: 'fixture-final', modelConfig: { provider: 'qwen', maxTokens: 32, temperature: 0 },
    runtimeConfig: { adapter: 'single-agent-v1', maxEstimatedCostCny: 0.05, maxDurationMs: 60000 },
    inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'], additionalProperties: false },
    outputSchema: { type: 'object', properties: { response: { type: 'string' } }, required: ['response'], additionalProperties: false } };
  const agent = await call('/agent-lab/configured-agents', { key: 'synthetic-release-single', name: 'synthetic-release-single', type: 'CUSTOM', initialVersion: single });
  check('new configured Agent has no published baseline', agent.status === 201 && agent.data.currentVersion === null);
  const dataset = await call('/agent-lab/datasets', { key: 'synthetic-release-contract', name: 'Synthetic release contract', version: '1.0.0' });
  for (let index = 0; index < 10; index++) {
    const added = await call(`/agent-lab/datasets/${dataset.data.id}/cases`, { key: `synthetic-case-${index}`, input: { message: `synthetic-release-${index}` },
      expectedOutput: { keywords: ['fixture-response:synthetic-release'] }, metadata: { segments: { jobFamily: 'synthetic-engineer', skill: index < 5 ? 'evaluation' : 'recovery', difficulty: index < 5 ? 'foundation' : 'advanced' },
        provenance: { sourceType: 'synthetic-product-scenario', owner: 'fixture', allowedUse: 'agent-release-evaluation', containsPersonalData: false } } });
    if (added.status !== 201) throw new Error(`synthetic case rejected: ${JSON.stringify(added.data)}`);
  }
  check('release fixture dataset is frozen', (await call(`/agent-lab/datasets/${dataset.data.id}/freeze`)).status === 201);
  check('release fixture provenance and slices pass review', (await call(`/agent-lab/datasets/${dataset.data.id}/review`)).status === 201);
  const evaluator = await call('/agent-lab/evaluators', { key: 'synthetic-final-keywords', name: 'Synthetic final response assertion', type: 'KEYWORD', config: { minScore: 100 } });
  async function evaluateAndPublish(target, requestKey) {
    const versionId = target.versions[0].id;
    const before = await request(`/agent-lab/agents/${target.id}/versions/${versionId}/release-gate`, { token: admin });
    check('first release without evaluation is denied', before.status === 200 && before.data.outcome.allowed === false);
    const started = await call(`/agent-lab/agents/${target.id}/evaluations`, { datasetId: dataset.data.id, evaluatorId: evaluator.data.id, agentVersionId: versionId, repeatCount: 3, maxEstimatedCostCny: 0.01, requestKey });
    if (started.status !== 202) throw new Error(`evaluation refused: ${JSON.stringify(started.data)}`);
    let result;
    for (let attempt = 0; attempt < 120; attempt++) {
      result = await request(`/agent-lab/evaluations/${started.data.id}`, { token: admin });
      if (!['PENDING', 'RUNNING'].includes(result.data.status)) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    check('actual evaluation job completes 30 final-output samples with positive cost', result.data.status === 'COMPLETED' && result.data.passedCases === 10 && result.data.metrics.outputContractVersion === 'final-output/v1' && result.data.metrics.budget.spentCny > 0);
    const gate = await request(`/agent-lab/agents/${target.id}/versions/${versionId}/release-gate`, { token: admin });
    check('first release uses v5 evidence gate without manufactured baseline', gate.status === 200 && gate.data.expectedCurrentVersionId === null && gate.data.ruleSetVersion === 'release-gate/v5' && gate.data.outcome.allowed === true);
    check('administrator first publication succeeds', (await call(`/agent-lab/agents/${target.id}/versions/${versionId}/publish`)).status === 201);
    check('published version persists as current', (await request(`/agent-lab/agents/${target.id}`, { token: admin })).data.currentVersion.id === versionId);
  }
  await evaluateAndPublish(agent.data, 'fixture_first_single_release_01');
  const workflow = await call('/agent-lab/configured-agents', { key: 'synthetic-release-workflow', name: 'synthetic-release-workflow', type: 'WORKFLOW',
    initialVersion: { ...single, systemPrompt: '', modelConfig: {}, runtimeConfig: { adapter: 'finite-workflow-v1', maxEstimatedCostCny: 0.05, maxDurationMs: 60000,
      nodes: [{ id: 'final-node', agentVersionId: agent.data.versions[0].id, inputFrom: 'input' }] } } });
  if (workflow.status !== 201) throw new Error(`workflow rejected: ${JSON.stringify(workflow.data)}`);
  await evaluateAndPublish(workflow.data, 'fixture_first_workflow_release_01');
}
