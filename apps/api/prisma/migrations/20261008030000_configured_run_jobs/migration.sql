ALTER TABLE "runs" ADD COLUMN "requestKey" TEXT, ADD COLUMN "requestHash" TEXT,
  ADD COLUMN "requestedByUserId" TEXT, ADD COLUMN "leaseOwner" TEXT, ADD COLUMN "heartbeatAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "runs_workspaceId_requestKey_key" ON "runs"("workspaceId", "requestKey");
CREATE INDEX "runs_status_heartbeatAt_idx" ON "runs"("status", "heartbeatAt");
CREATE UNIQUE INDEX "runs_one_active_configured_per_workspace" ON "runs"("workspaceId")
  WHERE "requestKey" IS NOT NULL AND "status" IN ('PENDING', 'RUNNING');
