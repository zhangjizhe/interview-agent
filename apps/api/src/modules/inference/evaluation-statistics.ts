export const RELEASE_SEGMENT_DIMENSIONS = ['jobFamily', 'skill', 'difficulty'] as const;
export const MIN_RELEASE_CASES = 10;
export const MIN_CASES_PER_STRATUM = 2;
export const MIN_DISTINCT_SEGMENTS: Record<ReleaseSegmentDimension, number> = {
  jobFamily: 1,
  skill: 2,
  difficulty: 2,
};
export const NON_INFERIORITY_MARGIN_POINTS = 2;
export const MAX_STRATUM_REGRESSION_POINTS = 5;

export type ReleaseSegmentDimension = typeof RELEASE_SEGMENT_DIMENSIONS[number];
export type ReleaseSegments = Record<ReleaseSegmentDimension, string>;

export type StratifiedCaseInput = {
  caseKey: string;
  score: number;
  passed: boolean;
  passRate?: number;
  metadata: unknown;
};

export type StratifiedCaseScore = {
  caseKey: string;
  score: number;
  passRate: number;
  segments: ReleaseSegments;
};

export type StratifiedEvaluationEvidence = {
  status: 'available' | 'unavailable';
  requiredDimensions: readonly ReleaseSegmentDimension[];
  minimumCases: number;
  minimumCasesPerStratum: number;
  caseCount: number;
  reasons: string[];
  cases: StratifiedCaseScore[];
  strata: Record<ReleaseSegmentDimension, Array<{
    value: string;
    caseCount: number;
    averageScore: number;
    passRate: number;
  }>>;
};

export type PairedNonInferiorityEvidence = {
  status: 'available' | 'unavailable';
  confidenceLevel: 0.95;
  nonInferiorityMarginPoints: number;
  maximumStratumRegressionPoints: number;
  pairedCaseCount: number;
  meanDeltaPoints?: number;
  lowerConfidenceBoundPoints?: number;
  upperConfidenceBoundPoints?: number;
  nonInferior?: boolean;
  stratumRegressions: Array<{
    dimension: ReleaseSegmentDimension;
    value: string;
    caseCount: number;
    meanDeltaPoints: number;
  }>;
  reasons: string[];
};

const SEGMENT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function buildStratifiedEvaluationEvidence(
  inputs: StratifiedCaseInput[],
): StratifiedEvaluationEvidence {
  const reasons: string[] = [];
  if (inputs.length < MIN_RELEASE_CASES) {
    reasons.push(`发布证据至少需要 ${MIN_RELEASE_CASES} 个启用 Case`);
  }

  const seenKeys = new Set<string>();
  const cases: StratifiedCaseScore[] = [];
  for (const input of inputs) {
    if (seenKeys.has(input.caseKey)) reasons.push(`Case key 重复：${input.caseKey}`);
    seenKeys.add(input.caseKey);
    const segments = readSegments(input.metadata);
    if (!segments) {
      reasons.push(`Case ${input.caseKey} 缺少合法的 jobFamily/skill/difficulty 标签`);
      continue;
    }
    if (!Number.isFinite(input.score) || input.score < 0 || input.score > 100) {
      reasons.push(`Case ${input.caseKey} 分数无效`);
      continue;
    }
    const passRate = input.passRate ?? (input.passed ? 1 : 0);
    if (!Number.isFinite(passRate) || passRate < 0 || passRate > 1) {
      reasons.push(`Case ${input.caseKey} 通过率无效`);
      continue;
    }
    cases.push({
      caseKey: input.caseKey,
      score: round(input.score),
      passRate: round(passRate),
      segments,
    });
  }

  const strata = emptyStrata();
  for (const dimension of RELEASE_SEGMENT_DIMENSIONS) {
    const grouped = new Map<string, StratifiedCaseScore[]>();
    for (const item of cases) {
      const value = item.segments[dimension];
      grouped.set(value, [...(grouped.get(value) ?? []), item]);
    }
    if (grouped.size < MIN_DISTINCT_SEGMENTS[dimension]) {
      reasons.push(`${dimension} 至少需要 ${MIN_DISTINCT_SEGMENTS[dimension]} 个不同切片`);
    }
    for (const [value, items] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      if (items.length < MIN_CASES_PER_STRATUM) {
        reasons.push(`${dimension}=${value} 至少需要 ${MIN_CASES_PER_STRATUM} 个 Case`);
      }
      strata[dimension].push({
        value,
        caseCount: items.length,
        averageScore: round(mean(items.map((item) => item.score))),
        passRate: round(mean(items.map((item) => item.passRate))),
      });
    }
  }

  return {
    status: reasons.length === 0 ? 'available' : 'unavailable',
    requiredDimensions: RELEASE_SEGMENT_DIMENSIONS,
    minimumCases: MIN_RELEASE_CASES,
    minimumCasesPerStratum: MIN_CASES_PER_STRATUM,
    caseCount: inputs.length,
    reasons: [...new Set(reasons)],
    cases: cases.sort((left, right) => left.caseKey.localeCompare(right.caseKey)),
    strata,
  };
}

