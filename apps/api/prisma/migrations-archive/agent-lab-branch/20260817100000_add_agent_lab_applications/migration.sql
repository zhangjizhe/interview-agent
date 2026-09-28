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
