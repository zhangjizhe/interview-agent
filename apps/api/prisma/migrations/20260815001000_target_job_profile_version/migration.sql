ALTER TABLE "target_jobs"
  ADD COLUMN "profileVersion" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS "target_jobs_userId_updatedAt_idx"
  ON "target_jobs"("userId", "updatedAt");

CREATE INDEX IF NOT EXISTS "target_jobs_userId_isActive_idx"
  ON "target_jobs"("userId", "isActive");

CREATE UNIQUE INDEX "target_jobs_one_active_per_user_key"
  ON "target_jobs"("userId")
  WHERE "isActive";
