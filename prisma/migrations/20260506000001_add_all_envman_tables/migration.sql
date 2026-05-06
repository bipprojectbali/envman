-- Add QC to Role enum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'QC';

-- Add blocked column to user
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "blocked" BOOLEAN NOT NULL DEFAULT false;

-- Add indexes to session
CREATE UNIQUE INDEX IF NOT EXISTS "session_token_key" ON "session"("token");
CREATE INDEX IF NOT EXISTS "session_token_idx" ON "session"("token");

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ProjectMemberRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable audit_log
CREATE TABLE IF NOT EXISTS "audit_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "audit_log_userId_idx" ON "audit_log"("userId");
CREATE INDEX IF NOT EXISTS "audit_log_action_idx" ON "audit_log"("action");
CREATE INDEX IF NOT EXISTS "audit_log_createdAt_idx" ON "audit_log"("createdAt");

ALTER TABLE "audit_log" DROP CONSTRAINT IF EXISTS "audit_log_userId_fkey";
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable ticket
CREATE TABLE IF NOT EXISTS "ticket" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "route" TEXT,
    "reporterId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "ticket_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ticket_status_idx" ON "ticket"("status");
CREATE INDEX IF NOT EXISTS "ticket_reporterId_idx" ON "ticket"("reporterId");
CREATE INDEX IF NOT EXISTS "ticket_assigneeId_idx" ON "ticket"("assigneeId");
CREATE INDEX IF NOT EXISTS "ticket_createdAt_idx" ON "ticket"("createdAt");

ALTER TABLE "ticket" DROP CONSTRAINT IF EXISTS "ticket_reporterId_fkey";
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_reporterId_fkey"
    FOREIGN KEY ("reporterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ticket" DROP CONSTRAINT IF EXISTS "ticket_assigneeId_fkey";
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_assigneeId_fkey"
    FOREIGN KEY ("assigneeId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable ticket_comment
CREATE TABLE IF NOT EXISTS "ticket_comment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorTag" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_comment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ticket_comment_ticketId_idx" ON "ticket_comment"("ticketId");

ALTER TABLE "ticket_comment" DROP CONSTRAINT IF EXISTS "ticket_comment_ticketId_fkey";
ALTER TABLE "ticket_comment" ADD CONSTRAINT "ticket_comment_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ticket_comment" DROP CONSTRAINT IF EXISTS "ticket_comment_authorId_fkey";
ALTER TABLE "ticket_comment" ADD CONSTRAINT "ticket_comment_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable ticket_evidence
CREATE TABLE IF NOT EXISTS "ticket_evidence" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_evidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ticket_evidence_ticketId_idx" ON "ticket_evidence"("ticketId");

ALTER TABLE "ticket_evidence" DROP CONSTRAINT IF EXISTS "ticket_evidence_ticketId_fkey";
ALTER TABLE "ticket_evidence" ADD CONSTRAINT "ticket_evidence_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable project
CREATE TABLE IF NOT EXISTS "project" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "project_slug_key" ON "project"("slug");

-- CreateTable environment
CREATE TABLE IF NOT EXISTS "environment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "environment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "environment_projectId_name_key" ON "environment"("projectId", "name");
CREATE INDEX IF NOT EXISTS "environment_projectId_idx" ON "environment"("projectId");

ALTER TABLE "environment" DROP CONSTRAINT IF EXISTS "environment_projectId_fkey";
ALTER TABLE "environment" ADD CONSTRAINT "environment_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable env_var
CREATE TABLE IF NOT EXISTS "env_var" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "environmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "env_var_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "env_var_environmentId_key_key" ON "env_var"("environmentId", "key");
CREATE INDEX IF NOT EXISTS "env_var_environmentId_idx" ON "env_var"("environmentId");

ALTER TABLE "env_var" DROP CONSTRAINT IF EXISTS "env_var_environmentId_fkey";
ALTER TABLE "env_var" ADD CONSTRAINT "env_var_environmentId_fkey"
    FOREIGN KEY ("environmentId") REFERENCES "environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable project_member
CREATE TABLE IF NOT EXISTS "project_member" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "role" "ProjectMemberRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_member_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "project_member_userId_projectId_key" ON "project_member"("userId", "projectId");
CREATE INDEX IF NOT EXISTS "project_member_projectId_idx" ON "project_member"("projectId");

ALTER TABLE "project_member" DROP CONSTRAINT IF EXISTS "project_member_userId_fkey";
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_member" DROP CONSTRAINT IF EXISTS "project_member_projectId_fkey";
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable api_token
CREATE TABLE IF NOT EXISTS "api_token" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "canWrite" BOOLEAN NOT NULL DEFAULT false,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_token_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "api_token_token_key" ON "api_token"("token");
CREATE INDEX IF NOT EXISTS "api_token_token_idx" ON "api_token"("token");
CREATE INDEX IF NOT EXISTS "api_token_userId_idx" ON "api_token"("userId");

ALTER TABLE "api_token" DROP CONSTRAINT IF EXISTS "api_token_userId_fkey";
ALTER TABLE "api_token" ADD CONSTRAINT "api_token_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable portainer_connection
CREATE TABLE IF NOT EXISTS "portainer_connection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "portainerUrl" TEXT NOT NULL,
    "apiToken" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portainer_connection_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "portainer_connection" DROP CONSTRAINT IF EXISTS "portainer_connection_createdById_fkey";
ALTER TABLE "portainer_connection" ADD CONSTRAINT "portainer_connection_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable portainer_config
CREATE TABLE IF NOT EXISTS "portainer_config" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "envName" TEXT NOT NULL,
    "connectionId" TEXT,
    "portainerUrl" TEXT,
    "apiToken" TEXT,
    "stackId" INTEGER NOT NULL,
    "stackName" TEXT NOT NULL,
    "endpointId" INTEGER NOT NULL DEFAULT 1,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncOk" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portainer_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "portainer_config_projectId_envName_key" ON "portainer_config"("projectId", "envName");
CREATE INDEX IF NOT EXISTS "portainer_config_connectionId_idx" ON "portainer_config"("connectionId");

ALTER TABLE "portainer_config" DROP CONSTRAINT IF EXISTS "portainer_config_projectId_fkey";
ALTER TABLE "portainer_config" ADD CONSTRAINT "portainer_config_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "portainer_config" DROP CONSTRAINT IF EXISTS "portainer_config_connectionId_fkey";
ALTER TABLE "portainer_config" ADD CONSTRAINT "portainer_config_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "portainer_connection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
