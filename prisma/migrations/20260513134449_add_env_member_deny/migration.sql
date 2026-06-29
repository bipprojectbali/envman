-- AlterTable
ALTER TABLE "environment_member" ALTER COLUMN "role" DROP NOT NULL,
ALTER COLUMN "role" DROP DEFAULT;
