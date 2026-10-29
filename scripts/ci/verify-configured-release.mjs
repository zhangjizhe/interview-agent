// Actual HTTP/PG/evaluation jobs with a localhost synthetic provider; never model quality.
export async function verifyConfiguredRelease({ request, admin, check }) {
  const call = async (path, body) => request(path, { method: 'POST', token: admin, body });
  const contractVersion = 'business-assertions/v1';
  const assertions = [
    { id: 'score-range', source: 'response-json', op: 'number-range', path: ['score'], minimum: 0, maximum: 1 },
    { id: 'decision', source: 'response-json', op: 'equals', path: ['decision'], expected: 'FOLLOW_UP' },
  ];
  const single = { version: '1.0.0', systemPrompt: 'fixture-business-contract', modelConfig: { provider: 'qwen', maxTokens: 128, temperature: 0 },
    runtimeConfig: { adapter: 'single-agent-v1', maxEstimatedCostCny: 0.05, maxDurationMs: 60000 },
    inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'], additionalProperties: false },
    outputSchema: { type: 'object', properties: { response: { type: 'string' } }, required: ['response'], additionalProperties: false } };
  const agent = await call('/agent-lab/configured-agents', { key: 'synthetic-release-single', name: 'synthetic-release-single', type: 'CUSTOM', initialVersion: single });
  check('new configured Agent has no published baseline', agent.status === 201 && agent.data.currentVersion === null);
  async function makeDataset(key, expectedOutput) {
    const result = await call('/agent-lab/datasets', { key, name: key, version: '1.0.0' });
    if (result.status !== 201) throw new Error(`dataset rejected: ${JSON.stringify(result.data)}`);
    for (let index = 0; index < 10; index++) {
      const added = await call(`/agent-lab/datasets/${result.data.id}/cases`, { key: `synthetic-case-${index}`, input: { message: `synthetic-release-${index}` },
        expectedOutput, metadata: { segments: { jobFamily: 'synthetic-engineer', skill: index < 5 ? 'evaluation' : 'recovery', difficulty: index < 5 ? 'foundation' : 'advanced' },
          provenance: { sourceType: 'synthetic-product-scenario', owner: 'fixture', allowedUse: 'agent-release-evaluation', containsPersonalData: false } } });
      if (added.status !== 201) throw new Error(`synthetic case rejected: ${JSON.stringify(added.data)}`);
    }
    check(`${key} is frozen`, (await call(`/agent-lab/datasets/${result.data.id}/freeze`)).status === 201);
    check(`${key} provenance and slices pass review`, (await call(`/agent-lab/datasets/${result.data.id}/review`)).status === 201);
    return result.data;
  }
  const dataset = await makeDataset('synthetic-release-contract', { contractVersion, assertions });
  const smokeDataset = await makeDataset('synthetic-release-smoke', { keywords: ['fixture-response:synthetic-release'] });
  const evaluator = await call('/agent-lab/evaluators', { key: 'synthetic-business-assertions', name: 'Synthetic business contract', type: 'BUSINESS_ASSERTIONS', config: { contractVersion } });
  if (evaluator.status !== 201) throw new Error(`business evaluator rejected: ${JSON.stringify(evaluator.data)}`);
  const smokeEvaluator = await call('/agent-lab/evaluators', { key: 'synthetic-final-keywords', name: 'Synthetic smoke only', type: 'KEYWORD', config: { minScore: 100 } });

  const malformed = await call('/agent-lab/datasets', { key: 'synthetic-invalid-assertion', name: 'Synthetic invalid assertion', version: '1.0.0' });
  if (malformed.status !== 201) throw new Error('invalid-contract dataset could not be created');
  const badCase = await call(`/agent-lab/datasets/${malformed.data.id}/cases`, { key: 'unsafe-path', input: { message: 'synthetic-never-call' },
    expectedOutput: { contractVersion, assertions: [{ id: 'unsafe-path', source: 'response-json', op: 'exists', path: ['__proto__'] }] } });
  check('unsafe assertion path is rejected when creating the Case', badCase.status === 400);
  const legacyCase = await call(`/agent-lab/datasets/${malformed.data.id}/cases`, { key: 'legacy-no-contract', input: { message: 'synthetic-never-call' }, expectedOutput: { keywords: ['legacy'] } });
  if (legacyCase.status !== 201) throw new Error('legacy Case fixture could not be created');
  const fixtureStats = async () => {
    const response = await fetch('http://127.0.0.1:3335/fixture/stats', { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('synthetic provider stats unavailable');
    return response.json();
  };
  const beforeInvalid = await fixtureStats();
  const malformedJob = await call(`/agent-lab/agents/${agent.data.id}/evaluations`, { datasetId: malformed.data.id, evaluatorId: evaluator.data.id,
    agentVersionId: agent.data.versions[0].id, repeatCount: 1, maxEstimatedCostCny: 0.01, requestKey: 'fixture_invalid_contract_preflight_01' });
  check('incompatible legacy Case is rejected before provider work', malformedJob.status === 400 && (await fixtureStats()).chat === beforeInvalid.chat);
  async function evaluate(target, data, rule, requestKey) {
    const started = await call(`/agent-lab/agents/${target.id}/evaluations`, { datasetId: data.id, evaluatorId: rule.id, agentVersionId: target.versions[0].id, repeatCount: 3, maxEstimatedCostCny: 0.01, requestKey });
    if (started.status !== 202) throw new Error(`evaluation refused: ${JSON.stringify(started.data)}`);
    let result;
    for (let attempt = 0; attempt < 120; attempt++) {
      result = await request(`/agent-lab/evaluations/${started.data.id}`, { token: admin });
      if (!['PENDING', 'RUNNING'].includes(result.data.status)) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (result.data.status !== 'COMPLETED') throw new Error(`evaluation not completed: ${JSON.stringify(result.data)}`);
    return result.data;
  }
  const versionId = agent.data.versions[0].id;
  const before = await request(`/agent-lab/agents/${agent.data.id}/versions/${versionId}/release-gate`, { token: admin });
  check('first release without evaluation is denied', before.status === 200 && before.data.outcome.allowed === false);
  const smoke = await evaluate(agent.data, smokeDataset, smokeEvaluator.data, 'fixture_keyword_smoke_only_01');
  check('keyword smoke still runs and passes but does not prove business quality', smoke.passedCases === 10 && smoke.score === 100);
  check('keyword-only evidence cannot authorize a new publication', (await request(`/agent-lab/agents/${agent.data.id}/versions/${versionId}/release-gate`, { token: admin })).data.outcome.allowed === false);
  check('publication fails closed even with keyword score 100', (await call(`/agent-lab/agents/${agent.data.id}/versions/${versionId}/publish`)).status === 409);
  async function evaluateAndPublish(target, requestKey) {
    const targetVersionId = target.versions[0].id;
    const result = await evaluate(target, dataset, evaluator.data, requestKey);
    check('actual business evaluation completes 30 samples with positive estimated cost', result.passedCases === 10 && result.metrics.outputContractVersion === 'final-output/v1' && result.metrics.budget.spentCny > 0);
    check('business evidence explicitly leaves semantics unassessed', result.metrics.qualityEvidence?.semanticQuality === 'not-assessed');
    const gate = await request(`/agent-lab/agents/${target.id}/versions/${targetVersionId}/release-gate`, { token: admin });
    check('first contract release uses v6 gate without manufactured baseline', gate.status === 200 && gate.data.expectedCurrentVersionId === null && gate.data.ruleSetVersion === 'release-gate/v6' && gate.data.outcome.allowed === true);
    check('administrator contract publication succeeds', (await call(`/agent-lab/agents/${target.id}/versions/${targetVersionId}/publish`)).status === 201);
    check('published version persists as current', (await request(`/agent-lab/agents/${target.id}`, { token: admin })).data.currentVersion.id === targetVersionId);
  }
  await evaluateAndPublish(agent.data, 'fixture_first_single_release_01');
  const workflow = await call('/agent-lab/configured-agents', { key: 'synthetic-release-workflow', name: 'synthetic-release-workflow', type: 'WORKFLOW',
    initialVersion: { ...single, systemPrompt: '', modelConfig: {}, runtimeConfig: { adapter: 'finite-workflow-v1', maxEstimatedCostCny: 0.05, maxDurationMs: 60000,
      nodes: [{ id: 'final-node', agentVersionId: agent.data.versions[0].id, inputFrom: 'input' }] } } });
  if (workflow.status !== 201) throw new Error(`workflow rejected: ${JSON.stringify(workflow.data)}`);
  await evaluateAndPublish(workflow.data, 'fixture_first_workflow_release_01');
  const invalid = await call('/agent-lab/configured-agents', { key: 'synthetic-release-invalid-score', name: 'Synthetic invalid score', type: 'CUSTOM', initialVersion: { ...single, systemPrompt: 'fixture-business-invalid' } });
  if (invalid.status !== 201) throw new Error(`invalid-score fixture rejected: ${JSON.stringify(invalid.data)}`);
  const failed = await evaluate(invalid.data, dataset, evaluator.data, 'fixture_invalid_score_release_01');
  check('keyword-bearing JSON with invalid score fails all business cases', failed.failedCases === 10 && failed.passedCases === 0 && failed.results.every(item => item.passed === false));
  check('failed assertion receipts preserve the failing rule', failed.results.every(item => item.evidence?.samples?.some(sample => sample.assertions?.some(rule => rule.id === 'score-range' && rule.passed === false))));
  check('invalid score cannot publish', (await call(`/agent-lab/agents/${invalid.data.id}/versions/${invalid.data.versions[0].id}/publish`)).status === 409);
}
