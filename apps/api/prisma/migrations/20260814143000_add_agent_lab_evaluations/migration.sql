CREATE TYPE "EvaluatorType" AS ENUM ('KEYWORD', 'JSON_SCHEMA', 'LATENCY');
CREATE TYPE "EvaluationStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "EvaluationCaseStatus" AS ENUM ('COMPLETED', 'FAILED');

CREATE TABLE "evaluation_datasets" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_datasets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evaluation_dataset_cases" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "expectedOutput" JSONB,
    "metadata" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_dataset_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evaluators" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EvaluatorType" NOT NULL,
    "config" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluators_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evaluation_runs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "agentVersionId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'PENDING',
    "score" DOUBLE PRECISION,
    "totalCases" INTEGER NOT NULL DEFAULT 0,
    "passedCases" INTEGER NOT NULL DEFAULT 0,
    "failedCases" INTEGER NOT NULL DEFAULT 0,
    "metrics" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evaluation_results" (
    "id" TEXT NOT NULL,
    "evaluationRunId" TEXT NOT NULL,
    "datasetCaseId" TEXT NOT NULL,
    "runId" TEXT,
    "status" "EvaluationCaseStatus" NOT NULL,
    "score" DOUBLE PRECISION,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "metrics" JSONB,
    "evidence" JSONB,
    "outputSummary" TEXT,
    "failureCategory" TEXT,
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_results_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "evaluation_datasets_workspaceId_key_key" ON "evaluation_datasets"("workspaceId", "key");
CREATE INDEX "evaluation_datasets_workspaceId_updatedAt_idx" ON "evaluation_datasets"("workspaceId", "updatedAt");
CREATE UNIQUE INDEX "evaluation_dataset_cases_datasetId_key_key" ON "evaluation_dataset_cases"("datasetId", "key");
CREATE INDEX "evaluation_dataset_cases_datasetId_enabled_idx" ON "evaluation_dataset_cases"("datasetId", "enabled");
CREATE UNIQUE INDEX "evaluators_workspaceId_key_key" ON "evaluators"("workspaceId", "key");
CREATE INDEX "evaluators_workspaceId_updatedAt_idx" ON "evaluators"("workspaceId", "updatedAt");
CREATE INDEX "evaluation_runs_workspaceId_createdAt_idx" ON "evaluation_runs"("workspaceId", "createdAt");
CREATE INDEX "evaluation_runs_agentId_createdAt_idx" ON "evaluation_runs"("agentId", "createdAt");
CREATE INDEX "evaluation_runs_agentVersionId_createdAt_idx" ON "evaluation_runs"("agentVersionId", "createdAt");
CREATE UNIQUE INDEX "evaluation_results_evaluationRunId_datasetCaseId_key" ON "evaluation_results"("evaluationRunId", "datasetCaseId");
CREATE INDEX "evaluation_results_datasetCaseId_idx" ON "evaluation_results"("datasetCaseId");
CREATE INDEX "evaluation_results_runId_idx" ON "evaluation_results"("runId");

ALTER TABLE "evaluation_datasets" ADD CONSTRAINT "evaluation_datasets_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluation_dataset_cases" ADD CONSTRAINT "evaluation_dataset_cases_datasetId_fkey"
  FOREIGN KEY ("datasetId") REFERENCES "evaluation_datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluators" ADD CONSTRAINT "evaluators_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_agentVersionId_fkey"
  FOREIGN KEY ("agentVersionId") REFERENCES "agent_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_datasetId_fkey"
  FOREIGN KEY ("datasetId") REFERENCES "evaluation_datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_evaluatorId_fkey"
  FOREIGN KEY ("evaluatorId") REFERENCES "evaluators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_evaluationRunId_fkey"
  FOREIGN KEY ("evaluationRunId") REFERENCES "evaluation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_datasetCaseId_fkey"
  FOREIGN KEY ("datasetCaseId") REFERENCES "evaluation_dataset_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
