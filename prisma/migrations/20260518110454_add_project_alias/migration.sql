-- CreateTable
CREATE TABLE "project_alias" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "args" TEXT NOT NULL,
    "description" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_alias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_alias_projectId_idx" ON "project_alias"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_alias_projectId_name_key" ON "project_alias"("projectId", "name");

-- AddForeignKey
ALTER TABLE "project_alias" ADD CONSTRAINT "project_alias_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_alias" ADD CONSTRAINT "project_alias_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
