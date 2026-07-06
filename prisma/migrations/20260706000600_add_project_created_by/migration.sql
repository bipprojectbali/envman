-- Tambah pembuat project agar bisa memfilter "dibuat oleh siapa".
-- Sebelumnya kepemilikan hanya lewat ProjectMember(OWNER) dan SUPER_ADMIN
-- meng-hardcode myRole=OWNER di semua project — tak ada cara membedakan pembuat.

ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

-- FK SET NULL: hapus user tidak menghapus project, pembuat cukup jadi null.
DO $$ BEGIN
  ALTER TABLE "project" ADD CONSTRAINT "project_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "project_createdById_idx" ON "project" ("createdById");

-- Backfill: pembuat ≈ OWNER paling awal (member.createdAt terkecil).
-- Project tanpa OWNER tetap null (tak muncul di filter pembuat).
UPDATE "project" p SET "createdById" = (
  SELECT pm."userId" FROM "project_member" pm
  WHERE pm."projectId" = p."id" AND pm."role" = 'OWNER'
  ORDER BY pm."createdAt" ASC
  LIMIT 1
) WHERE p."createdById" IS NULL;
