import { InferenceDecision } from './inference.types';

export const RELEASE_GATE_RULESET_VERSION = 'release-gate/v2';
export const MIN_RELEASE_SCORE = 90;
export const MIN_RELEASE_REPEATS = 3;
export const MAX_RESOURCE_REGRESSION_RATIO = 1.2;

export type ReleaseGateOutcome = {
  allowed: boolean;
  reason: string;
};

export interface ReleaseGateEvaluation {
  id: string;
  status: string;
  score: number | null;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  completedAt: Date | null;
  datasetFrozenAt?: Date | null;
  datasetContentHash?: string | null;
  metrics?: unknown;
}

export function inferReleaseGate(
  evaluation: ReleaseGateEvaluation | null,
  comparison: {
    required: boolean;
    baseline: ReleaseGateEvaluation | null;
  } = { required: false, baseline: null },
): InferenceDecision<ReleaseGateOutcome> {
  const matchedRules: string[] = [];

  if (!evaluation || evaluation.status !== 'COMPLETED') {
    matchedRules.push('RG-001:completed-evaluation-required');
    return denied(
      '版本必须先完成一次评测，才可以发布。',
      matchedRules,
      { evaluation: evaluation ?? null },
    );
  }

  if (evaluation.totalCases === 0) {
    matchedRules.push('RG-002:non-empty-dataset-required');
    return denied('评测数据集不能为空。', matchedRules, { evaluation });
  }

  if (evaluation.failedCases > 0 || evaluation.passedCases !== evaluation.totalCases) {
    matchedRules.push('RG-003:all-cases-must-pass');
    return denied('存在未通过的评测用例，不能发布。', matchedRules, { evaluation });
  }

  if (evaluation.score === null || evaluation.score < MIN_RELEASE_SCORE) {
    matchedRules.push('RG-004:minimum-score-required');
    return denied(
      `评测分数必须达到 ${MIN_RELEASE_SCORE.toFixed(0)} 分。`,
      matchedRules,
      { evaluation, minimumScore: MIN_RELEASE_SCORE },
    );
  }

  if (!evaluation.datasetFrozenAt || !evaluation.datasetContentHash) {
    matchedRules.push('RG-008:frozen-dataset-required');
    return denied('发布评测必须使用已冻结且带内容指纹的 Dataset。', matchedRules, { evaluation });
  }

  const evidence = resourceEvidence(evaluation.metrics);
  if (evidence.repeatCount < MIN_RELEASE_REPEATS) {
    matchedRules.push('RG-009:repeated-evidence-required');
    return denied(`发布评测至少需要重复运行 ${MIN_RELEASE_REPEATS} 次。`, matchedRules, {
      evaluation,
      minimumRepeats: MIN_RELEASE_REPEATS,
    });
  }
  if (!evidence.available) {
    matchedRules.push('RG-010:resource-evidence-required');
    return denied('发布评测缺少完整的延迟、Token 或成本证据。', matchedRules, { evaluation });
  }

  if (comparison.required && !comparison.baseline) {
    matchedRules.push('RG-006:comparable-baseline-required');
    return denied(
      '当前版本必须先在同一 Dataset/Evaluator 上完成基线评测。',
      matchedRules,
      { evaluation, baselineEvaluation: null, minimumScore: MIN_RELEASE_SCORE },
    );
  }

  if (
    comparison.baseline?.score !== null
    && comparison.baseline?.score !== undefined
    && evaluation.score < comparison.baseline.score
  ) {
    matchedRules.push('RG-007:no-score-regression');
    return denied(
      '候选版本评测分数低于当前版本基线，不能发布。',
      matchedRules,
      {
        evaluation,
        baselineEvaluation: comparison.baseline,
        minimumScore: MIN_RELEASE_SCORE,
      },
    );
  }


  if (comparison.baseline) {
    if (comparison.baseline.datasetContentHash !== evaluation.datasetContentHash) {
      matchedRules.push('RG-012:dataset-fingerprint-mismatch');
      return denied('候选与基线的 Dataset 内容指纹不一致。', matchedRules, {
        evaluation,
        baselineEvaluation: comparison.baseline,
      });
    }
    const baselineEvidence = resourceEvidence(comparison.baseline.metrics);
    if (baselineEvidence.repeatCount < MIN_RELEASE_REPEATS || !baselineEvidence.available) {
      matchedRules.push('RG-013:baseline-resource-evidence-required');
      return denied('当前版本基线缺少等价的重复运行资源证据。', matchedRules, {
        evaluation,
        baselineEvaluation: comparison.baseline,
      });
    }
    if (baselineEvidence.repeatCount !== evidence.repeatCount) {
      matchedRules.push('RG-016:equal-repeat-count-required');
      return denied('候选与基线必须使用相同的重复运行次数。', matchedRules, {
        evaluation,
        baselineEvaluation: comparison.baseline,
      });
    }
    const regressions = [
      ['RG-011:latency-regression', evidence.p95Ms, baselineEvidence.p95Ms, 'P95 延迟'],
      ['RG-014:token-regression', evidence.totalTokens, baselineEvidence.totalTokens, 'Token'],
      ['RG-015:cost-regression', evidence.totalCny, baselineEvidence.totalCny, '估算成本'],
    ] as const;
    for (const [rule, candidateValue, baselineValue, label] of regressions) {
      if (candidateValue > baselineValue * MAX_RESOURCE_REGRESSION_RATIO) {
        matchedRules.push(rule);
        return denied(`${label}相对基线回归超过 20%。`, matchedRules, {
          evaluation,
          baselineEvaluation: comparison.baseline,
          maximumResourceRegressionRatio: MAX_RESOURCE_REGRESSION_RATIO,
        });
      }
    }
  }

  matchedRules.push('RG-005:release-approved');
  return {
    outcome: { allowed: true, reason: '评测完成且全部用例通过，允许发布。' },
    ruleSetVersion: RELEASE_GATE_RULESET_VERSION,
    matchedRules,
    evidence: {
      evaluation,
      baselineEvaluation: comparison.baseline,
      minimumScore: MIN_RELEASE_SCORE,
      minimumRepeats: MIN_RELEASE_REPEATS,
      maximumResourceRegressionRatio: MAX_RESOURCE_REGRESSION_RATIO,
    },
  };
}

function resourceEvidence(metrics: unknown) {
  const record = toRecord(metrics);
  const latency = toRecord(record.latency);
  const tokenUsage = toRecord(record.tokenUsage);
  const estimatedCost = toRecord(record.estimatedCost);
  const repeatCount = numberValue(record.repeatCount);
  const p95Ms = numberValue(latency.p95Ms);
  const totalTokens = numberValue(tokenUsage.totalTokens);
  const totalCny = numberValue(estimatedCost.totalCny);
  return {
    repeatCount,
    p95Ms,
    totalTokens,
    totalCny,
    available: latency.status !== 'unavailable'
      && tokenUsage.status === 'available'
      && estimatedCost.status === 'available'
      && p95Ms >= 0
      && totalTokens >= 0
      && totalCny >= 0,
  };
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : -1;
}

function denied(
  reason: string,
  matchedRules: string[],
  evidence: Record<string, unknown>,
): InferenceDecision<ReleaseGateOutcome> {
  return {
    outcome: { allowed: false, reason },
    ruleSetVersion: RELEASE_GATE_RULESET_VERSION,
    matchedRules,
    evidence,
  };
}
