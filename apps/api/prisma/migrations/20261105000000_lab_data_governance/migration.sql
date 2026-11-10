-- CreateEnum
CREATE TYPE "LabDataKind" AS ENUM ('QUESTION', 'ARTICLE', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "LabDataAccess" AS ENUM ('READ', 'WRITE');

-- CreateTable
CREATE TABLE "lab_data_collections" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "LabDataKind" NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "lab_data_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_data_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "revision" INTEGER NOT NULL DEFAULT 1,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "lab_data_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_data_record_versions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_data_record_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_data_grants" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "access" "LabDataAccess" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_data_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_data_audit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_data_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lab_data_collections_organizationId_ownerId_deletedAt_kind_idx" ON "lab_data_collections"("organizationId", "ownerId", "deletedAt", "kind");

-- CreateIndex
CREATE INDEX "lab_data_collections_workspaceId_idx" ON "lab_data_collections"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "lab_data_collections_id_organizationId_key" ON "lab_data_collections"("id", "organizationId");

-- CreateIndex
CREATE INDEX "lab_data_records_collectionId_deletedAt_updatedAt_idx" ON "lab_data_records"("collectionId", "deletedAt", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "lab_data_records_id_organizationId_key" ON "lab_data_records"("id", "organizationId");

-- CreateIndex
CREATE INDEX "lab_data_record_versions_organizationId_recordId_idx" ON "lab_data_record_versions"("organizationId", "recordId");

-- CreateIndex
CREATE UNIQUE INDEX "lab_data_record_versions_recordId_revision_key" ON "lab_data_record_versions"("recordId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "lab_data_record_versions_id_organizationId_key" ON "lab_data_record_versions"("id", "organizationId");

-- CreateIndex
CREATE INDEX "lab_data_grants_organizationId_userId_idx" ON "lab_data_grants"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "lab_data_grants_collectionId_userId_key" ON "lab_data_grants"("collectionId", "userId");

-- CreateIndex
CREATE INDEX "lab_data_audit_collectionId_createdAt_idx" ON "lab_data_audit"("collectionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "lab_data_audit_id_organizationId_key" ON "lab_data_audit"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_id_organizationId_ownerId_key" ON "workspaces"("id", "organizationId", "ownerId");

-- AddForeignKey
ALTER TABLE "lab_data_collections" ADD CONSTRAINT "lab_data_collections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_data_collections" ADD CONSTRAINT "lab_data_collections_workspaceId_organizationId_ownerId_fkey" FOREIGN KEY ("workspaceId", "organizationId", "ownerId") REFERENCES "workspaces"("id", "organizationId", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_data_collections" ADD CONSTRAINT "lab_data_collections_ownerId_organizationId_fkey" FOREIGN KEY ("ownerId", "organizationId") REFERENCES "users"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_data_records" ADD CONSTRAINT "lab_data_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_data_records" ADD CONSTRAINT "lab_data_records_collectionId_organizationId_fkey" FOREIGN KEY ("collectionId", "organizationId") REFERENCES "lab_data_collections"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_data_record_versions" ADD CONSTRAINT "lab_data_record_versions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_data_record_versions" ADD CONSTRAINT "lab_data_record_versions_recordId_organizationId_fkey" FOREIGN KEY ("recordId", "organizationId") REFERENCES "lab_data_records"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_data_grants" ADD CONSTRAINT "lab_data_grants_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_data_grants" ADD CONSTRAINT "lab_data_grants_collectionId_organizationId_fkey" FOREIGN KEY ("collectionId", "organizationId") REFERENCES "lab_data_collections"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_data_grants" ADD CONSTRAINT "lab_data_grants_userId_organizationId_fkey" FOREIGN KEY ("userId", "organizationId") REFERENCES "users"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_data_audit" ADD CONSTRAINT "lab_data_audit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_data_audit" ADD CONSTRAINT "lab_data_audit_collectionId_organizationId_fkey" FOREIGN KEY ("collectionId", "organizationId") REFERENCES "lab_data_collections"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- API writes append immutable evidence; content updates must create a new revision.
CREATE FUNCTION lab_data_evidence_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Agent Lab data evidence is immutable'; END;
$$;
CREATE TRIGGER lab_data_record_version_no_update BEFORE UPDATE OR DELETE ON lab_data_record_versions
FOR EACH ROW EXECUTE FUNCTION lab_data_evidence_immutable();
CREATE TRIGGER lab_data_audit_no_update BEFORE UPDATE OR DELETE ON lab_data_audit
FOR EACH ROW EXECUTE FUNCTION lab_data_evidence_immutable();
ALTER TABLE lab_data_records ADD CONSTRAINT lab_data_positive_revision CHECK (revision > 0);
ALTER TABLE lab_data_record_versions ADD CONSTRAINT lab_data_version_positive_revision CHECK (revision > 0);
