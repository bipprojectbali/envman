-- CreateTable
CREATE TABLE "project_note" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_note_projectId_idx" ON "project_note"("projectId");

-- CreateIndex
CREATE INDEX "project_note_authorId_idx" ON "project_note"("authorId");

-- AddForeignKey
ALTER TABLE "project_note" ADD CONSTRAINT "project_note_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_note" ADD CONSTRAINT "project_note_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
