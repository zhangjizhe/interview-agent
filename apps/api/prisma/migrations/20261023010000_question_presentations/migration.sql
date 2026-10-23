-- CreateEnum
CREATE TYPE "QuestionPresentationState" AS ENUM ('OPEN', 'PROCESSING', 'UNKNOWN', 'ANSWERED');

-- CreateTable
CREATE TABLE "interview_question_presentations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "claimMessageId" TEXT,
    "claimToken" TEXT,
    "question" TEXT NOT NULL,
    "state" "QuestionPresentationState" NOT NULL DEFAULT 'OPEN',
    "claimedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_question_presentations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "interview_question_presentations_taskId_key" ON "interview_question_presentations"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "interview_question_presentations_messageId_key" ON "interview_question_presentations"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "interview_question_presentations_claimMessageId_key" ON "interview_question_presentations"("claimMessageId");

CREATE UNIQUE INDEX "interview_question_presentations_claimToken_key" ON "interview_question_presentations"("claimToken");

-- CreateIndex
CREATE INDEX "interview_question_presentations_organizationId_idx" ON "interview_question_presentations"("organizationId");

-- CreateIndex
CREATE INDEX "interview_question_presentations_interviewId_state_idx" ON "interview_question_presentations"("interviewId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "interview_question_presentations_taskId_interviewId_organiz_key" ON "interview_question_presentations"("taskId", "interviewId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "interview_question_presentations_messageId_interviewId_orga_key" ON "interview_question_presentations"("messageId", "interviewId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "interview_question_presentations_claimMessageId_interviewId_key" ON "interview_question_presentations"("claimMessageId", "interviewId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "messages_id_interviewId_organizationId_key" ON "messages"("id", "interviewId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "interview_tasks_id_interviewId_organizationId_key" ON "interview_tasks"("id", "interviewId", "organizationId");

-- AddForeignKey
ALTER TABLE "interview_question_presentations" ADD CONSTRAINT "interview_question_presentations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_question_presentations" ADD CONSTRAINT "interview_question_presentations_interviewId_organizationI_fkey" FOREIGN KEY ("interviewId", "organizationId") REFERENCES "interviews"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_question_presentations" ADD CONSTRAINT "interview_question_presentations_taskId_interviewId_organi_fkey" FOREIGN KEY ("taskId", "interviewId", "organizationId") REFERENCES "interview_tasks"("id", "interviewId", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_question_presentations" ADD CONSTRAINT "interview_question_presentations_messageId_interviewId_org_fkey" FOREIGN KEY ("messageId", "interviewId", "organizationId") REFERENCES "messages"("id", "interviewId", "organizationId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_question_presentations" ADD CONSTRAINT "interview_question_presentations_claimMessageId_interviewI_fkey" FOREIGN KEY ("claimMessageId", "interviewId", "organizationId") REFERENCES "messages"("id", "interviewId", "organizationId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Prisma cannot express a partial unique index or these state checks.
-- Keep at most one unresolved question per interview even for direct writers.
CREATE UNIQUE INDEX "question_presentation_one_unresolved_per_interview"
ON "interview_question_presentations" ("interviewId") WHERE "state" <> 'ANSWERED';

ALTER TABLE "interview_question_presentations" ADD CONSTRAINT "question_presentation_claim_state_check" CHECK (
  ("state" = 'OPEN' AND "claimMessageId" IS NULL AND "claimToken" IS NULL AND "claimedAt" IS NULL AND "resolvedAt" IS NULL)
  OR ("state" IN ('PROCESSING', 'UNKNOWN') AND "claimMessageId" IS NOT NULL AND "claimToken" IS NOT NULL AND "claimedAt" IS NOT NULL AND "resolvedAt" IS NULL)
  OR ("state" = 'ANSWERED' AND "claimMessageId" IS NOT NULL AND "claimToken" IS NOT NULL AND "claimedAt" IS NOT NULL AND "resolvedAt" IS NOT NULL)
);
