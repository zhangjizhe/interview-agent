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
