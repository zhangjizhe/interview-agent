export type DecisionEvidence = Record<string, unknown>;

export interface InferenceDecision<T> {
  outcome: T;
  ruleSetVersion: string;
  matchedRules: string[];
  evidence: DecisionEvidence;
}
