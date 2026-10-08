import type { JsonObject } from './api';

export interface AgentVersion {
  id: string;
  version: string;
  status: string;
  createdAt?: string;
  systemPrompt?: string | null;
  modelConfig?: JsonObject | null;
  runtimeConfig?: JsonObject | null;
  toolBindings?: JsonObject | null;
  knowledgeBindings?: JsonObject | null;
  memoryBindings?: JsonObject | null;
  inputSchema?: JsonObject | null;
  outputSchema?: JsonObject | null;
  changelog?: string | null;
  publishedAt?: string | null;
}

export interface LabAgent {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  type: string;
  status?: string;
  updatedAt?: string;
  currentVersion?: AgentVersion | null;
  _count?: { versions: number };
  versions?: AgentVersion[];
}

export interface LabApplication {
  id: string;
  key: string;
  name: string;
  type: string;
  status: string;
  updatedAt?: string;
  agentId: string;
  agent: Pick<LabAgent, 'id' | 'key' | 'name' | 'currentVersion'>;
  _count?: { runs: number };
}

export interface LabRun {
  id: string;
  application?: string | null;
  externalRunId?: string | null;
  status: string;
  input?: JsonObject | null;
  output?: JsonObject | null;
  error?: string | null;
  latencyMs?: number | null;
  createdAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  agent: Pick<LabAgent, 'id' | 'key' | 'name'>;
  agentVersion: Pick<AgentVersion, 'id' | 'version'>;
}

export interface TraceEvent {
  id: string;
  seq: number;
  type: string;
  name?: string;
  step?: string | null;
  createdAt?: string;
  payload?: JsonObject | null;
  error?: string | null;
}

export interface EvaluationDataset {
  id: string;
  key: string;
  name: string;
  version: string;
  description?: string | null;
  updatedAt?: string;
  _count?: { cases: number; evaluationRuns: number };
}

export interface EvaluationCase {
  id: string;
  key: string;
  input: JsonObject;
  expectedOutput?: JsonObject | null;
  enabled?: boolean;
  createdAt?: string;
}

export interface EvaluationDatasetDetail extends EvaluationDataset {
  cases: EvaluationCase[];
}

export interface Evaluator {
  id: string;
  key: string;
  name: string;
  type: 'KEYWORD' | 'JSON_SCHEMA' | 'LATENCY';
  config?: JsonObject | null;
}

export interface EvaluationRun {
  id: string;
  status: string;
  score?: number | null;
  totalCases: number;
  passedCases?: number;
  failedCases?: number;
  createdAt?: string;
  completedAt?: string | null;
  dataset: Pick<EvaluationDataset, 'id' | 'key' | 'name' | 'version'>;
  evaluator: Pick<Evaluator, 'id' | 'key' | 'name' | 'type'>;
  agentVersion: Pick<AgentVersion, 'id' | 'version'>;
}
