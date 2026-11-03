-- CreateTable
CREATE TABLE "question_catalog_states" (
    "organizationId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'LEGACY',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "adoptedAt" TIMESTAMP(3),
    "sourceHash" TEXT,
    "sourceCount" INTEGER,

    CONSTRAINT "question_catalog_states_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "question_catalog_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "currentVersion" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "indexKey" TEXT NOT NULL,
    "indexStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "position" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "question_catalog_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_catalog_versions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "origin" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_catalog_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "question_catalog_entries_indexKey_key" ON "question_catalog_entries"("indexKey");

-- CreateIndex
CREATE INDEX "question_catalog_entries_organizationId_deletedAt_category__idx" ON "question_catalog_entries"("organizationId", "deletedAt", "category", "level");

-- CreateIndex
CREATE UNIQUE INDEX "question_catalog_entries_organizationId_questionId_key" ON "question_catalog_entries"("organizationId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "question_catalog_entries_id_organizationId_key" ON "question_catalog_entries"("id", "organizationId");

-- CreateIndex
CREATE INDEX "question_catalog_versions_organizationId_entryId_idx" ON "question_catalog_versions"("organizationId", "entryId");

-- CreateIndex
CREATE UNIQUE INDEX "question_catalog_versions_entryId_version_key" ON "question_catalog_versions"("entryId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "question_catalog_versions_id_organizationId_key" ON "question_catalog_versions"("id", "organizationId");

-- AddForeignKey
ALTER TABLE "question_catalog_states" ADD CONSTRAINT "question_catalog_states_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_catalog_entries" ADD CONSTRAINT "question_catalog_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_catalog_versions" ADD CONSTRAINT "question_catalog_versions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_catalog_versions" ADD CONSTRAINT "question_catalog_versions_entryId_organizationId_fkey" FOREIGN KEY ("entryId", "organizationId") REFERENCES "question_catalog_entries"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Fixed states and positive versions remain valid even for non-Prisma operators.
ALTER TABLE "question_catalog_states" ADD CONSTRAINT "question_catalog_mode_check" CHECK ("mode" IN ('LEGACY', 'CATALOG'));
ALTER TABLE "question_catalog_entries" ADD CONSTRAINT "question_catalog_index_status_check" CHECK ("indexStatus" IN ('PENDING', 'READY'));
ALTER TABLE "question_catalog_entries" ADD CONSTRAINT "question_catalog_current_version_check" CHECK ("currentVersion" > 0);
ALTER TABLE "question_catalog_versions" ADD CONSTRAINT "question_catalog_version_check" CHECK ("version" > 0);

CREATE FUNCTION prevent_question_catalog_version_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Question catalog versions are immutable';
END;
$$;
CREATE TRIGGER question_catalog_version_immutable BEFORE UPDATE ON "question_catalog_versions"
FOR EACH ROW EXECUTE FUNCTION prevent_question_catalog_version_update();
