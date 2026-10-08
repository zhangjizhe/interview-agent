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

-- CreateIndex
CREATE INDEX "session_costs_interviewId_idx" ON "session_costs"("interviewId");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "session_costs_interviewId_key" ON "session_costs"("interviewId");

-- AddForeignKey
ALTER TABLE "session_costs" ADD CONSTRAINT "session_costs_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
