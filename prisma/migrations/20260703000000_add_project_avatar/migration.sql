-- Kustomisasi avatar project: icon (nama Tabler) + color (nama warna Mantine).
-- Nullable → project lama tetap fallback ke inisial nama + warna-by-role.
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "icon" TEXT;
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "color" TEXT;
