CREATE TYPE "TrainingRecommendationStatus" AS ENUM ('READY', 'COMPLETED', 'RETEST_STARTED');
CREATE TYPE "TrainingAttemptStatus" AS ENUM ('COMPLETED');

CREATE TABLE "training_recommendations" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "targetJobId" TEXT NOT NULL,
  "targetJobProfileVersion" INTEGER NOT NULL,
  "skillId" TEXT NOT NULL,
  "sourceRunId" TEXT NOT NULL,
  "sourceEvidenceId" TEXT NOT NULL,
  "evidenceIds" JSONB NOT NULL,
  "objective" TEXT NOT NULL,
  "prompts" JSONB NOT NULL,
  "expectedEvidence" JSONB NOT NULL,
  "status" "TrainingRecommendationStatus" NOT NULL DEFAULT 'READY',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "training_recommendations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "training_attempts" (
  "id" TEXT NOT NULL,
  "recommendationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "TrainingAttemptStatus" NOT NULL DEFAULT 'COMPLETED',
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retestInterviewId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "training_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "training_recommendations_userId_targetJobId_skillId_sourceRunId_key"
  ON "training_recommendations"("userId", "targetJobId", "skillId", "sourceRunId");
CREATE INDEX "training_recommendations_userId_targetJobId_status_idx"
  ON "training_recommendations"("userId", "targetJobId", "status");
CREATE UNIQUE INDEX "training_attempts_retestInterviewId_key" ON "training_attempts"("retestInterviewId");
CREATE INDEX "training_attempts_userId_completedAt_idx" ON "training_attempts"("userId", "completedAt");
ALTER TABLE "training_recommendations" ADD CONSTRAINT "training_recommendations_targetJobId_fkey" FOREIGN KEY ("targetJobId") REFERENCES "target_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_recommendations" ADD CONSTRAINT "training_recommendations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_recommendations" ADD CONSTRAINT "training_recommendations_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "training_recommendations" ADD CONSTRAINT "training_recommendations_sourceRunId_fkey" FOREIGN KEY ("sourceRunId") REFERENCES "evaluation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "training_recommendations" ADD CONSTRAINT "training_recommendations_sourceEvidenceId_fkey" FOREIGN KEY ("sourceEvidenceId") REFERENCES "assessment_evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "training_attempts" ADD CONSTRAINT "training_attempts_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "training_recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_attempts" ADD CONSTRAINT "training_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_attempts" ADD CONSTRAINT "training_attempts_retestInterviewId_fkey" FOREIGN KEY ("retestInterviewId") REFERENCES "interviews"("id") ON DELETE SET NULL ON UPDATE CASCADE;
