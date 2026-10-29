// Synthetic assertions prove the evaluator boundary, never real model quality.
jest.mock('../modules/llm/llm.gateway.service', () => ({ LlmGatewayService: class {} }));
import { join } from 'node:path';
import { buildInterviewDecisionMessages, parseInterviewDecision, INTERVIEW_DECISION_CONTRACT_VERSION } from '../modules/interview/services/interview-decision.contract';
import { EvalRunner, goldenQualityExitCode, runGoldenCli } from '../evals/eval-runner';
import { EvalReporter, type CaseResult } from '../evals/eval-reporter';
import { loadGoldenDataset } from '../evals/golden-dataset.schema';
import { toAgentLabRecordedRun } from '../evals/agent-lab-recording';

const datasetPath = join(__dirname, '../evals/golden-dataset.json');
const score = { correctness: 0.5, depth: 0.5, completeness: 0.5, score: 0.5, keyPoints: ['first', 'second'], feedback: 'Synthetic evidence.', missingPoints: [], shouldFollowUp: false, followUpQuestion: null, followUpReason: null, shouldAdvance: false, advancedQuestion: null };
const dataset = loadGoldenDataset(datasetPath);
const golden = dataset.cases[0];
const reporter = () => {
  const value = new EvalReporter('never-written');
  jest.spyOn(value, 'writeJson').mockResolvedValue('not-written');
  jest.spyOn(value, 'writeMarkdown').mockResolvedValue('not-written');
  return value;
};
function exactResult(source = golden): CaseResult {
  return {
    caseId: source.id, question: source.question, position: source.position, level: source.level, difficulty: source.difficulty,
    responses: source.responses.map(item => ({ level: item.level, expectedScore: item.expectedScore, actualScore: item.expectedScore,
      expectedKeywords: item.expectedFeedbackKeywords, actualKeywords: item.expectedFeedbackKeywords,
      expectedFeedback: item.reason, actualFeedback: 'Synthetic exact output.',
      expectedDimensions: { correctness: item.expectedCorrectness, depth: item.expectedDepth, completeness: item.expectedCompleteness },
      actualDimensions: { correctness: item.expectedCorrectness, depth: item.expectedDepth, completeness: item.expectedCompleteness }, observedModel: 'fixture-model-2026', observedProvider: 'fixture' })),
    metrics: { scoreMAE: 0, levelAccuracy: 1, keywordHitRate: 1, sampleSize: source.responses.length },
  };
}
const scope = { scorerContractVersion: INTERVIEW_DECISION_CONTRACT_VERSION, configuredModel: 'requested-model', promptHash: 'a'.repeat(64), expectedCaseIds: [golden.id] };

