CREATE TYPE "LabValidationStatus" AS ENUM ('VALID', 'INVALID');
CREATE TYPE "LabRunType" AS ENUM ('RECORDED', 'REPLAY');
CREATE TYPE "LabRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "LabFailureCategory" AS ENUM ('WRONG_QUESTION', 'BAD_FOLLOWUP', 'MISSING_EVIDENCE', 'HALLUCINATION', 'CONTEXT_MISS', 'MEMORY_MISS', 'RAG_MISS', 'DIFFICULTY_MISMATCH', 'REPETITIVE', 'OVER_SCORING', 'UNDER_SCORING', 'WRONG_SKILL', 'STRUCTURED_OUTPUT', 'SAFETY', 'UNKNOWN');
CREATE TYPE "LabFailureSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "LabExperimentStatus" AS ENUM ('DRAFT', 'RUNNING', 'COMPLETED');
CREATE TYPE "LabExperimentArm" AS ENUM ('CONTROL', 'TREATMENT');
CREATE TYPE "LabReleaseDecisionStatus" AS ENUM ('APPROVE', 'NEEDS_REVIEW', 'REJECT');

CREATE TABLE "lab_datasets" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "caseCount" INTEGER NOT NULL,
    "responseCount" INTEGER NOT NULL,
    "validationStatus" "LabValidationStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lab_datasets_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "lab_agent_versions" (
    "id" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "runtimeVersion" TEXT NOT NULL,
    "promptVersion" TEXT,
    "modelProvider" TEXT,
    "modelVersion" TEXT,
    "toolPolicyVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lab_agent_versions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "lab_runs" (
    "id" TEXT NOT NULL,
    "agentVersionId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "runType" "LabRunType" NOT NULL,
    "status" "LabRunStatus" NOT NULL DEFAULT 'PENDING',
    "traceRef" TEXT,
    "inputHash" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "traceSummary" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostCny" DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "lab_runs_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "lab_failures" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "category" "LabFailureCategory" NOT NULL,
    "severity" "LabFailureSeverity" NOT NULL,
    "evidenceSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lab_failures_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "lab_experiments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hypothesis" TEXT NOT NULL,
    "controlVersionId" TEXT NOT NULL,
    "treatmentVersionId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "status" "LabExperimentStatus" NOT NULL DEFAULT 'DRAFT',
    "comparison" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "lab_experiments_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "lab_experiment_runs" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "arm" "LabExperimentArm" NOT NULL,
    CONSTRAINT "lab_experiment_runs_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "lab_release_decisions" (
    "id" TEXT NOT NULL,
    "agentVersionId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "runId" TEXT,
    "experimentId" TEXT,
    "decision" "LabReleaseDecisionStatus" NOT NULL,
    "thresholdSnapshot" JSONB NOT NULL,
    "metricsSnapshot" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lab_release_decisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lab_datasets_version_key" ON "lab_datasets"("version");
CREATE UNIQUE INDEX "lab_agent_versions_agentKey_version_key" ON "lab_agent_versions"("agentKey", "version");
CREATE UNIQUE INDEX "lab_experiment_runs_experimentId_runId_key" ON "lab_experiment_runs"("experimentId", "runId");
CREATE INDEX "lab_datasets_validationStatus_createdAt_idx" ON "lab_datasets"("validationStatus", "createdAt");
CREATE INDEX "lab_agent_versions_agentKey_createdAt_idx" ON "lab_agent_versions"("agentKey", "createdAt");
CREATE INDEX "lab_runs_datasetId_startedAt_idx" ON "lab_runs"("datasetId", "startedAt");
CREATE INDEX "lab_runs_agentVersionId_startedAt_idx" ON "lab_runs"("agentVersionId", "startedAt");
CREATE INDEX "lab_runs_status_startedAt_idx" ON "lab_runs"("status", "startedAt");
CREATE INDEX "lab_failures_runId_severity_idx" ON "lab_failures"("runId", "severity");
CREATE INDEX "lab_failures_category_createdAt_idx" ON "lab_failures"("category", "createdAt");
CREATE INDEX "lab_experiments_datasetId_createdAt_idx" ON "lab_experiments"("datasetId", "createdAt");
CREATE INDEX "lab_experiments_status_createdAt_idx" ON "lab_experiments"("status", "createdAt");
CREATE INDEX "lab_experiment_runs_experimentId_arm_idx" ON "lab_experiment_runs"("experimentId", "arm");
CREATE INDEX "lab_release_decisions_agentVersionId_createdAt_idx" ON "lab_release_decisions"("agentVersionId", "createdAt");
CREATE INDEX "lab_release_decisions_decision_createdAt_idx" ON "lab_release_decisions"("decision", "createdAt");

ALTER TABLE "lab_runs" ADD CONSTRAINT "lab_runs_agentVersionId_fkey" FOREIGN KEY ("agentVersionId") REFERENCES "lab_agent_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lab_runs" ADD CONSTRAINT "lab_runs_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "lab_datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lab_failures" ADD CONSTRAINT "lab_failures_runId_fkey" FOREIGN KEY ("runId") REFERENCES "lab_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lab_experiments" ADD CONSTRAINT "lab_experiments_controlVersionId_fkey" FOREIGN KEY ("controlVersionId") REFERENCES "lab_agent_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lab_experiments" ADD CONSTRAINT "lab_experiments_treatmentVersionId_fkey" FOREIGN KEY ("treatmentVersionId") REFERENCES "lab_agent_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lab_experiments" ADD CONSTRAINT "lab_experiments_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "lab_datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lab_experiment_runs" ADD CONSTRAINT "lab_experiment_runs_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "lab_experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lab_experiment_runs" ADD CONSTRAINT "lab_experiment_runs_runId_fkey" FOREIGN KEY ("runId") REFERENCES "lab_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lab_release_decisions" ADD CONSTRAINT "lab_release_decisions_agentVersionId_fkey" FOREIGN KEY ("agentVersionId") REFERENCES "lab_agent_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lab_release_decisions" ADD CONSTRAINT "lab_release_decisions_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "lab_datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lab_release_decisions" ADD CONSTRAINT "lab_release_decisions_runId_fkey" FOREIGN KEY ("runId") REFERENCES "lab_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lab_release_decisions" ADD CONSTRAINT "lab_release_decisions_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "lab_experiments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
