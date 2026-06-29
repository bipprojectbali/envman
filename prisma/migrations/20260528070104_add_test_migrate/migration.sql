-- CreateEnum
CREATE TYPE "TestMigrateKind" AS ENUM ('ALPHA', 'BETA', 'GAMMA');

-- CreateTable
CREATE TABLE "test_migrate" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "kind" "TestMigrateKind" NOT NULL DEFAULT 'ALPHA',
    "meta" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_migrate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "test_migrate_slug_key" ON "test_migrate"("slug");

-- CreateIndex
CREATE INDEX "test_migrate_kind_idx" ON "test_migrate"("kind");

-- CreateIndex
CREATE INDEX "test_migrate_active_idx" ON "test_migrate"("active");

-- CreateIndex
CREATE INDEX "test_migrate_createdAt_idx" ON "test_migrate"("createdAt");
