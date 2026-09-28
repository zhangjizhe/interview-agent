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
