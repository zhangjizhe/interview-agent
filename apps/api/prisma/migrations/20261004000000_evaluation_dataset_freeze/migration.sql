ALTER TABLE "evaluation_datasets"
  ADD COLUMN "frozenAt" TIMESTAMP(3),
  ADD COLUMN "contentHash" TEXT;

CREATE INDEX "evaluation_datasets_workspaceId_frozenAt_idx"
  ON "evaluation_datasets"("workspaceId", "frozenAt");

CREATE OR REPLACE FUNCTION reject_frozen_evaluation_dataset_case_write()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "evaluation_datasets"
    WHERE "id" = NEW."datasetId" AND "frozenAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'evaluation dataset is frozen' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "evaluation_dataset_cases_reject_frozen_write"
BEFORE INSERT OR UPDATE ON "evaluation_dataset_cases"
FOR EACH ROW EXECUTE FUNCTION reject_frozen_evaluation_dataset_case_write();

-- Rollback (manual):
-- DROP INDEX "evaluation_datasets_workspaceId_frozenAt_idx";
-- DROP TRIGGER "evaluation_dataset_cases_reject_frozen_write" ON "evaluation_dataset_cases";
-- DROP FUNCTION reject_frozen_evaluation_dataset_case_write();
-- ALTER TABLE "evaluation_datasets" DROP COLUMN "contentHash", DROP COLUMN "frozenAt";
