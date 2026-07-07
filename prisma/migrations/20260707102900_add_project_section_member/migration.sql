-- Section permission per-member (Notes/Aliases/Files/Storage).
-- Kenapa: sebelumnya section non-env hanya di-gate role project (all-or-nothing);
-- model ini memberi override per-member (inherit/override/deny) analog environment_member.

-- CreateEnum (idempotent: enum tak punya IF NOT EXISTS native)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProjectSection') THEN
    CREATE TYPE "ProjectSection" AS ENUM ('NOTES', 'ALIASES', 'FILES', 'STORAGE');
  END IF;
END
$$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "project_section_member" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "section" "ProjectSection" NOT NULL,
    -- null = explicit DENY (lihat schema.prisma)
    "role" "ProjectMemberRole",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_section_member_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "project_section_member_projectId_idx" ON "project_section_member"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "project_section_member_userId_projectId_section_key" ON "project_section_member"("userId", "projectId", "section");

-- AddForeignKey (idempotent guard: constraint tak punya IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_section_member_userId_fkey'
  ) THEN
    ALTER TABLE "project_section_member" ADD CONSTRAINT "project_section_member_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_section_member_projectId_fkey'
  ) THEN
    ALTER TABLE "project_section_member" ADD CONSTRAINT "project_section_member_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- Backfill secure-by-default: member non-OWNER existing harus default-deny (role NULL)
-- di keempat section, agar konsisten dengan kebijakan baru. OWNER tidak di-seed (inherit = OWNER).
INSERT INTO "project_section_member" ("id", "userId", "projectId", "section", "role", "createdAt")
SELECT gen_random_uuid(), pm."userId", pm."projectId", s.section, NULL, CURRENT_TIMESTAMP
FROM "project_member" pm
CROSS JOIN (VALUES ('NOTES'::"ProjectSection"), ('ALIASES'::"ProjectSection"), ('FILES'::"ProjectSection"), ('STORAGE'::"ProjectSection")) AS s(section)
WHERE pm."role" <> 'OWNER'
ON CONFLICT ("userId", "projectId", "section") DO NOTHING;
