-- Dataset versions belong to an organization. Preserve every existing row and ID.
CREATE UNIQUE INDEX "lab_datasets_organizationId_version_key" ON "lab_datasets"("organizationId", "version");
DROP INDEX "lab_datasets_version_key";
