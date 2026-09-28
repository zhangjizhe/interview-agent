DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TaskType') THEN
    CREATE TYPE "TaskType" AS ENUM ('QUESTION', 'FOLLOW_UP', 'SUMMARY', 'EVALUATION');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TaskStatus') THEN
    CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED');
  END IF;
END $$;

ALTER TABLE "interviews"
  ADD COLUMN IF NOT EXISTS "resumeConfirmed" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "interview_tasks" (
  "id" TEXT NOT NULL,
  "interviewId" TEXT NOT NULL,
  "type" "TaskType" NOT NULL,
  "question" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "difficulty" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "context" JSONB,
  "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "interview_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "answer_histories" (
  "id" TEXT NOT NULL,
  "interviewId" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "completeness" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "correctness" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "depth" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "feedback" TEXT,
  "llmEvaluated" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "answer_histories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "reflection_logs" (
  "id" TEXT NOT NULL,
  "interviewId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "finalResponse" TEXT NOT NULL,
  "reviewScore" DOUBLE PRECISION NOT NULL,
  "reviewIssues" TEXT[],
  "issueTags" TEXT[],
  "reflection" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "hitlPending" BOOLEAN NOT NULL DEFAULT false,
  "modelName" TEXT NOT NULL,
  "nodeName" TEXT NOT NULL DEFAULT 'reviewer',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reflection_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "interview_tasks_interviewId_status_priority_idx"
  ON "interview_tasks"("interviewId", "status", "priority");
CREATE INDEX IF NOT EXISTS "answer_histories_interviewId_idx"
  ON "answer_histories"("interviewId");
CREATE INDEX IF NOT EXISTS "reflection_logs_interviewId_idx"
  ON "reflection_logs"("interviewId");
CREATE INDEX IF NOT EXISTS "reflection_logs_userId_idx"
  ON "reflection_logs"("userId");
CREATE INDEX IF NOT EXISTS "reflection_logs_createdAt_idx"
  ON "reflection_logs"("createdAt");
CREATE INDEX IF NOT EXISTS "reflection_logs_reviewScore_idx"
  ON "reflection_logs"("reviewScore");
CREATE INDEX IF NOT EXISTS "reflection_logs_issueTags_idx"
  ON "reflection_logs" USING GIN ("issueTags");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interview_tasks_interviewId_fkey') THEN
    ALTER TABLE "interview_tasks"
      ADD CONSTRAINT "interview_tasks_interviewId_fkey"
      FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'answer_histories_interviewId_fkey') THEN
    ALTER TABLE "answer_histories"
      ADD CONSTRAINT "answer_histories_interviewId_fkey"
      FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reflection_logs_interviewId_fkey') THEN
    ALTER TABLE "reflection_logs"
      ADD CONSTRAINT "reflection_logs_interviewId_fkey"
      FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reflection_logs_userId_fkey') THEN
    ALTER TABLE "reflection_logs"
      ADD CONSTRAINT "reflection_logs_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
