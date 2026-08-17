CREATE TYPE "InterviewMode" AS ENUM ('FULL_SIMULATION', 'SKILL_PRACTICE');

ALTER TABLE "interviews"
  ADD COLUMN "mode" "InterviewMode" NOT NULL DEFAULT 'FULL_SIMULATION',
  ADD COLUMN "targetJobProfileVersion" INTEGER,
  ADD COLUMN "practiceSkillId" TEXT;

ALTER TABLE "messages"
  ADD COLUMN "clientMessageId" TEXT,
  ADD COLUMN "replyToMessageId" TEXT;

ALTER TABLE "interview_questions"
  ADD COLUMN "subSkill" TEXT,
  ADD COLUMN "followUpPurpose" TEXT,
  ADD COLUMN "selectionMetadata" JSONB;

CREATE UNIQUE INDEX "messages_clientMessageId_key" ON "messages"("clientMessageId");
CREATE UNIQUE INDEX "messages_replyToMessageId_key" ON "messages"("replyToMessageId");
CREATE INDEX "messages_interviewId_clientMessageId_idx"
  ON "messages"("interviewId", "clientMessageId");
CREATE INDEX "interviews_practiceSkillId_idx" ON "interviews"("practiceSkillId");

ALTER TABLE "interviews"
  ADD CONSTRAINT "interviews_practiceSkillId_fkey"
  FOREIGN KEY ("practiceSkillId") REFERENCES "skill_definitions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_replyToMessageId_fkey"
  FOREIGN KEY ("replyToMessageId") REFERENCES "messages"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
