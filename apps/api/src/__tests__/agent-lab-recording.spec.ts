import { toAgentLabRecordedRun } from '../evals/agent-lab-recording';
import { INTERVIEW_DECISION_CONTRACT_VERSION } from '../modules/interview/services/interview-decision.contract';

const metadata = { agentKey: 'evaluator', agentVersion: 'v1', runtimeVersion: 'runner-v1' };
function fixture(): any {
  return {
    metadata: { timestamp: '2026-08-26T00:00:00.000Z', datasetVersion: 'golden-v1', durationMs: 400, model: 'fixture-model', scorerContractVersion: INTERVIEW_DECISION_CONTRACT_VERSION, promptHash: 'a'.repeat(64), observedModels: ['fixture-model'], observedProviders: ['fixture'] },
    qualityVerdict: { status: 'PASS', reasons: [] },
    resourceEvidence: { status: 'available', inputTokens: 25, outputTokens: 12, estimatedCostCny: 0.002 },
    overall: { scorePearson: 0.8, scoreMAE: 10, levelAccuracy: 0.9, keywordHitRate: 0.8, sampleSize: 1, expectedSamples: 1, attemptedSamples: 1, validSamples: 1, errorSamples: 0, errorRate: 0, coverageRate: 1, passThreshold: { pearson: 0.7, mae: 20, levelAcc: 0.65, keywordHit: 0.5 } },
    byDifficulty: {}, byPosition: {}, failedCases: [],
    caseResults: [{ caseId: 'case-001-safe', question: 'raw question must never leave this adapter', position: 'Engineer', level: 'P5', difficulty: 'easy',
      metrics: { scoreMAE: 2, levelAccuracy: 1, keywordHitRate: 1, sampleSize: 1 },
      responses: [{ level: 'excellent', expectedScore: 88, actualScore: 90, expectedKeywords: [], actualKeywords: [], expectedFeedback: 'expected', actualFeedback: 'raw answer must not leave this adapter' }],
    }],
  };
}

describe('Agent Lab recorded report adapter', () => {
  it('preserves available resources and hashes without raw answers', () => {
    const recording = toAgentLabRecordedRun(fixture(), metadata);
    expect(recording.datasetVersion).toBe('golden-v1');
    expect(recording.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(recording.metrics).toMatchObject({ inputTokens: 25, outputTokens: 12, estimatedCostCny: 0.002, structuredOutputValidRate: 1 });
    expect(recording.failures).toEqual([]);
    expect(JSON.stringify(recording)).not.toContain('raw answer');
    expect(JSON.stringify(recording)).not.toContain('raw question');
  });
  it.each(['FAIL', undefined])('rejects failed or historical unverified quality %s', status => {
    const report = fixture(); report.qualityVerdict = status ? { status, reasons: ['synthetic error'] } : undefined;
    expect(() => toAgentLabRecordedRun(report, metadata)).toThrow('GOLDEN_RECORDING_QUALITY_NOT_ACCEPTED');
  });
  it('rejects a former high-scoring valid subset instead of importing SUCCEEDED', () => {
    const report = fixture(); report.caseResults[0].responses[0].error = 'synthetic provider failure';
    expect(() => toAgentLabRecordedRun(report, metadata)).toThrow('GOLDEN_RECORDING_INCOMPLETE_OR_INVALID_EVIDENCE');
  });
  it('rejects unknown resource evidence instead of inventing zero cost/tokens', () => {
    const report = fixture(); delete report.resourceEvidence;
    expect(() => toAgentLabRecordedRun(report, metadata)).toThrow('GOLDEN_RECORDING_RESOURCE_EVIDENCE_UNAVAILABLE');
  });
  it.each([NaN, Infinity, -1])('rejects invalid resource cost %s', cost => {
    const report = fixture(); report.resourceEvidence.estimatedCostCny = cost;
    expect(() => toAgentLabRecordedRun(report, metadata)).toThrow('GOLDEN_RECORDING_RESOURCE_EVIDENCE_UNAVAILABLE');
  });
  it.each(['promptHash', 'observedModels', 'observedProviders'])('rejects unverified execution identity %s', field => {
    const report = fixture(); delete report.metadata[field];
    expect(() => toAgentLabRecordedRun(report, metadata)).toThrow('GOLDEN_RECORDING_QUALITY_NOT_ACCEPTED');
  });
  it('rejects a report from another scoring contract', () => {
    const report = fixture(); delete report.metadata.scorerContractVersion;
    expect(() => toAgentLabRecordedRun(report, metadata)).toThrow('GOLDEN_RECORDING_QUALITY_NOT_ACCEPTED');
  });
});
