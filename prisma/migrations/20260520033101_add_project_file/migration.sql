-- CreateTable
CREATE TABLE "project_file" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "files" JSONB NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_file_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_file_projectId_idx" ON "project_file"("projectId");

-- CreateIndex
CREATE INDEX "project_file_authorId_idx" ON "project_file"("authorId");

-- AddForeignKey
ALTER TABLE "project_file" ADD CONSTRAINT "project_file_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_file" ADD CONSTRAINT "project_file_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
