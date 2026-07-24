-- Tambah kolom updatedAt di tabel environment agar UI bisa menampilkan
-- "kapan diupdate" (model lain sudah punya; Environment sebelumnya hanya createdAt).
-- Aman-prod & idempoten: IF NOT EXISTS, DEFAULT now() untuk baris lama, lalu
-- backfill = createdAt supaya nilai awal akurat (bukan waktu migrasi).

ALTER TABLE "environment" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: environment lama belum pernah "diupdate" → samakan dengan createdAt.
UPDATE "environment" SET "updatedAt" = "createdAt" WHERE "updatedAt" > "createdAt";
