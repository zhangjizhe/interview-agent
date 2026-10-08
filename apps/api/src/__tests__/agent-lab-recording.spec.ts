import { toAgentLabRecordedRun } from '../evals/agent-lab-recording';

describe('Agent Lab recorded report adapter', () => {
  it('maps a real report shape to hashes, bounded metrics, and taxonomy failures without raw answers', () => {
    const recording = toAgentLabRecordedRun({
      metadata: { timestamp: '2026-08-26T00:00:00.000Z', datasetVersion: 'golden-v1', durationMs: 400, model: 'qwen' },
      overall: { scorePearson: 0.8, scoreMAE: 10, levelAccuracy: 0.9, keywordHitRate: 0.8, sampleSize: 1, passThreshold: { pearson: 0.7, mae: 20, levelAcc: 0.65, keywordHit: 0.5 } },
      byDifficulty: {},
      byPosition: {},
      failedCases: [],
      caseResults: [{
        caseId: 'case-001-safe',
        question: 'raw question must never leave this adapter',
        position: 'Engineer',
        level: 'P5',
        difficulty: 'easy',
        metrics: { scoreMAE: 50, levelAccuracy: 0, keywordHitRate: 0, sampleSize: 1 },
        responses: [{ level: 'poor', expectedScore: 10, actualScore: 80, expectedKeywords: [], actualKeywords: [], expectedFeedback: 'expected', actualFeedback: 'raw answer must not leave this adapter' }],
      }],
    } as any, { agentKey: 'evaluator', agentVersion: 'v1', runtimeVersion: 'runner-v1' });

    expect(recording.datasetVersion).toBe('golden-v1');
    expect(recording.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(recording.failures).toEqual([{ caseId: 'case-001-safe', category: 'OVER_SCORING', severity: 'HIGH' }]);
    expect(JSON.stringify(recording)).not.toContain('raw answer');
    expect(JSON.stringify(recording)).not.toContain('raw question');
  });
});
