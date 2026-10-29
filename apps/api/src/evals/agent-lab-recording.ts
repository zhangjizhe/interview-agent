import { createHash } from 'crypto';
import type { EvalReport } from './eval-reporter';
import { INTERVIEW_DECISION_CONTRACT_VERSION } from '../modules/interview/services/interview-decision.contract';

export type AgentLabRecordedRun = {
  agentKey: string;
  agentVersion: string;
  runtimeVersion: string;
  datasetVersion: string;
  inputHash: string;
  metrics: {
    qualityScore: number;
    structuredOutputValidRate: number;
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostCny: number;
  };
  traceSummary: { stages: string[]; toolCalls: number; status: string };
  failures: Array<{ caseId: string; category: string; severity: string }>;
};

export function toAgentLabRecordedRun(
  report: EvalReport,
  metadata: { agentKey: string; agentVersion: string; runtimeVersion: string },
): AgentLabRecordedRun {
  if (report.qualityVerdict?.status !== 'PASS'
    || report.metadata.scorerContractVersion !== INTERVIEW_DECISION_CONTRACT_VERSION
    || !/^[0-9a-f]{64}$/.test(report.metadata.promptHash ?? '')
    || ![report.metadata.observedModels, report.metadata.observedProviders].every(values => Array.isArray(values) && values.length > 0
      && values.every(value => typeof value === 'string' && value.trim().length > 0 && value !== 'unknown' && value.length <= 200))) {
    throw new Error('GOLDEN_RECORDING_QUALITY_NOT_ACCEPTED');
  }
  const resources = report.resourceEvidence;
  if (!resources || resources.status !== 'available'
    || !Number.isSafeInteger(resources.inputTokens) || resources.inputTokens < 0
    || !Number.isSafeInteger(resources.outputTokens) || resources.outputTokens < 0
    || !Number.isFinite(resources.estimatedCostCny) || resources.estimatedCostCny < 0) {
    throw new Error('GOLDEN_RECORDING_RESOURCE_EVIDENCE_UNAVAILABLE');
  }
  const totalResponses = report.caseResults.reduce((total, item) => total + item.responses.length, 0);
  const errors = report.caseResults.flatMap((item) =>
    item.responses.filter((response) => response.error).map(() => item.caseId),
  );
  const metrics = report.overall;
  if (!totalResponses || errors.length || metrics.attemptedSamples !== totalResponses
    || metrics.validSamples !== totalResponses || metrics.expectedSamples !== totalResponses
    || metrics.errorSamples !== 0 || metrics.errorRate !== 0 || metrics.coverageRate !== 1
    || ![metrics.scorePearson, metrics.scoreMAE, metrics.levelAccuracy, metrics.keywordHitRate, report.metadata.durationMs].every(Number.isFinite)) {
    throw new Error('GOLDEN_RECORDING_INCOMPLETE_OR_INVALID_EVIDENCE');
  }
  const qualityScore = clamp(
    (clamp(metrics.scorePearson) + clamp(1 - metrics.scoreMAE / 100) + clamp(metrics.levelAccuracy) + clamp(metrics.keywordHitRate)) / 4,
  );
  const structuredOutputValidRate = totalResponses ? clamp((totalResponses - errors.length) / totalResponses) : 0;
  const failures = report.caseResults.flatMap((item) => item.responses.flatMap((response) => {
    if (response.error) return [{ caseId: item.caseId, category: 'STRUCTURED_OUTPUT', severity: 'HIGH' }];
    const deviation = response.actualScore - response.expectedScore;
    if (Math.abs(deviation) <= 25 && levelFor(response.actualScore) === response.level) return [];
    return [{
      caseId: item.caseId,
      category: deviation > 0 ? 'OVER_SCORING' : 'UNDER_SCORING',
      severity: Math.abs(deviation) > 40 ? 'HIGH' : 'MEDIUM',
    }];
  }));

  return {
    agentKey: metadata.agentKey,
    agentVersion: metadata.agentVersion,
    runtimeVersion: metadata.runtimeVersion,
    datasetVersion: report.metadata.datasetVersion,
    inputHash: createHash('sha256').update(JSON.stringify({
      datasetVersion: report.metadata.datasetVersion,
      timestamp: report.metadata.timestamp,
      metrics: report.overall,
      scorerContractVersion: report.metadata.scorerContractVersion,
      promptHash: report.metadata.promptHash,
      resourceEvidence: resources,
    })).digest('hex'),
    metrics: {
      qualityScore,
      structuredOutputValidRate,
      latencyMs: report.metadata.durationMs,
      inputTokens: resources.inputTokens,
      outputTokens: resources.outputTokens,
      estimatedCostCny: resources.estimatedCostCny,
    },
    traceSummary: { stages: ['golden-dataset', 'recorded-evaluator', 'report'], toolCalls: 0, status: errors.length ? 'COMPLETED_WITH_ERRORS' : 'SUCCEEDED' },
    failures,
  };
}

function clamp(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function levelFor(score: number) {
  return score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'average' : 'poor';
}
