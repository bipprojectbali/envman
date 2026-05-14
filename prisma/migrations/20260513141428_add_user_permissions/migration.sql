-- AlterTable
ALTER TABLE "user" ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[];
