-- CreateEnum
CREATE TYPE "EvaluationMode" AS ENUM ('FINAL', 'PRACTICE', 'PREVIEW');

-- CreateEnum
CREATE TYPE "EvaluationRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEGRADED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('QUESTION', 'FOLLOW_UP', 'SUMMARY', 'EVALUATION');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateTable
CREATE TABLE "answer_histories" (
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
    "answerId" TEXT,
    "questionId" TEXT,

    CONSTRAINT "answer_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "checkpoint_blobs" (
    "thread_id" TEXT NOT NULL,
    "checkpoint_ns" TEXT NOT NULL DEFAULT '',
    "channel" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "blob" BYTEA,

    CONSTRAINT "checkpoint_blobs_pkey" PRIMARY KEY ("thread_id","checkpoint_ns","channel","version")
);

-- CreateTable
CREATE TABLE "checkpoint_migrations" (
    "v" INTEGER NOT NULL,

    CONSTRAINT "checkpoint_migrations_pkey" PRIMARY KEY ("v")
);

-- CreateTable
CREATE TABLE "checkpoint_writes" (
    "thread_id" TEXT NOT NULL,
    "checkpoint_ns" TEXT NOT NULL DEFAULT '',
    "checkpoint_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "type" TEXT,
    "blob" BYTEA NOT NULL,

    CONSTRAINT "checkpoint_writes_pkey" PRIMARY KEY ("thread_id","checkpoint_ns","checkpoint_id","task_id","idx")
);

