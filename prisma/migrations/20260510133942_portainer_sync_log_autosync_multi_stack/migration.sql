-- AlterTable
ALTER TABLE "portainer_config" ADD COLUMN     "autoSync" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "portainer_sync_log" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "userId" TEXT,
    "triggeredBy" TEXT NOT NULL,
    "varsCount" INTEGER NOT NULL,
    "secretCount" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portainer_sync_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portainer_stack_target" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "connectionId" TEXT,
    "stackId" INTEGER NOT NULL,
    "stackName" TEXT NOT NULL,
    "endpointId" INTEGER NOT NULL DEFAULT 1,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portainer_stack_target_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portainer_sync_log_configId_idx" ON "portainer_sync_log"("configId");

-- CreateIndex
CREATE INDEX "portainer_stack_target_configId_idx" ON "portainer_stack_target"("configId");

-- AddForeignKey
ALTER TABLE "portainer_sync_log" ADD CONSTRAINT "portainer_sync_log_configId_fkey" FOREIGN KEY ("configId") REFERENCES "portainer_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portainer_sync_log" ADD CONSTRAINT "portainer_sync_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portainer_stack_target" ADD CONSTRAINT "portainer_stack_target_configId_fkey" FOREIGN KEY ("configId") REFERENCES "portainer_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portainer_stack_target" ADD CONSTRAINT "portainer_stack_target_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "portainer_connection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
