CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'MEMBER');
CREATE TYPE "AgentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "AgentVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workspace_members" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_versions" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" "AgentVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "modelConfig" JSONB,
    "systemPrompt" TEXT NOT NULL DEFAULT '',
    "runtimeConfig" JSONB,
    "toolBindings" JSONB,
    "knowledgeBindings" JSONB,
    "memoryBindings" JSONB,
    "inputSchema" JSONB,
    "outputSchema" JSONB,
    "changelog" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "agent_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");
CREATE INDEX "workspaces_ownerId_idx" ON "workspaces"("ownerId");
CREATE UNIQUE INDEX "workspace_members_workspaceId_userId_key" ON "workspace_members"("workspaceId", "userId");
CREATE INDEX "workspace_members_userId_idx" ON "workspace_members"("userId");
CREATE UNIQUE INDEX "agents_workspaceId_key_key" ON "agents"("workspaceId", "key");
CREATE INDEX "agents_workspaceId_updatedAt_idx" ON "agents"("workspaceId", "updatedAt");
CREATE UNIQUE INDEX "agent_versions_agentId_version_key" ON "agent_versions"("agentId", "version");
CREATE INDEX "agent_versions_agentId_createdAt_idx" ON "agent_versions"("agentId", "createdAt");

ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agents" ADD CONSTRAINT "agents_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agents" ADD CONSTRAINT "agents_currentVersionId_fkey"
  FOREIGN KEY ("currentVersionId") REFERENCES "agent_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
