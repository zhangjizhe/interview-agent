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

-- CreateIndex
CREATE INDEX "user_tool_preferences_userId_idx" ON "user_tool_preferences"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_tool_preferences_userId_toolName_key" ON "user_tool_preferences"("userId", "toolName");
