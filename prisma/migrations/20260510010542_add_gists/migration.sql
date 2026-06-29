-- CreateTable
CREATE TABLE "gist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "files" JSONB NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gist_userId_idx" ON "gist"("userId");

-- CreateIndex
CREATE INDEX "gist_isPublic_idx" ON "gist"("isPublic");

-- AddForeignKey
ALTER TABLE "gist" ADD CONSTRAINT "gist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