-- CreateTable
CREATE TABLE "checkpoints" (
    "thread_id" TEXT NOT NULL,
    "checkpoint_ns" TEXT NOT NULL DEFAULT '',
    "checkpoint_id" TEXT NOT NULL,
    "parent_checkpoint_id" TEXT,
    "type" TEXT,
    "checkpoint" JSONB NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "checkpoints_pkey" PRIMARY KEY ("thread_id","checkpoint_ns","checkpoint_id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "interview_tasks" (
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

-- CreateTable
CREATE TABLE "interviews" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'P5',
    "status" "InterviewStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "summary" TEXT,
    "resumeConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "targetJobId" TEXT,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reflection_logs" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "finalResponse" TEXT NOT NULL,
    "reviewScore" DOUBLE PRECISION NOT NULL,
    "reviewIssues" TEXT[] NOT NULL,
    "issueTags" TEXT[] NOT NULL,
    "reflection" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "hitlPending" BOOLEAN NOT NULL DEFAULT false,
    "modelName" TEXT NOT NULL,
    "nodeName" TEXT NOT NULL DEFAULT 'reviewer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reflection_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "scores" JSONB NOT NULL,
    "strengths" TEXT NOT NULL,
    "weaknesses" TEXT NOT NULL,
    "suggestions" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentEvaluationRunId" TEXT,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_costs" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "llmCalls" INTEGER NOT NULL DEFAULT 0,
    "totalPromptTokens" INTEGER NOT NULL DEFAULT 0,
    "totalCompletionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "promptCacheHits" INTEGER NOT NULL DEFAULT 0,
    "promptCacheMisses" INTEGER NOT NULL DEFAULT 0,
    "cachedTokens" INTEGER NOT NULL DEFAULT 0,
    "semanticCacheHits" INTEGER NOT NULL DEFAULT 0,
    "semanticCacheMisses" INTEGER NOT NULL DEFAULT 0,
    "cacheSavedTokens" INTEGER NOT NULL DEFAULT 0,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "fallbacks" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "inputCostPer1k" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outputCostPer1k" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cacheDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "estimatedCostCny" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "session_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_definitions" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "taxonomyVersion" TEXT NOT NULL,
    "applicableRoles" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "user_tool_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_tool_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "answer_histories_answerId_idx" ON "answer_histories"("answerId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "answer_histories_answerId_key" ON "answer_histories"("answerId" ASC);

-- CreateIndex
CREATE INDEX "answer_histories_interviewId_idx" ON "answer_histories"("interviewId" ASC);

-- CreateIndex
CREATE INDEX "answer_histories_questionId_idx" ON "answer_histories"("questionId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "assessment_evidence_evaluationRunId_answerId_key" ON "assessment_evidence"("evaluationRunId" ASC, "answerId" ASC);

-- CreateIndex
CREATE INDEX "assessment_evidence_interviewId_createdAt_idx" ON "assessment_evidence"("interviewId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "assessment_evidence_skillId_createdAt_idx" ON "assessment_evidence"("skillId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "candidate_skill_states_sourceRunId_idx" ON "candidate_skill_states"("sourceRunId" ASC);

-- CreateIndex
CREATE INDEX "candidate_skill_states_userId_lastAssessedAt_idx" ON "candidate_skill_states"("userId" ASC, "lastAssessedAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "candidate_skill_states_userId_targetJobId_skillId_key" ON "candidate_skill_states"("userId" ASC, "targetJobId" ASC, "skillId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_definitions_definitionHash_key" ON "evaluation_definitions"("definitionHash" ASC);

-- CreateIndex
CREATE INDEX "evaluation_definitions_evaluationMode_createdAt_idx" ON "evaluation_definitions"("evaluationMode" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_definitions_version_key" ON "evaluation_definitions"("version" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_runs_idempotencyKey_key" ON "evaluation_runs"("idempotencyKey" ASC);

-- CreateIndex
CREATE INDEX "evaluation_runs_interviewId_createdAt_idx" ON "evaluation_runs"("interviewId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_runs_interviewId_inputRevision_definitionId_mode_key" ON "evaluation_runs"("interviewId" ASC, "inputRevision" ASC, "definitionId" ASC, "mode" ASC);

-- CreateIndex
CREATE INDEX "evaluation_runs_status_createdAt_idx" ON "evaluation_runs"("status" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "interview_answers_interviewId_createdAt_idx" ON "interview_answers"("interviewId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "interview_answers_messageId_key" ON "interview_answers"("messageId" ASC);

-- CreateIndex
CREATE INDEX "interview_answers_questionId_idx" ON "interview_answers"("questionId" ASC);

-- CreateIndex
CREATE INDEX "interview_questions_interviewId_createdAt_idx" ON "interview_questions"("interviewId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "interview_questions_parentQuestionId_idx" ON "interview_questions"("parentQuestionId" ASC);

-- CreateIndex
CREATE INDEX "interview_questions_skillId_idx" ON "interview_questions"("skillId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "interview_questions_sourceTaskId_key" ON "interview_questions"("sourceTaskId" ASC);

-- CreateIndex
CREATE INDEX "interview_tasks_interviewId_status_priority_idx" ON "interview_tasks"("interviewId" ASC, "status" ASC, "priority" ASC);

-- CreateIndex
CREATE INDEX "interviews_userId_startedAt_idx" ON "interviews"("userId" ASC, "startedAt" ASC);

-- CreateIndex
CREATE INDEX "job_skill_requirements_targetJobId_importance_idx" ON "job_skill_requirements"("targetJobId" ASC, "importance" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "job_skill_requirements_targetJobId_skillId_key" ON "job_skill_requirements"("targetJobId" ASC, "skillId" ASC);

-- CreateIndex
CREATE INDEX "messages_interviewId_createdAt_idx" ON "messages"("interviewId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "reflection_logs_createdAt_idx" ON "reflection_logs"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "reflection_logs_interviewId_idx" ON "reflection_logs"("interviewId" ASC);

-- CreateIndex
CREATE INDEX "reflection_logs_issueTags_idx" ON "reflection_logs" USING GIN ("issueTags");

-- CreateIndex
CREATE INDEX "reflection_logs_reviewScore_idx" ON "reflection_logs"("reviewScore" ASC);

-- CreateIndex
CREATE INDEX "reflection_logs_userId_idx" ON "reflection_logs"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "reports_currentEvaluationRunId_key" ON "reports"("currentEvaluationRunId" ASC);

-- CreateIndex
CREATE INDEX "session_costs_interviewId_idx" ON "session_costs"("interviewId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "skill_definitions_slug_taxonomyVersion_key" ON "skill_definitions"("slug" ASC, "taxonomyVersion" ASC);

-- CreateIndex
CREATE INDEX "skill_definitions_taxonomyVersion_isActive_idx" ON "skill_definitions"("taxonomyVersion" ASC, "isActive" ASC);

-- CreateIndex
CREATE INDEX "target_jobs_userId_isActive_idx" ON "target_jobs"("userId" ASC, "isActive" ASC);

-- CreateIndex
CREATE INDEX "target_jobs_userId_updatedAt_idx" ON "target_jobs"("userId" ASC, "updatedAt" ASC);

-- CreateIndex
CREATE INDEX "user_tool_preferences_userId_idx" ON "user_tool_preferences"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "user_tool_preferences_userId_toolName_key" ON "user_tool_preferences"("userId" ASC, "toolName" ASC);

-- Historical application constraints are not represented by the Prisma
-- datamodel, but are part of the verified production baseline.
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_length_check" CHECK (length(email) <= 100),
  ADD CONSTRAINT "users_id_format_check" CHECK (id ~ '^[a-z0-9][a-z0-9_-]{2,31}$');

ALTER TABLE "reports"
  ADD CONSTRAINT "reports_interviewId_key" UNIQUE ("interviewId");

ALTER TABLE "session_costs"
  ADD CONSTRAINT "session_costs_interviewId_key" UNIQUE ("interviewId");

ALTER TABLE "users"
  ADD CONSTRAINT "users_email_key" UNIQUE (email);

-- AddForeignKey
ALTER TABLE "answer_histories" ADD CONSTRAINT "answer_histories_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "interview_answers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_histories" ADD CONSTRAINT "answer_histories_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_histories" ADD CONSTRAINT "answer_histories_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "interview_questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_evidence" ADD CONSTRAINT "assessment_evidence_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "interview_answers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_evidence" ADD CONSTRAINT "assessment_evidence_evaluationRunId_fkey" FOREIGN KEY ("evaluationRunId") REFERENCES "evaluation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_evidence" ADD CONSTRAINT "assessment_evidence_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_evidence" ADD CONSTRAINT "assessment_evidence_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "interview_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_evidence" ADD CONSTRAINT "assessment_evidence_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_skill_states" ADD CONSTRAINT "candidate_skill_states_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_skill_states" ADD CONSTRAINT "candidate_skill_states_sourceRunId_fkey" FOREIGN KEY ("sourceRunId") REFERENCES "evaluation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_skill_states" ADD CONSTRAINT "candidate_skill_states_targetJobId_fkey" FOREIGN KEY ("targetJobId") REFERENCES "target_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_skill_states" ADD CONSTRAINT "candidate_skill_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "evaluation_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "evaluation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "interview_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_parentQuestionId_fkey" FOREIGN KEY ("parentQuestionId") REFERENCES "interview_questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_sourceTaskId_fkey" FOREIGN KEY ("sourceTaskId") REFERENCES "interview_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_tasks" ADD CONSTRAINT "interview_tasks_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_targetJobId_fkey" FOREIGN KEY ("targetJobId") REFERENCES "target_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_skill_requirements" ADD CONSTRAINT "job_skill_requirements_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_skill_requirements" ADD CONSTRAINT "job_skill_requirements_targetJobId_fkey" FOREIGN KEY ("targetJobId") REFERENCES "target_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reflection_logs" ADD CONSTRAINT "reflection_logs_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reflection_logs" ADD CONSTRAINT "reflection_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_currentEvaluationRunId_fkey" FOREIGN KEY ("currentEvaluationRunId") REFERENCES "evaluation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_costs" ADD CONSTRAINT "session_costs_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_definitions" ADD CONSTRAINT "skill_definitions_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "skill_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_jobs" ADD CONSTRAINT "target_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
