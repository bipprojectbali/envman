-- Tambah batas ukuran file per-project (null = pakai global default AppSetting)
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "storageMaxFileMb" INTEGER;
