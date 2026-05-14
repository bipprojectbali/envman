-- CreateTable
CREATE TABLE "environment_member" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "role" "ProjectMemberRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "environment_member_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "environment_member_environmentId_idx" ON "environment_member"("environmentId");

-- CreateIndex
CREATE UNIQUE INDEX "environment_member_userId_environmentId_key" ON "environment_member"("userId", "environmentId");

-- AddForeignKey
ALTER TABLE "environment_member" ADD CONSTRAINT "environment_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environment_member" ADD CONSTRAINT "environment_member_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