export function compareStratifiedEvidence(
  candidateMetrics: unknown,
  baselineMetrics: unknown,
): PairedNonInferiorityEvidence {
  const unavailable = (reasons: string[]): PairedNonInferiorityEvidence => ({
    status: 'unavailable',
    confidenceLevel: 0.95,
    nonInferiorityMarginPoints: NON_INFERIORITY_MARGIN_POINTS,
    maximumStratumRegressionPoints: MAX_STRATUM_REGRESSION_POINTS,
    pairedCaseCount: 0,
    stratumRegressions: [],
    reasons,
  });
  const candidate = readStratification(candidateMetrics);
  const baseline = readStratification(baselineMetrics);
  if (!candidate || candidate.status !== 'available') {
    return unavailable(['候选评测缺少可用的业务切片证据']);
  }
  if (!baseline || baseline.status !== 'available') {
    return unavailable(['基线评测缺少可用的业务切片证据']);
  }

  const baselineByKey = new Map(baseline.cases.map((item) => [item.caseKey, item]));
  const candidateKeys = new Set(candidate.cases.map((item) => item.caseKey));
  if (candidate.cases.length !== baseline.cases.length
    || candidate.cases.some((item) => !baselineByKey.has(item.caseKey))
    || baseline.cases.some((item) => !candidateKeys.has(item.caseKey))) {
    return unavailable(['候选与基线的 Case key 无法完整配对']);
  }

  const pairs: Array<{ candidate: StratifiedCaseScore; baseline: StratifiedCaseScore; delta: number }> = [];
  for (const item of candidate.cases) {
    const baselineItem = baselineByKey.get(item.caseKey)!;
    if (RELEASE_SEGMENT_DIMENSIONS.some(
      (dimension) => item.segments[dimension] !== baselineItem.segments[dimension],
    )) {
      return unavailable([`Case ${item.caseKey} 的业务切片标签与基线不一致`]);
    }
    pairs.push({ candidate: item, baseline: baselineItem, delta: item.score - baselineItem.score });
  }
  if (pairs.length < MIN_RELEASE_CASES) {
    return unavailable([`成对比较至少需要 ${MIN_RELEASE_CASES} 个 Case`]);
  }

  const deltas = pairs.map((item) => item.delta);
  const meanDelta = mean(deltas);
  const standardError = sampleStandardDeviation(deltas) / Math.sqrt(deltas.length);
  const criticalValue = tCritical95(deltas.length - 1);
  const lower = meanDelta - criticalValue * standardError;
  const upper = meanDelta + criticalValue * standardError;
  const stratumRegressions = collectStratumRegressions(pairs);
  const nonInferior = lower >= -NON_INFERIORITY_MARGIN_POINTS
    && stratumRegressions.length === 0;

  return {
    status: 'available',
    confidenceLevel: 0.95,
    nonInferiorityMarginPoints: NON_INFERIORITY_MARGIN_POINTS,
    maximumStratumRegressionPoints: MAX_STRATUM_REGRESSION_POINTS,
    pairedCaseCount: pairs.length,
    meanDeltaPoints: round(meanDelta),
    lowerConfidenceBoundPoints: round(lower),
    upperConfidenceBoundPoints: round(upper),
    nonInferior,
    stratumRegressions,
    reasons: nonInferior
      ? []
      : [
          ...(lower < -NON_INFERIORITY_MARGIN_POINTS
            ? ['95% 成对置信区间未达到非劣效边界']
            : []),
          ...(stratumRegressions.length > 0 ? ['存在业务切片平均分显著回归'] : []),
        ],
  };
}

