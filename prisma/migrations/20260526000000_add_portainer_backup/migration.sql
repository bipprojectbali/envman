-- PortainerBackup + PortainerBackupSchedule for connection-level backup management

CREATE TYPE "PortainerBackupType" AS ENUM ('PORTAINER_DB', 'COMPOSE_FILES', 'FULL');

CREATE TABLE "portainer_backup" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "type" "PortainerBackupType" NOT NULL DEFAULT 'PORTAINER_DB',
    "note" TEXT,
    "sizeBytes" INTEGER,
    "data" BYTEA NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portainer_backup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "portainer_backup_schedule" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "type" "PortainerBackupType" NOT NULL DEFAULT 'PORTAINER_DB',
    "note" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastRunOk" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portainer_backup_schedule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "portainer_backup_connectionId_idx" ON "portainer_backup"("connectionId");
CREATE INDEX "portainer_backup_createdAt_idx" ON "portainer_backup"("createdAt");
CREATE UNIQUE INDEX "portainer_backup_schedule_connectionId_key" ON "portainer_backup_schedule"("connectionId");

ALTER TABLE "portainer_backup" ADD CONSTRAINT "portainer_backup_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "portainer_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "portainer_backup" ADD CONSTRAINT "portainer_backup_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "portainer_backup_schedule" ADD CONSTRAINT "portainer_backup_schedule_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "portainer_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
