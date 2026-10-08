CREATE TYPE "UsageLedgerType" AS ENUM ('INTERVIEW_START');

CREATE TABLE "usage_ledger" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "interviewId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "type" "UsageLedgerType" NOT NULL,
  "units" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "usage_ledger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "usage_ledger_interviewId_type_key" ON "usage_ledger"("interviewId", "type");
CREATE INDEX "usage_ledger_userId_periodStart_type_idx" ON "usage_ledger"("userId", "periodStart", "type");
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
