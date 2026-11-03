import { InferenceDecision } from './inference.types';
import {
  compareStratifiedEvidence,
  MAX_STRATUM_REGRESSION_POINTS,
  MIN_RELEASE_CASES,
  NON_INFERIORITY_MARGIN_POINTS,
} from './evaluation-statistics';

export const RELEASE_GATE_RULESET_VERSION = 'release-gate/v6';
export const MIN_RELEASE_SCORE = 90;
export const MIN_RELEASE_REPEATS = 3;
export const MAX_RESOURCE_REGRESSION_RATIO = 1.2;

export type ReleaseGateOutcome = {
  allowed: boolean;
  reason: string;
  acceptanceScope?: 'deterministic-output-contract';
  notAssessed?: string[];
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

  const outputContract = (metrics: unknown) => (metrics as any)?.outputContractVersion === 'final-output/v1';
  if (!outputContract(evaluation.metrics) || (comparison.baseline && !outputContract(comparison.baseline.metrics))) {
    matchedRules.push('RG-023:final-output-contract-required');
    return denied('发布需要最终输出规则版本一致的评测证据；旧规则记录不可复用，请执行新的有界评测。', matchedRules, { evaluation, baselineEvaluation: comparison.baseline });
  }

  const candidateQuality = businessEvidence(evaluation.metrics, evaluation.totalCases);
  const baselineQuality = comparison.baseline ? businessEvidence(comparison.baseline.metrics, comparison.baseline.totalCases) : null;
  if (!candidateQuality || (comparison.baseline && !baselineQuality)) {
    matchedRules.push('RG-024:business-contract-evidence-required');
    return denied('发布需要实际执行的确定性业务合同证据；关键词、结构或延迟冒烟不能单独作为新发布依据。面试语义质量仍未评估。', matchedRules, { evaluation, baselineEvaluation: comparison.baseline });
  }
  if (baselineQuality && candidateQuality.contractHash !== baselineQuality.contractHash) {
    matchedRules.push('RG-025:business-contract-fingerprint-mismatch');
    return denied('候选与基线的业务断言合同指纹不一致，不能进行等价发布比较。', matchedRules, { evaluation, baselineEvaluation: comparison.baseline });
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
  if (!stratificationAvailable(evaluation.metrics, evaluation.totalCases)) {
    matchedRules.push('RG-017:stratified-evidence-required');
    return denied('发布评测缺少可用的岗位族、技能和难度分层证据。', matchedRules, {
      evaluation,
      minimumPairedCases: MIN_RELEASE_CASES,
    });
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
    if (!answerCacheIsolated(evaluation.metrics) || !answerCacheIsolated(comparison.baseline.metrics)) {
      matchedRules.push('RG-021:answer-cache-isolation-required');
      return denied('候选与基线必须具有绕过答案语义缓存的评测证据。', matchedRules, {
        evaluation, baselineEvaluation: comparison.baseline,
      });
    }
    if (!stratificationAvailable(comparison.baseline.metrics, comparison.baseline.totalCases)) {
      matchedRules.push('RG-018:baseline-stratified-evidence-required');
      return denied('当前版本基线缺少等价的业务分层证据。', matchedRules, {
        evaluation,
        baselineEvaluation: comparison.baseline,
      });
    }
    const statisticalComparison = compareStratifiedEvidence(
      evaluation.metrics,
      comparison.baseline.metrics,
    );
    if (statisticalComparison.status === 'unavailable') {
      matchedRules.push('RG-019:paired-statistical-evidence-required');
      return denied(statisticalComparison.reasons[0] || '候选与基线缺少可配对的统计证据。', matchedRules, {
        evaluation,
        baselineEvaluation: comparison.baseline,
        statisticalComparison,
      });
    }
    if (!statisticalComparison.nonInferior) {
      matchedRules.push('RG-020:paired-non-inferiority-required');
      return denied(statisticalComparison.reasons.join('；') || '候选版本未通过成对非劣效检验。', matchedRules, {
        evaluation,
        baselineEvaluation: comparison.baseline,
        statisticalComparison,
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

  if (!answerCacheIsolated(evaluation.metrics)) {
    matchedRules.push('RG-021:answer-cache-isolation-required');
    return denied('发布评测必须具有绕过答案语义缓存的证据。', matchedRules, { evaluation });
  }

  matchedRules.push('RG-005:release-approved');
  return {
    outcome: { allowed: true, reason: '确定性业务合同及资源回归门禁通过，允许按该合同范围发布；面试语义质量未评估。', acceptanceScope: 'deterministic-output-contract', notAssessed: ['interview-semantic-quality', 'training-effectiveness', 'complete-trajectory'] },
    ruleSetVersion: RELEASE_GATE_RULESET_VERSION,
    matchedRules,
    evidence: {
      evaluation,
      baselineEvaluation: comparison.baseline,
      minimumScore: MIN_RELEASE_SCORE,
      minimumRepeats: MIN_RELEASE_REPEATS,
      maximumResourceRegressionRatio: MAX_RESOURCE_REGRESSION_RATIO,
      minimumPairedCases: MIN_RELEASE_CASES,
      nonInferiorityMarginPoints: NON_INFERIORITY_MARGIN_POINTS,
      maximumStratumRegressionPoints: MAX_STRATUM_REGRESSION_POINTS,
      statisticalComparison: comparison.baseline
        ? compareStratifiedEvidence(evaluation.metrics, comparison.baseline.metrics)
        : null,
    },
  };
}

function answerCacheIsolated(metrics: unknown) {
  return toRecord(metrics).cachePolicy === 'semantic-cache-bypass/v1';
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

function stratificationAvailable(metrics: unknown, totalCases: number) {
  const stratification = toRecord(toRecord(metrics).stratification);
  const caseCount = numberValue(stratification.caseCount);
  return stratification.status === 'available'
    && Array.isArray(stratification.cases)
    && stratification.cases.length === caseCount
    && caseCount === totalCases
    && caseCount >= MIN_RELEASE_CASES;
}

function denied(
  reason: string,
  matchedRules: string[],
  evidence: Record<string, unknown>,
): InferenceDecision<ReleaseGateOutcome> {
  return {
    outcome: { allowed: false, reason, acceptanceScope: 'deterministic-output-contract', notAssessed: ['interview-semantic-quality', 'training-effectiveness', 'complete-trajectory'] },
    ruleSetVersion: RELEASE_GATE_RULESET_VERSION,
    matchedRules,
    evidence,
  };
}

/** This proves bounded deterministic checks only, never a calibrated semantic judge. */
function businessEvidence(metrics: unknown, totalCases: number): { contractHash: string } | null {
  const value = toRecord(metrics);
  const quality = toRecord(value.qualityEvidence);
  const repeats = value.repeatCount;
  if (value.evaluatorType !== 'BUSINESS_ASSERTIONS' || quality.version !== 'evaluation-evidence/v1'
    || quality.kind !== 'deterministic-business-contract' || quality.scope !== 'output-contract'
    || quality.contractVersion !== 'business-assertions/v1' || quality.semanticQuality !== 'not-assessed'
    || typeof quality.contractHash !== 'string' || !/^[0-9a-f]{64}$/.test(quality.contractHash)
    || typeof repeats !== 'number' || !Number.isSafeInteger(repeats) || repeats < 1
    || typeof quality.assertionCount !== 'number' || !Number.isSafeInteger(quality.assertionCount)
    || quality.assertionCount < totalCases * repeats || quality.passed !== quality.assertionCount
    || quality.failed !== 0 || quality.unavailable !== 0) return null;
  return { contractHash: quality.contractHash };
}
