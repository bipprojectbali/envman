ALTER TABLE "project_file" ADD COLUMN "prefix" TEXT;
CREATE UNIQUE INDEX "project_file_projectId_prefix_key" ON "project_file"("projectId", "prefix") WHERE "prefix" IS NOT NULL;
