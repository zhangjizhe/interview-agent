-- Imported from 20260814123000_add_agent_lab_phase1
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'MEMBER');
CREATE TYPE "AgentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "AgentVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workspace_members" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_versions" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" "AgentVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "modelConfig" JSONB,
    "systemPrompt" TEXT NOT NULL DEFAULT '',
    "runtimeConfig" JSONB,
    "toolBindings" JSONB,
    "knowledgeBindings" JSONB,
    "memoryBindings" JSONB,
    "inputSchema" JSONB,
    "outputSchema" JSONB,
    "changelog" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "agent_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");
CREATE INDEX "workspaces_ownerId_idx" ON "workspaces"("ownerId");
CREATE UNIQUE INDEX "workspace_members_workspaceId_userId_key" ON "workspace_members"("workspaceId", "userId");
CREATE INDEX "workspace_members_userId_idx" ON "workspace_members"("userId");
CREATE UNIQUE INDEX "agents_workspaceId_key_key" ON "agents"("workspaceId", "key");
CREATE INDEX "agents_workspaceId_updatedAt_idx" ON "agents"("workspaceId", "updatedAt");
CREATE UNIQUE INDEX "agent_versions_agentId_version_key" ON "agent_versions"("agentId", "version");
CREATE INDEX "agent_versions_agentId_createdAt_idx" ON "agent_versions"("agentId", "createdAt");

ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agents" ADD CONSTRAINT "agents_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agents" ADD CONSTRAINT "agents_currentVersionId_fkey"
  FOREIGN KEY ("currentVersionId") REFERENCES "agent_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Imported from 20260814133000_add_agent_lab_runtime
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

CREATE TABLE "runs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "agentVersionId" TEXT NOT NULL,
    "application" TEXT,
    "externalRunId" TEXT,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "latencyMs" INTEGER,
    "tokenUsage" JSONB,
    "estimatedCost" DOUBLE PRECISION,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trace_events" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "metadata" JSONB,
    "latencyMs" INTEGER,
    "tokenUsage" JSONB,
    "estimatedCost" DOUBLE PRECISION,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trace_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "runs_workspaceId_createdAt_idx" ON "runs"("workspaceId", "createdAt");
CREATE INDEX "runs_agentId_createdAt_idx" ON "runs"("agentId", "createdAt");
CREATE INDEX "runs_agentVersionId_createdAt_idx" ON "runs"("agentVersionId", "createdAt");
CREATE INDEX "runs_externalRunId_idx" ON "runs"("externalRunId");
CREATE UNIQUE INDEX "trace_events_runId_sequence_key" ON "trace_events"("runId", "sequence");
CREATE INDEX "trace_events_runId_sequence_idx" ON "trace_events"("runId", "sequence");

ALTER TABLE "runs" ADD CONSTRAINT "runs_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "runs" ADD CONSTRAINT "runs_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "runs" ADD CONSTRAINT "runs_agentVersionId_fkey"
  FOREIGN KEY ("agentVersionId") REFERENCES "agent_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trace_events" ADD CONSTRAINT "trace_events_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Imported from 20260814143000_add_agent_lab_evaluations
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

CREATE TABLE "agent_evaluation_runs" (
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

    CONSTRAINT "agent_evaluation_runs_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "agent_evaluation_runs_workspaceId_createdAt_idx" ON "agent_evaluation_runs"("workspaceId", "createdAt");
CREATE INDEX "agent_evaluation_runs_agentId_createdAt_idx" ON "agent_evaluation_runs"("agentId", "createdAt");
CREATE INDEX "agent_evaluation_runs_agentVersionId_createdAt_idx" ON "agent_evaluation_runs"("agentVersionId", "createdAt");
CREATE UNIQUE INDEX "evaluation_results_evaluationRunId_datasetCaseId_key" ON "evaluation_results"("evaluationRunId", "datasetCaseId");
CREATE INDEX "evaluation_results_datasetCaseId_idx" ON "evaluation_results"("datasetCaseId");
CREATE INDEX "evaluation_results_runId_idx" ON "evaluation_results"("runId");

ALTER TABLE "evaluation_datasets" ADD CONSTRAINT "evaluation_datasets_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluation_dataset_cases" ADD CONSTRAINT "evaluation_dataset_cases_datasetId_fkey"
  FOREIGN KEY ("datasetId") REFERENCES "evaluation_datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluators" ADD CONSTRAINT "evaluators_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_evaluation_runs" ADD CONSTRAINT "agent_evaluation_runs_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_evaluation_runs" ADD CONSTRAINT "agent_evaluation_runs_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_evaluation_runs" ADD CONSTRAINT "agent_evaluation_runs_agentVersionId_fkey"
  FOREIGN KEY ("agentVersionId") REFERENCES "agent_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_evaluation_runs" ADD CONSTRAINT "agent_evaluation_runs_datasetId_fkey"
  FOREIGN KEY ("datasetId") REFERENCES "evaluation_datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_evaluation_runs" ADD CONSTRAINT "agent_evaluation_runs_evaluatorId_fkey"
  FOREIGN KEY ("evaluatorId") REFERENCES "evaluators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_evaluationRunId_fkey"
  FOREIGN KEY ("evaluationRunId") REFERENCES "agent_evaluation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_datasetCaseId_fkey"
  FOREIGN KEY ("datasetCaseId") REFERENCES "evaluation_dataset_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Imported from 20260814150000_add_agent_lab_trace_events
ALTER TABLE "runs" ADD COLUMN "traceSequence" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "trace_events"
  ADD COLUMN "formatVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "turnId" TEXT,
  ADD COLUMN "step" TEXT,
  ADD COLUMN "callId" TEXT,
  ADD COLUMN "modelVisible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "payload" JSONB;

CREATE INDEX "trace_events_runId_callId_idx" ON "trace_events"("runId", "callId");


-- Imported from 20260814153000_add_agent_lab_tool_approvals
CREATE TYPE "ToolApprovalStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'DENIED',
  'CANCELLED',
  'TIMED_OUT',
  'ERROR'
);

