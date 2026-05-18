-- AlterTable
ALTER TABLE "project_alias" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
