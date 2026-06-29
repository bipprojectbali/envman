-- AlterTable
ALTER TABLE "project" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "project_deletedAt_idx" ON "project"("deletedAt");
