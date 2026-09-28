import { InferenceDecision } from './inference.types';

export const RELEASE_GATE_RULESET_VERSION = 'release-gate/v1';
export const MIN_RELEASE_SCORE = 0.9;

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
}

export function inferReleaseGate(
  evaluation: ReleaseGateEvaluation | null,
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
      `评测分数必须达到 ${(MIN_RELEASE_SCORE * 100).toFixed(0)} 分。`,
      matchedRules,
      { evaluation, minimumScore: MIN_RELEASE_SCORE },
    );
  }

  matchedRules.push('RG-005:release-approved');
  return {
    outcome: { allowed: true, reason: '评测完成且全部用例通过，允许发布。' },
    ruleSetVersion: RELEASE_GATE_RULESET_VERSION,
    matchedRules,
    evidence: { evaluation, minimumScore: MIN_RELEASE_SCORE },
  };
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
