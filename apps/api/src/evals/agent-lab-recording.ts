import { createHash } from 'crypto';
import type { EvalReport } from './eval-reporter';

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
  const totalResponses = report.caseResults.reduce((total, item) => total + item.responses.length, 0);
  const errors = report.caseResults.flatMap((item) =>
    item.responses.filter((response) => response.error).map(() => item.caseId),
  );
  const metrics = report.overall;
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
    })).digest('hex'),
    metrics: {
      qualityScore,
      structuredOutputValidRate,
      latencyMs: report.metadata.durationMs,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostCny: 0,
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
