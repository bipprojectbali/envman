-- Project Storage: MinIO-backed file storage per project.
-- storageQuotaMb null = pakai AppSetting storage_default_quota_mb (default 500).
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "storageQuotaMb" INTEGER;

-- Tabel metadata storage object. Konten disimpan di MinIO (key = "{projectId}/{path}").
CREATE TABLE IF NOT EXISTS "project_storage_object" (
  "id"           TEXT NOT NULL,
  "projectId"    TEXT NOT NULL,
  "path"         TEXT NOT NULL,
  "minioKey"     TEXT NOT NULL,
  "size"         INTEGER NOT NULL DEFAULT 0,
  "mimeType"     TEXT NOT NULL DEFAULT 'application/octet-stream',
  "isPublic"     BOOLEAN NOT NULL DEFAULT false,
  "tags"         TEXT[] NOT NULL DEFAULT '{}',
  "description"  TEXT,
  "uploadedById" TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_storage_object_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "project_storage_object_projectId_path_key"
  ON "project_storage_object" ("projectId", "path");

CREATE INDEX IF NOT EXISTS "project_storage_object_projectId_idx"
  ON "project_storage_object" ("projectId");

DO $$ BEGIN
  ALTER TABLE "project_storage_object"
    ADD CONSTRAINT "project_storage_object_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "project_storage_object"
    ADD CONSTRAINT "project_storage_object_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
