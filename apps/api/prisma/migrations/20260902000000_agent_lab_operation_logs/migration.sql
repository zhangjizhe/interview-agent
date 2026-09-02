CREATE TYPE "LabOperationAction" AS ENUM (
  'RECORDED_IMPORT_SUBMIT',
  'RECORDED_IMPORT_EXECUTE',
  'EXPERIMENT_CREATE',
  'RELEASE_DECISION_RECORD',
  'RETENTION_EXECUTE'
);

CREATE TYPE "LabOperationObject" AS ENUM (
  'RECORDED_IMPORT',
  'EXPERIMENT',
  'RELEASE_DECISION',
  'RETENTION_POLICY'
);

CREATE TYPE "LabOperationOutcome" AS ENUM ('SUCCEEDED', 'REJECTED');

CREATE TABLE "lab_operation_logs" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" "LabOperationAction" NOT NULL,
  "objectType" "LabOperationObject" NOT NULL,
  "objectId" TEXT NOT NULL,
  "outcome" "LabOperationOutcome" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lab_operation_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lab_operation_logs_actorId_createdAt_idx"
  ON "lab_operation_logs"("actorId", "createdAt");
CREATE INDEX "lab_operation_logs_action_createdAt_idx"
  ON "lab_operation_logs"("action", "createdAt");
CREATE INDEX "lab_operation_logs_objectType_objectId_idx"
  ON "lab_operation_logs"("objectType", "objectId");
CREATE INDEX "lab_operation_logs_outcome_createdAt_idx"
  ON "lab_operation_logs"("outcome", "createdAt");
