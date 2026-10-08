ALTER TABLE "agent_evaluation_runs"
  ADD COLUMN "requestKey" TEXT,
  ADD COLUMN "requestHash" TEXT,
  ADD COLUMN "requestParams" JSONB,
  ADD COLUMN "requestedByUserId" TEXT,
  ADD COLUMN "leaseOwner" TEXT,
  ADD COLUMN "heartbeatAt" TIMESTAMP(3),
  ADD COLUMN "completedSamples" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "completedCases" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "agent_evaluation_runs_organizationId_workspaceId_requestKey_key"
  ON "agent_evaluation_runs" ("organizationId", "workspaceId", "requestKey");
-- One paid evaluation per Agent/workspace, across all API replicas.
-- Legacy synchronous records are intentionally outside the new queue contract.
CREATE UNIQUE INDEX "agent_evaluation_runs_active_job_key"
  ON "agent_evaluation_runs" ("organizationId", "workspaceId", "agentId")
  WHERE "requestKey" IS NOT NULL AND "status" IN ('PENDING', 'RUNNING');
CREATE INDEX "agent_evaluation_runs_organizationId_status_createdAt_idx"
  ON "agent_evaluation_runs" ("organizationId", "status", "createdAt");
