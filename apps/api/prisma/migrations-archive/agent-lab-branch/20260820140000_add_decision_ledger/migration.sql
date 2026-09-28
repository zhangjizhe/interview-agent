DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DecisionDomain') THEN
    CREATE TYPE "DecisionDomain" AS ENUM ('INTERVIEW', 'AGENT_LAB');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "decision_records" (
  "id" TEXT NOT NULL,
  "domain" "DecisionDomain" NOT NULL,
  "decisionType" TEXT NOT NULL,
  "subjectType" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "outcome" JSONB NOT NULL,
  "ruleSetVersion" TEXT NOT NULL,
  "inputSnapshot" JSONB NOT NULL,
  "inputHash" TEXT NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorId" TEXT,
  "interviewId" TEXT,
  "agentId" TEXT,
  "agentVersionId" TEXT,
  CONSTRAINT "decision_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "fact_assertions" (
  "id" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "subjectType" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "predicate" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "polarity" BOOLEAN NOT NULL DEFAULT true,
  "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validTo" TIMESTAMP(3),
  "sourceType" TEXT,
  "sourceId" TEXT,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fact_assertions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "decision_evidence" (
  "id" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT,
  "payload" JSONB,
  "contentHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "decision_evidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "decision_records_domain_subjectType_subjectId_recordedAt_idx"
  ON "decision_records"("domain", "subjectType", "subjectId", "recordedAt");
CREATE INDEX IF NOT EXISTS "decision_records_interviewId_recordedAt_idx"
  ON "decision_records"("interviewId", "recordedAt");
CREATE INDEX IF NOT EXISTS "decision_records_agentVersionId_recordedAt_idx"
  ON "decision_records"("agentVersionId", "recordedAt");
CREATE INDEX IF NOT EXISTS "fact_assertions_decisionId_idx"
  ON "fact_assertions"("decisionId");
CREATE INDEX IF NOT EXISTS "fact_assertions_subjectType_subjectId_predicate_validFrom_idx"
  ON "fact_assertions"("subjectType", "subjectId", "predicate", "validFrom");
CREATE INDEX IF NOT EXISTS "decision_evidence_decisionId_createdAt_idx"
  ON "decision_evidence"("decisionId", "createdAt");
CREATE INDEX IF NOT EXISTS "decision_evidence_sourceType_sourceId_idx"
  ON "decision_evidence"("sourceType", "sourceId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decision_records_interviewId_fkey') THEN
    ALTER TABLE "decision_records"
      ADD CONSTRAINT "decision_records_interviewId_fkey"
      FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decision_records_agentId_fkey') THEN
    ALTER TABLE "decision_records"
      ADD CONSTRAINT "decision_records_agentId_fkey"
      FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decision_records_agentVersionId_fkey') THEN
    ALTER TABLE "decision_records"
      ADD CONSTRAINT "decision_records_agentVersionId_fkey"
      FOREIGN KEY ("agentVersionId") REFERENCES "agent_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fact_assertions_decisionId_fkey') THEN
    ALTER TABLE "fact_assertions"
      ADD CONSTRAINT "fact_assertions_decisionId_fkey"
      FOREIGN KEY ("decisionId") REFERENCES "decision_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decision_evidence_decisionId_fkey') THEN
    ALTER TABLE "decision_evidence"
      ADD CONSTRAINT "decision_evidence_decisionId_fkey"
      FOREIGN KEY ("decisionId") REFERENCES "decision_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
