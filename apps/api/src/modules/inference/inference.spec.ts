import { categoryForPosition } from './interview-ontology';
import { inferInterviewRouting } from './interview-routing-inference';
import { inferReleaseGate } from './release-gate-inference';
import { buildStratifiedEvaluationEvidence } from './evaluation-statistics';

function releaseMetrics(overrides: Record<string, unknown> = {}, scores = Array(10).fill(95)) {
  return {
    repeatCount: 3,
    latency: { p95Ms: 1000 },
    tokenUsage: { status: 'available', totalTokens: 300 },
    estimatedCost: { status: 'available', totalCny: 0.01 },
    stratification: buildStratifiedEvaluationEvidence(scores.map((score, index) => ({
      caseKey: `case-${index + 1}`,
      score,
      passed: score >= 90,
      metadata: { segments: {
        jobFamily: 'ai-agent-engineer',
        skill: index < 5 ? 'rag' : 'agent-evaluation',
        difficulty: index % 2 === 0 ? 'foundation' : 'advanced',
      } },
    }))),
    ...overrides,
  };
}

describe('Interview inference', () => {
  it('routes AI Agent roles to the agent ontology instead of algorithms', () => {
    expect(categoryForPosition('AI Agent 工程师')).toBe('agent');
  });

  it('forces one targeted follow-up for weak evidence', () => {
    const decision = inferInterviewRouting({
      completedTask: {
        id: 'task-1',
        type: 'QUESTION',
        question: '如何为生产 Agent 建立离线评测？',
        category: 'agent',
        difficulty: 'hard',
        status: 'COMPLETED',
        context: { capabilities: ['evaluation'] },
      },
      tasks: [],
      llmDecision: {
        score: 0.3,
        missingPoints: ['回归测试'],
        shouldFollowUp: false,
        followUpQuestion: null,
        followUpReason: null,
        shouldAdvance: true,
        advancedQuestion: '请设计线上回归系统。',
      },
    });

    expect(decision.outcome.createFollowUp).toBe(true);
    expect(decision.outcome.createAdvanced).toBe(false);
    expect(decision.matchedRules).toContain('IR-001:low-score-missing-evidence');
  });

  it('does not create a repeated follow-up for the same question', () => {
    const decision = inferInterviewRouting({
      completedTask: {
        id: 'task-1',
        type: 'QUESTION',
        question: '请解释 Agent 工具调用。',
        category: 'agent',
        difficulty: 'medium',
        status: 'COMPLETED',
        context: { capabilities: ['tool-calling'] },
      },
      tasks: [
        {
          id: 'follow-up-1',
          type: 'FOLLOW_UP',
          question: '已有追问',
          category: 'agent',
          difficulty: 'medium',
          status: 'PENDING',
          context: { followUpFrom: 'task-1' },
        },
      ],
      llmDecision: {
        score: 0.2,
        missingPoints: ['错误处理'],
        shouldFollowUp: true,
        followUpQuestion: '请说明错误处理。',
        followUpReason: '验证边界',
        shouldAdvance: false,
        advancedQuestion: null,
      },
    });

    expect(decision.outcome.createFollowUp).toBe(false);
    expect(decision.matchedRules).toContain('IR-003:no-duplicate-follow-up');
  });
});

