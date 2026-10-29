-- Additive deterministic business-contract evaluator. Existing evaluators remain executable.
ALTER TYPE "EvaluatorType" ADD VALUE IF NOT EXISTS 'BUSINESS_ASSERTIONS';