describe('strict Golden Judge output boundary', () => {
  it('accepts the shared production decision contract only', () => {
    expect(parseInterviewDecision(JSON.stringify(score))).toEqual(score);
  });
  it.each([
    ['string score', { ...score, score: '0.5' }],
    ['out-of-range score', { ...score, score: 101 }],
    ['negative dimension', { ...score, depth: -0.1 }],
    ['out-of-range dimension', { ...score, correctness: 1.01 }],
    ['null numeric field', { ...score, depth: null }],
    ['followup without question', { ...score, shouldFollowUp: true }],
    ['advance without question', { ...score, shouldAdvance: true }],
    ['missing field', { ...score, feedback: undefined }],
    ['unknown field', { ...score, extra: true }],
    ['empty feedback', { ...score, feedback: ' ' }],
    ['non-array keyPoints', { ...score, keyPoints: 'first' }],
    ['empty keyPoint', { ...score, keyPoints: ['first', ' '] }],
    ['non-string keyPoint', { ...score, keyPoints: ['first', 7] }],
  ])('rejects %s', (_name, value) => {
    expect(() => parseInterviewDecision(JSON.stringify(value))).toThrow();
  });
  it.each(['[]', 'null', 'text {"score":50}', '```json\n{}\n```', JSON.stringify(score).replace('"score":0.5', '"score":1e309')])('rejects malformed or non-finite JSON %s', content => {
    expect(() => parseInterviewDecision(content)).toThrow();
  });
  it.each([null, undefined, '', 'synthetic string failure', new Error('')])('retains provider rejection %s as error evidence', async failure => {
    const llm = { chat: jest.fn().mockRejectedValue(failure) };
    const report = await new EvalRunner(llm as any, { datasetPath, outputDir: 'never-written', caseFilter: golden.id, concurrency: 1, model: 'fixture' }, reporter()).run();
    expect(report.overall).toMatchObject({ validSamples: 0, errorSamples: golden.responses.length, errorRate: 1 });
    expect(report.caseResults[0].responses.every(item => Boolean(item.error))).toBe(true);
    expect(report.qualityVerdict.status).toBe('FAIL');
  });
  it('preserves invalid output as a failed attempted sample and continues other offline samples', async () => {
    const llm = { chat: jest.fn().mockResolvedValue({ content: JSON.stringify(score), model: 'actual-model', provider: 'fixture' }) };
    llm.chat.mockResolvedValueOnce({ content: JSON.stringify({ ...score, score: 999 }), model: 'actual-model', provider: 'fixture' });
    const report = await new EvalRunner(llm as any, { datasetPath, outputDir: 'never-written', caseFilter: golden.id, concurrency: 1, model: 'requested-model' }, reporter()).run();
    expect(report.caseResults[0].responses[0].error).toBeTruthy();
    expect(report.overall).toMatchObject({ expectedSamples: golden.responses.length, attemptedSamples: golden.responses.length, validSamples: golden.responses.length - 1, errorSamples: 1 });
    expect(report.metadata).toMatchObject({ model: 'actual-model', configuredModel: 'requested-model', observedProviders: ['fixture'] });
    expect(report.qualityVerdict.status).toBe('FAIL');
    expect(report.overall.dimensionEvidenceStatus).toBe('available');
    expect(llm.chat.mock.calls[0][0].messages).toEqual(buildInterviewDecisionMessages(golden.question, golden.responses[0].answer, golden.category, golden.difficulty));
    expect(report.metadata.scorerContractVersion).toBe(INTERVIEW_DECISION_CONTRACT_VERSION);
  });
});

