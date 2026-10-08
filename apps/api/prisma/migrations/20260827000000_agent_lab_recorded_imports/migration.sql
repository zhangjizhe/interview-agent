CREATE TYPE "LabRecordedImportStatus" AS ENUM ('PENDING', 'IMPORTING', 'IMPORTED', 'FAILED');

CREATE TABLE "lab_recorded_imports" (
    "id" TEXT NOT NULL,
    "receiptHash" TEXT NOT NULL,
    "status" "LabRecordedImportStatus" NOT NULL DEFAULT 'PENDING',
    "recordedRun" JSONB NOT NULL,
    "submittedBy" TEXT NOT NULL,
    "importedBy" TEXT,
    "runId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedAt" TIMESTAMP(3),
    CONSTRAINT "lab_recorded_imports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lab_recorded_imports_receiptHash_key" ON "lab_recorded_imports"("receiptHash");
CREATE UNIQUE INDEX "lab_recorded_imports_runId_key" ON "lab_recorded_imports"("runId");
CREATE INDEX "lab_recorded_imports_status_createdAt_idx" ON "lab_recorded_imports"("status", "createdAt");

ALTER TABLE "lab_recorded_imports"
  ADD CONSTRAINT "lab_recorded_imports_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "lab_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