function readSegments(metadata: unknown): ReleaseSegments | null {
  const record = toRecord(metadata);
  const source = toRecord(record.segments);
  const values = {} as ReleaseSegments;
  for (const dimension of RELEASE_SEGMENT_DIMENSIONS) {
    const value = source[dimension];
    if (typeof value !== 'string' || !SEGMENT_PATTERN.test(value)) return null;
    values[dimension] = value;
  }
  return values;
}

function readStratification(metrics: unknown): StratifiedEvaluationEvidence | null {
  const value = toRecord(metrics).stratification;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const evidence = value as StratifiedEvaluationEvidence;
  if (!Array.isArray(evidence.cases)
    || !evidence.cases.every((item) => isStratifiedCaseScore(item))) return null;
  return evidence;
}

function isStratifiedCaseScore(value: unknown): value is StratifiedCaseScore {
  const item = toRecord(value);
  const segments = toRecord(item.segments);
  return typeof item.caseKey === 'string'
    && item.caseKey.length > 0
    && typeof item.score === 'number'
    && Number.isFinite(item.score)
    && item.score >= 0
    && item.score <= 100
    && typeof item.passRate === 'number'
    && Number.isFinite(item.passRate)
    && item.passRate >= 0
    && item.passRate <= 1
    && RELEASE_SEGMENT_DIMENSIONS.every((dimension) =>
      typeof segments[dimension] === 'string' && SEGMENT_PATTERN.test(segments[dimension] as string));
}

function collectStratumRegressions(
  pairs: Array<{ candidate: StratifiedCaseScore; baseline: StratifiedCaseScore; delta: number }>,
) {
  const regressions: PairedNonInferiorityEvidence['stratumRegressions'] = [];
  for (const dimension of RELEASE_SEGMENT_DIMENSIONS) {
    const groups = new Map<string, number[]>();
    for (const pair of pairs) {
      const value = pair.candidate.segments[dimension];
      groups.set(value, [...(groups.get(value) ?? []), pair.delta]);
    }
    for (const [value, deltas] of groups) {
      const meanDelta = mean(deltas);
      if (meanDelta < -MAX_STRATUM_REGRESSION_POINTS) {
        regressions.push({
          dimension,
          value,
          caseCount: deltas.length,
          meanDeltaPoints: round(meanDelta),
        });
      }
    }
  }
  return regressions.sort((left, right) =>
    `${left.dimension}:${left.value}`.localeCompare(`${right.dimension}:${right.value}`));
}

function emptyStrata(): StratifiedEvaluationEvidence['strata'] {
  return { jobFamily: [], skill: [], difficulty: [] };
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStandardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
}

// 双侧 95% Student t 临界值；30 个以上样本使用正态近似。
function tCritical95(degreesOfFreedom: number) {
  const table = [
    0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262,
    2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093,
    2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045,
  ];
  return degreesOfFreedom < table.length ? table[Math.max(1, degreesOfFreedom)] : 1.96;
}

function round(value: number) {
  return Number(value.toFixed(6));
}
