-- Whitelist key per-import: memungkinkan target hanya menarik subset key dari env source.
-- Kosong ('{}') = semua var source ikut → backward-compatible untuk link yang sudah ada.
ALTER TABLE "env_import" ADD COLUMN IF NOT EXISTS "keys" TEXT[] NOT NULL DEFAULT '{}';