describe('Golden report fail-closed quality verdict', () => {
  it('passes a complete perfect synthetic cohort and preserves import compatibility', () => {
    const report = reporter().buildReport(dataset, [exactResult()], 10, scope);
    expect(report.qualityVerdict).toEqual({ status: 'PASS', reasons: [] });
    expect(goldenQualityExitCode(report)).toBe(0);
    expect(report.metadata.model).toBe('fixture-model-2026');
    report.resourceEvidence = { status: 'available', inputTokens: 12, outputTokens: 8, estimatedCostCny: 0.001 };
    const recorded = toAgentLabRecordedRun(report, { agentKey: 'fixture', agentVersion: '1.0.0', runtimeVersion: 'fixture' });
    expect(recorded.metrics.structuredOutputValidRate).toBe(1);
    expect(Number.isFinite(recorded.metrics.qualityScore)).toBe(true);
  });
  it('fails when all valid-subset quality metrics pass but another sample failed', () => {
    const result = exactResult();
    result.responses[0] = { ...result.responses[0], actualScore: 0, actualKeywords: [], error: 'synthetic timeout' };
    const other = dataset.cases[1];
    const expectedSamples = golden.responses.length + other.responses.length;
    const report = reporter().buildReport(dataset, [result, exactResult(other)], 10, { ...scope, expectedCaseIds: [golden.id, other.id] });
    expect(report.overall.scoreMAE).toBe(0);
    expect(report.overall.scorePearson).toBe(1);
    expect(report.overall.levelAccuracy).toBe(1);
    expect(report.overall.keywordHitRate).toBe(1);
    expect(report.overall.errorRate).toBeCloseTo(1 / expectedSamples);
    expect(report.overall.coverageRate).toBeCloseTo((expectedSamples - 1) / expectedSamples);
    expect(report.qualityVerdict.reasons).toContain('JUDGE_OR_PROVIDER_FAILURE');
    expect(goldenQualityExitCode(report)).toBe(1);
    expect(report.failedCases[0]).toMatchObject({ caseId: golden.id, reason: 'LLM 错误' });
  });
  it('fails with no samples without NaN or Infinity in the JSON report', () => {
    const report = reporter().buildReport(dataset, [], 0, scope);
    expect(report.qualityVerdict.reasons).toContain('NO_VALID_SAMPLES');
    expect(report.overall).toMatchObject({ attemptedSamples: 0, validSamples: 0, errorSamples: 0, coverageRate: 0, scoreMAE: 100 });
    expect(Object.values(report.overall).filter(value => typeof value === 'number').every(Number.isFinite)).toBe(true);
  });
  it('fails all errors with explicit attempted/error evidence and finite metrics', () => {
    const result = exactResult(); result.responses = result.responses.map(item => ({ ...item, error: 'synthetic failure' }));
    const report = reporter().buildReport(dataset, [result], 0, scope);
    expect(report.overall).toMatchObject({ attemptedSamples: golden.responses.length, validSamples: 0, errorSamples: golden.responses.length, errorRate: 1, coverageRate: 0 });
    expect(report.failedCases).toHaveLength(golden.responses.length);
    expect(report.qualityVerdict.status).toBe('FAIL');
  });
  it('counts repeated matching keywords once instead of inflating hit rate', () => {
    const result = exactResult(); result.responses = result.responses.map(item => ({ ...item, actualKeywords: [...item.actualKeywords, ...item.actualKeywords] }));
    expect(reporter().buildReport(dataset, [result], 0, scope).overall.keywordHitRate).toBe(1);
  });
  it('fails missing or duplicate case coverage instead of blessing repeated samples', () => {
    const result = exactResult();
    expect(reporter().buildReport(dataset, [result], 0).qualityVerdict.reasons).toContain('INCOMPLETE_SAMPLE_COVERAGE');
    expect(reporter().buildReport(dataset, [result, result], 0, scope).qualityVerdict.reasons).toContain('INCOMPLETE_SAMPLE_COVERAGE');
  });
  it('does not replace unknown observed model with configured model', () => {
    const result = exactResult(); result.responses = result.responses.map(({ observedModel: _model, observedProvider: _provider, ...item }) => item);
    const report = reporter().buildReport(dataset, [result], 0, scope);
    expect(report.metadata).toMatchObject({ model: 'unknown', configuredModel: 'requested-model' });
    expect(report.qualityVerdict).toMatchObject({ status: 'FAIL', reasons: expect.arrayContaining(['MODEL_IDENTITY_UNAVAILABLE']) });
  });
});

describe('provider-free Golden CLI', () => {
  it('validates without a provider, rejects nonexistent case/arguments, and blocks default paid execution', async () => {
    const provider = jest.spyOn(globalThis, 'fetch');
    await expect(runGoldenCli(['--validate'])).resolves.toBe(0);
    await expect(runGoldenCli(['--case', 'case-999-not-found', '--validate'])).rejects.toThrow('GOLDEN_CASE_NOT_FOUND');
    await expect(runGoldenCli(['--case'])).rejects.toThrow('GOLDEN_CASE_REQUIRED');
    await expect(runGoldenCli(['--paid'])).rejects.toThrow('GOLDEN_UNKNOWN_ARGUMENT');
    await expect(runGoldenCli([])).rejects.toThrow('GOLDEN_PAID_EXECUTION_DISABLED');
    expect(provider).not.toHaveBeenCalled(); provider.mockRestore();
  });
  it('returns nonzero for quality failure from a host-injected offline runner', async () => {
    const failed = reporter().buildReport(dataset, [], 0, scope);
    const passed = reporter().buildReport(dataset, [exactResult()], 0, scope);
    await expect(runGoldenCli([], async () => failed)).resolves.toBe(1);
    await expect(runGoldenCli([], async () => passed)).resolves.toBe(0);
  });
  it('rejects unknown runtime case before calling even a synthetic scorer', async () => {
    const llm = { chat: jest.fn() };
    await expect(new EvalRunner(llm as any, { datasetPath, outputDir: 'never-written', caseFilter: 'missing', concurrency: 1, model: 'fixture' }, reporter()).run()).rejects.toThrow('GOLDEN_CASE_NOT_FOUND');
    expect(llm.chat).not.toHaveBeenCalled();
  });
});
