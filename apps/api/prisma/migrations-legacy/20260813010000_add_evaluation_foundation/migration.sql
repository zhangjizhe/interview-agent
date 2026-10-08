-- P0-1: 可追溯的题目、回答、评估证据与技能状态基础。

-- 历史基线兼容：这些表已在 Prisma Schema 中使用，但早期 migration 链未包含其建表语句。
-- 新环境通过 migrate deploy 时先补齐；已有环境使用 IF NOT EXISTS，不修改既有数据。
DO $$ BEGIN
    CREATE TYPE "TaskType" AS ENUM ('QUESTION', 'FOLLOW_UP', 'SUMMARY', 'EVALUATION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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

CREATE INDEX IF NOT EXISTS "interview_tasks_interviewId_status_priority_idx" ON "interview_tasks"("interviewId", "status", "priority");
CREATE INDEX IF NOT EXISTS "answer_histories_interviewId_idx" ON "answer_histories"("interviewId");

DO $$ BEGIN
    ALTER TABLE "interview_tasks" ADD CONSTRAINT "interview_tasks_interviewId_fkey"
    FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "answer_histories" ADD CONSTRAINT "answer_histories_interviewId_fkey"
    FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TYPE "EvaluationMode" AS ENUM ('FINAL', 'PRACTICE', 'PREVIEW');
CREATE TYPE "EvaluationRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEGRADED', 'SUPERSEDED');

CREATE TABLE "target_jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "level" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "company" TEXT,
    "jobDescription" TEXT,
    "jobDescriptionHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "target_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "skill_definitions" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "taxonomyVersion" TEXT NOT NULL,
    "applicableRoles" TEXT[] NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "skill_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "job_skill_requirements" (
    "id" TEXT NOT NULL,
    "targetJobId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 3,
    "expectedLevel" TEXT,
    "source" TEXT NOT NULL,
    "matchedTerms" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "job_skill_requirements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "interview_questions" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "sourceTaskId" TEXT,
    "parentQuestionId" TEXT,
    "skillId" TEXT,
    "externalQuestionId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "question" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "expectedEvidence" JSONB,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "interview_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "interview_answers" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "interview_answers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evaluation_definitions" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "definitionHash" TEXT NOT NULL,
    "evaluatorVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "rubricVersion" TEXT NOT NULL,
    "modelProvider" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "modelParameters" JSONB,
    "evaluationMode" "EvaluationMode" NOT NULL,
    "fallbackPolicyVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "evaluation_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evaluation_runs" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "inputRevision" TEXT NOT NULL,
    "mode" "EvaluationMode" NOT NULL,
    "status" "EvaluationRunStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "reportPayload" JSONB,
    "error" TEXT,
    "degradedReason" TEXT,
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "evaluation_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assessment_evidence" (
    "id" TEXT NOT NULL,
    "evaluationRunId" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "skillId" TEXT,
    "answerExcerpt" TEXT NOT NULL,
    "expectedEvidence" JSONB,
    "observedEvidence" JSONB,
    "dimensions" JSONB,
    "score" DOUBLE PRECISION,
    "reason" TEXT,
    "missingEvidence" JSONB,
    "recommendation" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assessment_evidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "candidate_skill_states" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetJobId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "trend" DOUBLE PRECISION,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "lastAssessedAt" TIMESTAMP(3) NOT NULL,
    "sourceRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "candidate_skill_states_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "reports" ADD COLUMN "currentEvaluationRunId" TEXT;
ALTER TABLE "answer_histories" ADD COLUMN "questionId" TEXT;
ALTER TABLE "answer_histories" ADD COLUMN "answerId" TEXT;
ALTER TABLE "interviews" ADD COLUMN "targetJobId" TEXT;

CREATE UNIQUE INDEX "reports_currentEvaluationRunId_key" ON "reports"("currentEvaluationRunId");
CREATE INDEX "target_jobs_userId_updatedAt_idx" ON "target_jobs"("userId", "updatedAt");
CREATE INDEX "target_jobs_userId_isActive_idx" ON "target_jobs"("userId", "isActive");
CREATE UNIQUE INDEX "target_jobs_one_active_per_user_key" ON "target_jobs"("userId") WHERE "isActive";
CREATE UNIQUE INDEX "skill_definitions_slug_taxonomyVersion_key" ON "skill_definitions"("slug", "taxonomyVersion");
CREATE INDEX "skill_definitions_taxonomyVersion_isActive_idx" ON "skill_definitions"("taxonomyVersion", "isActive");
CREATE UNIQUE INDEX "job_skill_requirements_targetJobId_skillId_key" ON "job_skill_requirements"("targetJobId", "skillId");
CREATE INDEX "job_skill_requirements_targetJobId_importance_idx" ON "job_skill_requirements"("targetJobId", "importance");
CREATE UNIQUE INDEX "interview_questions_sourceTaskId_key" ON "interview_questions"("sourceTaskId");
CREATE INDEX "interview_questions_interviewId_createdAt_idx" ON "interview_questions"("interviewId", "createdAt");
CREATE INDEX "interview_questions_skillId_idx" ON "interview_questions"("skillId");
CREATE INDEX "interview_questions_parentQuestionId_idx" ON "interview_questions"("parentQuestionId");
CREATE UNIQUE INDEX "interview_answers_messageId_key" ON "interview_answers"("messageId");
CREATE INDEX "interview_answers_interviewId_createdAt_idx" ON "interview_answers"("interviewId", "createdAt");
CREATE INDEX "interview_answers_questionId_idx" ON "interview_answers"("questionId");
CREATE UNIQUE INDEX "evaluation_definitions_version_key" ON "evaluation_definitions"("version");
CREATE UNIQUE INDEX "evaluation_definitions_definitionHash_key" ON "evaluation_definitions"("definitionHash");
CREATE INDEX "evaluation_definitions_evaluationMode_createdAt_idx" ON "evaluation_definitions"("evaluationMode", "createdAt");
CREATE UNIQUE INDEX "evaluation_runs_idempotencyKey_key" ON "evaluation_runs"("idempotencyKey");
CREATE UNIQUE INDEX "evaluation_runs_interviewId_inputRevision_definitionId_mode_key" ON "evaluation_runs"("interviewId", "inputRevision", "definitionId", "mode");
CREATE INDEX "evaluation_runs_interviewId_createdAt_idx" ON "evaluation_runs"("interviewId", "createdAt");
CREATE INDEX "evaluation_runs_status_createdAt_idx" ON "evaluation_runs"("status", "createdAt");
CREATE UNIQUE INDEX "assessment_evidence_evaluationRunId_answerId_key" ON "assessment_evidence"("evaluationRunId", "answerId");
CREATE INDEX "assessment_evidence_interviewId_createdAt_idx" ON "assessment_evidence"("interviewId", "createdAt");
CREATE INDEX "assessment_evidence_skillId_createdAt_idx" ON "assessment_evidence"("skillId", "createdAt");
CREATE UNIQUE INDEX "candidate_skill_states_userId_targetJobId_skillId_key" ON "candidate_skill_states"("userId", "targetJobId", "skillId");
CREATE INDEX "candidate_skill_states_userId_lastAssessedAt_idx" ON "candidate_skill_states"("userId", "lastAssessedAt");
CREATE INDEX "candidate_skill_states_sourceRunId_idx" ON "candidate_skill_states"("sourceRunId");
CREATE INDEX "answer_histories_questionId_idx" ON "answer_histories"("questionId");
CREATE UNIQUE INDEX "answer_histories_answerId_key" ON "answer_histories"("answerId");
CREATE INDEX "interviews_targetJobId_startedAt_idx" ON "interviews"("targetJobId", "startedAt");

ALTER TABLE "target_jobs" ADD CONSTRAINT "target_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_targetJobId_fkey" FOREIGN KEY ("targetJobId") REFERENCES "target_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "skill_definitions" ADD CONSTRAINT "skill_definitions_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "skill_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "job_skill_requirements" ADD CONSTRAINT "job_skill_requirements_targetJobId_fkey" FOREIGN KEY ("targetJobId") REFERENCES "target_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_skill_requirements" ADD CONSTRAINT "job_skill_requirements_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_sourceTaskId_fkey" FOREIGN KEY ("sourceTaskId") REFERENCES "interview_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_parentQuestionId_fkey" FOREIGN KEY ("parentQuestionId") REFERENCES "interview_questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "interview_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "evaluation_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "evaluation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assessment_evidence" ADD CONSTRAINT "assessment_evidence_evaluationRunId_fkey" FOREIGN KEY ("evaluationRunId") REFERENCES "evaluation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_evidence" ADD CONSTRAINT "assessment_evidence_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_evidence" ADD CONSTRAINT "assessment_evidence_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "interview_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_evidence" ADD CONSTRAINT "assessment_evidence_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "interview_answers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_evidence" ADD CONSTRAINT "assessment_evidence_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "candidate_skill_states" ADD CONSTRAINT "candidate_skill_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "candidate_skill_states" ADD CONSTRAINT "candidate_skill_states_targetJobId_fkey" FOREIGN KEY ("targetJobId") REFERENCES "target_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "candidate_skill_states" ADD CONSTRAINT "candidate_skill_states_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "candidate_skill_states" ADD CONSTRAINT "candidate_skill_states_sourceRunId_fkey" FOREIGN KEY ("sourceRunId") REFERENCES "evaluation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_currentEvaluationRunId_fkey" FOREIGN KEY ("currentEvaluationRunId") REFERENCES "evaluation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "answer_histories" ADD CONSTRAINT "answer_histories_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "interview_questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "answer_histories" ADD CONSTRAINT "answer_histories_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "interview_answers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
