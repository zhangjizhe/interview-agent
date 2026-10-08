ALTER TABLE "runs"
  ADD COLUMN "parentRunId" TEXT,
  ADD COLUMN "budget" JSONB,
  ADD COLUMN "cancelRequestedAt" TIMESTAMP(3);

CREATE INDEX "runs_parentRunId_createdAt_idx" ON "runs"("parentRunId", "createdAt");

ALTER TABLE "runs" ADD CONSTRAINT "runs_parentRunId_fkey"
  FOREIGN KEY ("parentRunId") REFERENCES "runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
