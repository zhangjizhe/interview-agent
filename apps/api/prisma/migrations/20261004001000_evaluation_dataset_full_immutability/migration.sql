DROP TRIGGER IF EXISTS "evaluation_dataset_cases_reject_frozen_write"
  ON "evaluation_dataset_cases";

CREATE OR REPLACE FUNCTION reject_frozen_evaluation_dataset_case_write()
RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND EXISTS (
    SELECT 1 FROM "evaluation_datasets"
    WHERE "id" = OLD."datasetId" AND "frozenAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'evaluation dataset is frozen' USING ERRCODE = '23514';
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND EXISTS (
    SELECT 1 FROM "evaluation_datasets"
    WHERE "id" = NEW."datasetId" AND "frozenAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'evaluation dataset is frozen' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "evaluation_dataset_cases_reject_frozen_write"
BEFORE INSERT OR UPDATE OR DELETE ON "evaluation_dataset_cases"
FOR EACH ROW EXECUTE FUNCTION reject_frozen_evaluation_dataset_case_write();

-- Rollback (manual): restore the insert/update-only trigger from the preceding migration.
