ALTER TYPE "EvaluationStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TABLE "agent_evaluation_runs" ADD COLUMN "cancelRequestedAt" TIMESTAMP(3);