describe('Release gate inference', () => {
  it('denies publication without a completed evaluation', () => {
    expect(inferReleaseGate(null).outcome.allowed).toBe(false);
  });

  it('denies publication when one evaluation case fails', () => {
    const decision = inferReleaseGate({
      id: 'evaluation-1',
      status: 'COMPLETED',
      score: 1,
      totalCases: 2,
      passedCases: 1,
      failedCases: 1,
      completedAt: new Date(),
    });
    expect(decision.outcome.allowed).toBe(false);
    expect(decision.matchedRules).toContain('RG-003:all-cases-must-pass');
  });

  it('allows publication for a complete passing evaluation', () => {
    const decision = inferReleaseGate({
      id: 'evaluation-1',
      status: 'COMPLETED',
      score: 95,
      totalCases: 10,
      passedCases: 10,
      failedCases: 0,
      completedAt: new Date(),
      datasetFrozenAt: new Date(),
      datasetContentHash: 'sha256:dataset',
      metrics: releaseMetrics(),
    });
    expect(decision.outcome.allowed).toBe(true);
    expect(decision.matchedRules).toContain('RG-005:release-approved');
  });

  it('uses the 0-100 score scale in the rejection reason', () => {
    const decision = inferReleaseGate({
      id: 'evaluation-low-score',
      status: 'COMPLETED',
      score: 89,
      totalCases: 10,
      passedCases: 10,
      failedCases: 0,
      completedAt: new Date(),
    });

    expect(decision.outcome.allowed).toBe(false);
    expect(decision.outcome.reason).toContain('90 分');
    expect(decision.outcome.reason).not.toContain('9000');
  });

  it('denies publication when the candidate regresses against the same-set baseline', () => {
    const candidate = {
      id: 'evaluation-candidate',
      status: 'COMPLETED',
      score: 94,
      totalCases: 10,
      passedCases: 10,
      failedCases: 0,
      completedAt: new Date(),
      datasetFrozenAt: new Date(),
      datasetContentHash: 'sha256:dataset',
      metrics: releaseMetrics(),
    };
    const baseline = { ...candidate, id: 'evaluation-baseline', score: 96 };

    const decision = inferReleaseGate(candidate, { required: true, baseline });

    expect(decision.outcome.allowed).toBe(false);
    expect(decision.matchedRules).toContain('RG-007:no-score-regression');
  });

  it('denies publication when the dataset is mutable or repeated evidence is insufficient', () => {
    const evaluation = {
      id: 'evaluation-1', status: 'COMPLETED', score: 100, totalCases: 1,
      passedCases: 1, failedCases: 0, completedAt: new Date(),
      datasetFrozenAt: null, datasetContentHash: null,
      metrics: { repeatCount: 1 },
    };

    const decision = inferReleaseGate(evaluation);

    expect(decision.outcome.allowed).toBe(false);
    expect(decision.matchedRules).toContain('RG-008:frozen-dataset-required');
  });

  it('denies publication when latency, tokens, or estimated cost regress beyond 20 percent', () => {
    const metrics = releaseMetrics({
      latency: { p95Ms: 1300 },
      tokenUsage: { status: 'available', totalTokens: 390 },
      estimatedCost: { status: 'available', totalCny: 0.013 },
    });
    const candidate = {
      id: 'evaluation-candidate', status: 'COMPLETED', score: 100, totalCases: 10,
      passedCases: 10, failedCases: 0, completedAt: new Date(),
      datasetFrozenAt: new Date(), datasetContentHash: 'sha256:dataset', metrics,
    };
    const baseline = {
      ...candidate,
      id: 'evaluation-baseline',
      metrics: releaseMetrics(),
    };

    const decision = inferReleaseGate(candidate, { required: true, baseline });

    expect(decision.outcome.allowed).toBe(false);
    expect(decision.matchedRules).toContain('RG-011:latency-regression');
  });

  it('allows a paired candidate only when the 95 percent interval is non-inferior', () => {
    const baseline = {
      id: 'evaluation-baseline', status: 'COMPLETED', score: 95, totalCases: 10,
      passedCases: 10, failedCases: 0, completedAt: new Date(),
      datasetFrozenAt: new Date(), datasetContentHash: 'sha256:dataset',
      metrics: releaseMetrics({}, Array(10).fill(95)),
    };
    const candidate = {
      ...baseline,
      id: 'evaluation-candidate',
      score: 96,
      metrics: releaseMetrics({}, Array(10).fill(96)),
    };

    const decision = inferReleaseGate(candidate, { required: true, baseline });

    expect(decision.outcome.allowed).toBe(true);
    expect(decision.ruleSetVersion).toBe('release-gate/v3');
    expect(decision.evidence.statisticalComparison).toMatchObject({
      status: 'available', pairedCaseCount: 10, nonInferior: true,
    });
  });

  it('denies a noisy candidate whose paired interval crosses the non-inferiority margin', () => {
    const baseline = {
      id: 'evaluation-baseline', status: 'COMPLETED', score: 95, totalCases: 10,
      passedCases: 10, failedCases: 0, completedAt: new Date(),
      datasetFrozenAt: new Date(), datasetContentHash: 'sha256:dataset',
      metrics: releaseMetrics({}, Array(10).fill(95)),
    };
    const candidate = {
      ...baseline,
      id: 'evaluation-candidate',
      metrics: releaseMetrics({}, [90, 100, 90, 100, 90, 100, 90, 100, 90, 100]),
    };

    const decision = inferReleaseGate(candidate, { required: true, baseline });

    expect(decision.outcome.allowed).toBe(false);
    expect(decision.matchedRules).toContain('RG-020:paired-non-inferiority-required');
    expect(decision.evidence.statisticalComparison).toMatchObject({
      status: 'available', nonInferior: false,
    });
  });
});
