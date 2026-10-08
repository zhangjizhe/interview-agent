-- 非破坏性扩展：套餐字段化，放宽账本 interviewId 以保留删除后的用量。
ALTER TYPE "UsageLedgerType" ADD VALUE 'LLM_CALL';
BEGIN;
CREATE TABLE "plans" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "monthlyInterviews" INTEGER NOT NULL CHECK ("monthlyInterviews" >= 0),
  "monthlyLlmCalls" INTEGER NOT NULL CHECK ("monthlyLlmCalls" >= 0),
  "maxInputBytes" INTEGER NOT NULL CHECK ("maxInputBytes" BETWEEN 1024 AND 1048576),
  "maxOutputTokens" INTEGER NOT NULL CHECK ("maxOutputTokens" BETWEEN 1 AND 32768)
);
-- 初始运营配置，不在业务逻辑中判断套餐名称；上线前按成本数据调整。
INSERT INTO "plans" VALUES ('free', 'Free', 3, 100, 65536, 4096), ('pro', 'Pro', 20, 1000, 131072, 8192);
ALTER TABLE "organizations" ADD COLUMN "planId" TEXT NOT NULL DEFAULT 'free', ADD COLUMN "quotaRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans" ("id") ON DELETE RESTRICT;
ALTER TABLE "usage_ledger" ALTER COLUMN "interviewId" DROP NOT NULL;
ALTER TABLE "usage_ledger" DROP CONSTRAINT "usage_ledger_interviewId_fkey";
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
COMMIT;
-- 回滚：先停写并备份；已产生无 interviewId 的调用账本后禁止回退 NOT NULL，须恢复快照。
-- 仅空测试库：DELETE FROM usage_ledger WHERE "interviewId" IS NULL;
-- ALTER TABLE usage_ledger ALTER COLUMN "interviewId" SET NOT NULL;
-- ALTER TABLE usage_ledger DROP CONSTRAINT "usage_ledger_interviewId_fkey";
-- ALTER TABLE usage_ledger ADD CONSTRAINT "usage_ledger_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES interviews(id) ON DELETE CASCADE ON UPDATE CASCADE;
-- ALTER TABLE organizations DROP COLUMN "planId", DROP COLUMN "quotaRevision";
-- DROP TABLE plans;
-- LLM_CALL 枚举值保留兼容，不重建历史类型。
