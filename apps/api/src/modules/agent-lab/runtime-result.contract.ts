import { BadRequestException } from '@nestjs/common';

export class RuntimeOutputContractError extends BadRequestException {
  constructor() { super('运行适配器最终输出无效；请核验运行与费用记录'); }
}

export type RuntimeFinalOutput = Record<string, unknown> & { response: string };

// A completion boundary, not a semantic quality score or a claim about billing.
export function normalizeRuntimeOutput(result: unknown): RuntimeFinalOutput {
  const invalid = () => new RuntimeOutputContractError();
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw invalid();
  const value = result as Record<string, unknown>;
  if (value.output !== undefined) {
    if (!value.output || typeof value.output !== 'object' || Array.isArray(value.output)
      || typeof (value.output as Record<string, unknown>).response !== 'string') throw invalid();
    return value.output as RuntimeFinalOutput;
  }
  if (typeof value.response !== 'string') throw invalid();
  return { response: value.response, intent: value.intent, plan: value.plan, pastSteps: value.pastSteps, steps: value.steps, threadId: value.threadId };
}

// Preserve only well-formed adapter-reported estimates; this is not a bill receipt.
export function runtimeFailureEvidence(result: unknown) {
  const evidence: { estimatedCost?: number; tokenUsage?: Record<string, number | string[]> } = {};
  if (!result || typeof result !== 'object' || Array.isArray(result)) return evidence;
  const value = result as Record<string, unknown>;
  if (typeof value.estimatedCostCny === 'number' && Number.isFinite(value.estimatedCostCny) && value.estimatedCostCny >= 0) evidence.estimatedCost = value.estimatedCostCny;
  const usage = value.tokenUsage;
  if (usage && typeof usage === 'object' && !Array.isArray(usage)) {
    const fields = usage as Record<string, unknown>;
    const counts = ['promptTokens', 'completionTokens', 'totalTokens', 'calls'];
    if (counts.every(key => typeof fields[key] === 'number' && Number.isSafeInteger(fields[key]) && (fields[key] as number) >= 0)
      && (fields.models === undefined || (Array.isArray(fields.models) && Array.from(fields.models).every(model => typeof model === 'string')))) {
      evidence.tokenUsage = Object.fromEntries(counts.map(key => [key, fields[key] as number]));
      if (Array.isArray(fields.models)) evidence.tokenUsage.models = [...fields.models];
    }
  }
  return evidence;
}
