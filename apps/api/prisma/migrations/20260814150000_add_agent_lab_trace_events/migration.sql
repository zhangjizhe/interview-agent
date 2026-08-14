ALTER TABLE "runs" ADD COLUMN "traceSequence" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "trace_events"
  ADD COLUMN "formatVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "turnId" TEXT,
  ADD COLUMN "step" TEXT,
  ADD COLUMN "callId" TEXT,
  ADD COLUMN "modelVisible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "payload" JSONB;

CREATE INDEX "trace_events_runId_callId_idx" ON "trace_events"("runId", "callId");
