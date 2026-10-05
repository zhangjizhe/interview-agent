ALTER TABLE "session_costs"
  ADD COLUMN "costStatus" TEXT NOT NULL DEFAULT 'unavailable',
  ADD COLUMN "pricingCatalogVersion" TEXT;

COMMENT ON COLUMN "session_costs"."costStatus" IS
  'available only when every billable LLM call matched a versioned pricing catalog entry';
COMMENT ON COLUMN "session_costs"."pricingCatalogVersion" IS
  'version of the pricing catalog used for the session cost estimate';