CREATE TABLE "tool_approvals" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "status" "ToolApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "request" JSONB NOT NULL,
    "decision" JSONB,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "tool_approvals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tool_approvals_runId_callId_key" ON "tool_approvals"("runId", "callId");
CREATE INDEX "tool_approvals_runId_status_idx" ON "tool_approvals"("runId", "status");

ALTER TABLE "tool_approvals" ADD CONSTRAINT "tool_approvals_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Imported from 20260814160000_add_agent_lab_sub_runs
ALTER TABLE "runs"
  ADD COLUMN "parentRunId" TEXT,
  ADD COLUMN "budget" JSONB,
  ADD COLUMN "cancelRequestedAt" TIMESTAMP(3);

CREATE INDEX "runs_parentRunId_createdAt_idx" ON "runs"("parentRunId", "createdAt");

ALTER TABLE "runs" ADD CONSTRAINT "runs_parentRunId_fkey"
  FOREIGN KEY ("parentRunId") REFERENCES "runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Imported from 20260817100000_add_agent_lab_applications
CREATE TYPE "ApplicationStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'ACTIVE',
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "application_runs" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "externalSessionId" TEXT,
    "turn" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "applications_workspaceId_key_key" ON "applications"("workspaceId", "key");
CREATE INDEX "applications_workspaceId_updatedAt_idx" ON "applications"("workspaceId", "updatedAt");
CREATE INDEX "applications_agentId_idx" ON "applications"("agentId");
CREATE UNIQUE INDEX "application_runs_runId_key" ON "application_runs"("runId");
CREATE INDEX "application_runs_applicationId_createdAt_idx" ON "application_runs"("applicationId", "createdAt");
CREATE INDEX "application_runs_externalSessionId_createdAt_idx" ON "application_runs"("externalSessionId", "createdAt");

ALTER TABLE "applications" ADD CONSTRAINT "applications_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "applications" ADD CONSTRAINT "applications_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "application_runs" ADD CONSTRAINT "application_runs_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "application_runs" ADD CONSTRAINT "application_runs_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Imported from 20260820140000_add_decision_ledger
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DecisionDomain') THEN
    CREATE TYPE "DecisionDomain" AS ENUM ('INTERVIEW', 'AGENT_LAB');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "decision_records" (
  "id" TEXT NOT NULL,
  "domain" "DecisionDomain" NOT NULL,
  "decisionType" TEXT NOT NULL,
  "subjectType" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "outcome" JSONB NOT NULL,
  "ruleSetVersion" TEXT NOT NULL,
  "inputSnapshot" JSONB NOT NULL,
  "inputHash" TEXT NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorId" TEXT,
  "interviewId" TEXT,
  "agentId" TEXT,
  "agentVersionId" TEXT,
  CONSTRAINT "decision_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "fact_assertions" (
  "id" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "subjectType" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "predicate" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "polarity" BOOLEAN NOT NULL DEFAULT true,
  "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validTo" TIMESTAMP(3),
  "sourceType" TEXT,
  "sourceId" TEXT,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fact_assertions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "decision_evidence" (
  "id" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT,
  "payload" JSONB,
  "contentHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "decision_evidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "decision_records_domain_subjectType_subjectId_recordedAt_idx"
  ON "decision_records"("domain", "subjectType", "subjectId", "recordedAt");
CREATE INDEX IF NOT EXISTS "decision_records_interviewId_recordedAt_idx"
  ON "decision_records"("interviewId", "recordedAt");
CREATE INDEX IF NOT EXISTS "decision_records_agentVersionId_recordedAt_idx"
  ON "decision_records"("agentVersionId", "recordedAt");
CREATE INDEX IF NOT EXISTS "fact_assertions_decisionId_idx"
  ON "fact_assertions"("decisionId");
CREATE INDEX IF NOT EXISTS "fact_assertions_subjectType_subjectId_predicate_validFrom_idx"
  ON "fact_assertions"("subjectType", "subjectId", "predicate", "validFrom");
CREATE INDEX IF NOT EXISTS "decision_evidence_decisionId_createdAt_idx"
  ON "decision_evidence"("decisionId", "createdAt");
CREATE INDEX IF NOT EXISTS "decision_evidence_sourceType_sourceId_idx"
  ON "decision_evidence"("sourceType", "sourceId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decision_records_interviewId_fkey') THEN
    ALTER TABLE "decision_records"
      ADD CONSTRAINT "decision_records_interviewId_fkey"
      FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decision_records_agentId_fkey') THEN
    ALTER TABLE "decision_records"
      ADD CONSTRAINT "decision_records_agentId_fkey"
      FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decision_records_agentVersionId_fkey') THEN
    ALTER TABLE "decision_records"
      ADD CONSTRAINT "decision_records_agentVersionId_fkey"
      FOREIGN KEY ("agentVersionId") REFERENCES "agent_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fact_assertions_decisionId_fkey') THEN
    ALTER TABLE "fact_assertions"
      ADD CONSTRAINT "fact_assertions_decisionId_fkey"
      FOREIGN KEY ("decisionId") REFERENCES "decision_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decision_evidence_decisionId_fkey') THEN
    ALTER TABLE "decision_evidence"
      ADD CONSTRAINT "decision_evidence_decisionId_fkey"
      FOREIGN KEY ("decisionId") REFERENCES "decision_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
