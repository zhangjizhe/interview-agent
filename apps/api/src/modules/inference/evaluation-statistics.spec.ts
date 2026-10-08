import {
  buildStratifiedEvaluationEvidence,
  compareStratifiedEvidence,
} from './evaluation-statistics';

function inputs(scores: number[]) {
  return scores.map((score, index) => ({
    caseKey: `case-${String(index + 1).padStart(2, '0')}`,
    score,
    passed: score >= 90,
    metadata: {
      segments: {
        jobFamily: 'ai-agent-engineer',
        skill: index < 5 ? 'rag' : 'agent-evaluation',
        difficulty: index % 2 === 0 ? 'foundation' : 'advanced',
      },
    },
  }));
}

describe('Evaluation statistics', () => {
  it('builds bounded job, skill, and difficulty strata for a release dataset', () => {
    const evidence = buildStratifiedEvaluationEvidence(inputs(Array(10).fill(95)));

    expect(evidence).toMatchObject({
      status: 'available',
      caseCount: 10,
      requiredDimensions: ['jobFamily', 'skill', 'difficulty'],
      strata: {
        jobFamily: [{ value: 'ai-agent-engineer', caseCount: 10, averageScore: 95 }],
        skill: expect.arrayContaining([
          { value: 'agent-evaluation', caseCount: 5, averageScore: 95, passRate: 1 },
          { value: 'rag', caseCount: 5, averageScore: 95, passRate: 1 },
        ]),
      },
    });
  });

  it('rejects sparse or unlabelled release evidence before a paid evaluation', () => {
    const evidence = buildStratifiedEvaluationEvidence([{
      caseKey: 'case-1', score: 100, passed: true, metadata: {},
    }]);

    expect(evidence.status).toBe('unavailable');
    expect(evidence.reasons).toEqual(expect.arrayContaining([
      expect.stringContaining('至少需要 10 个'),
      expect.stringContaining('缺少合法'),
    ]));
  });

  it('rejects an oversized release dataset before any paid evaluation', () => {
    const evidence = buildStratifiedEvaluationEvidence(inputs(Array(51).fill(95)));

    expect(evidence).toMatchObject({
      status: 'unavailable',
      caseCount: 51,
      reasons: expect.arrayContaining([expect.stringContaining('最多允许 50 个')]),
    });
  });

  it('accepts a paired candidate whose 95% interval stays within the non-inferiority margin', () => {
    const baseline = buildStratifiedEvaluationEvidence(inputs(Array(10).fill(95)));
    const candidate = buildStratifiedEvaluationEvidence(inputs(Array(10).fill(96)));

    expect(compareStratifiedEvidence(
      { stratification: candidate },
      { stratification: baseline },
    )).toMatchObject({
      status: 'available',
      pairedCaseCount: 10,
      meanDeltaPoints: 1,
      lowerConfidenceBoundPoints: 1,
      nonInferior: true,
      stratumRegressions: [],
    });
  });

  it('rejects a candidate when one business slice regresses beyond five points', () => {
    const baseline = buildStratifiedEvaluationEvidence(inputs(Array(10).fill(95)));
    const candidate = buildStratifiedEvaluationEvidence(inputs([
      100, 100, 100, 100, 100,
      89, 89, 89, 89, 89,
    ]));
    const comparison = compareStratifiedEvidence(
      { stratification: candidate },
      { stratification: baseline },
    );

    expect(comparison).toMatchObject({
      status: 'available',
      nonInferior: false,
      stratumRegressions: expect.arrayContaining([
        expect.objectContaining({
          dimension: 'skill', value: 'agent-evaluation', meanDeltaPoints: -6,
        }),
      ]),
    });
  });

  it('returns unavailable when candidate and baseline case keys cannot be paired', () => {
    const baseline = buildStratifiedEvaluationEvidence(inputs(Array(10).fill(95)));
    const candidateInputs = inputs(Array(10).fill(96));
    candidateInputs[9].caseKey = 'different-case';
    const candidate = buildStratifiedEvaluationEvidence(candidateInputs);

    expect(compareStratifiedEvidence(
      { stratification: candidate },
      { stratification: baseline },
    )).toMatchObject({
      status: 'unavailable',
      reasons: ['候选与基线的 Case key 无法完整配对'],
    });
  });

  it('treats malformed persisted metrics as unavailable instead of throwing', () => {
    const baseline = buildStratifiedEvaluationEvidence(inputs(Array(10).fill(95)));

    expect(compareStratifiedEvidence(
      { stratification: { status: 'available', cases: [{ caseKey: 'case-1' }] } },
      { stratification: baseline },
    )).toMatchObject({
      status: 'unavailable',
      reasons: ['候选评测缺少可用的业务切片证据'],
    });
  });
});
