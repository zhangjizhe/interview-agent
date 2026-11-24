-- CreateEnum
CREATE TYPE "FeedbackRating" AS ENUM ('UP', 'DOWN');

-- CreateTable
CREATE TABLE "run_feedbacks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'default-organization',
    "runId" TEXT NOT NULL,
    "rating" "FeedbackRating" NOT NULL,
    "category" TEXT,
    "comment" TEXT,
    "sourceApp" TEXT,
    "submittedByUserId" TEXT,
    "promotedCaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "run_feedbacks_id_organizationId_key" ON "run_feedbacks"("id", "organizationId");

-- CreateIndex
CREATE INDEX "run_feedbacks_organizationId_rating_createdAt_idx" ON "run_feedbacks"("organizationId", "rating", "createdAt");

-- CreateIndex
CREATE INDEX "run_feedbacks_runId_createdAt_idx" ON "run_feedbacks"("runId", "createdAt");

-- AddForeignKey
ALTER TABLE "run_feedbacks" ADD CONSTRAINT "run_feedbacks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_feedbacks" ADD CONSTRAINT "run_feedbacks_runId_organizationId_fkey" FOREIGN KEY ("runId", "organizationId") REFERENCES "runs"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
