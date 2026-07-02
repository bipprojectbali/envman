-- Tint background card project (warna Mantine, tipis). Nullable → tanpa tint bila null.
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "cardColor" TEXT;
