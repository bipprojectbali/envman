-- Env Import (live-link): env target meminjam vars dari source env lintas project.
-- Resolve live saat dibaca untuk mencegah drift (bukan snapshot/copy).
CREATE TABLE IF NOT EXISTS "env_import" (
    "id" TEXT NOT NULL,
    "targetEnvId" TEXT NOT NULL,
    "sourceEnvId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "env_import_pkey" PRIMARY KEY ("id")
);

-- Unique: satu pasang target←source hanya boleh ada satu link.
CREATE UNIQUE INDEX IF NOT EXISTS "env_import_targetEnvId_sourceEnvId_key" ON "env_import" ("targetEnvId", "sourceEnvId");
CREATE INDEX IF NOT EXISTS "env_import_targetEnvId_idx" ON "env_import" ("targetEnvId");
CREATE INDEX IF NOT EXISTS "env_import_sourceEnvId_idx" ON "env_import" ("sourceEnvId");

-- Cascade: hapus env (target/source) otomatis bersihkan link agar resolve tidak menabrak baris yatim.
DO $$ BEGIN
    ALTER TABLE "env_import" ADD CONSTRAINT "env_import_targetEnvId_fkey"
        FOREIGN KEY ("targetEnvId") REFERENCES "environment" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "env_import" ADD CONSTRAINT "env_import_sourceEnvId_fkey"
        FOREIGN KEY ("sourceEnvId") REFERENCES "environment" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
