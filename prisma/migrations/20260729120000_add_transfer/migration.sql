-- Transfer user-ke-user (envman send / inbox / recv).
-- Kenapa: secret (.env, kunci SSH, cert) tak lagi dikirim lewat WhatsApp/Slack.
-- TEXT: payload di kolom "content", terenkripsi at-rest (src/lib/crypto.ts).
-- FILE: kolom disiapkan sejak sekarang (payload di MinIO, key
--       "transfers/{id}/{filename}" — namespace terpisah dari project storage
--       yang memakai "{projectId}/{path}") supaya menambah jalur file besar
--       nanti tidak butuh migrasi breaking. v1 tidak pernah mengisinya.
-- toUserId NULL = transfer kode sekali-pakai untuk penerima tanpa akun.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TransferKind') THEN
    CREATE TYPE "TransferKind" AS ENUM ('TEXT', 'FILE');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "transfer" (
  "id"              TEXT NOT NULL,
  "kind"            "TransferKind" NOT NULL DEFAULT 'TEXT',
  "fromUserId"      TEXT NOT NULL,
  -- NULL = penerima belum punya akun; diklaim lewat kode sekali-pakai.
  "toUserId"        TEXT,
  "toHint"          TEXT,
  "content"         TEXT,
  "minioKey"        TEXT,
  "filename"        TEXT,
  -- BIGINT, bukan INTEGER: dump database rutin melewati batas 2 GiB.
  "size"            BIGINT NOT NULL DEFAULT 0,
  "mimeType"        TEXT NOT NULL DEFAULT 'application/octet-stream',
  -- false = presigned URL sudah dikeluarkan tapi PUT belum dikonfirmasi.
  "uploaded"        BOOLEAN NOT NULL DEFAULT false,
  "label"           TEXT,
  "burn"            BOOLEAN NOT NULL DEFAULT true,
  -- sha256 hex dari kode klaim. Kode plaintext TIDAK PERNAH disimpan.
  "codeHash"        TEXT,
  "codePrefix"      TEXT,
  "claimedAt"       TIMESTAMP(3),
  "claimedByUserId" TEXT,
  "claimedIp"       TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "transfer_pkey" PRIMARY KEY ("id")
);

-- Unique: lookup klaim-by-kode O(1) sekaligus mencegah tabrakan kode.
CREATE UNIQUE INDEX IF NOT EXISTS "transfer_codeHash_key" ON "transfer" ("codeHash");

-- Inbox: WHERE "toUserId" = $1 AND "claimedAt" IS NULL.
CREATE INDEX IF NOT EXISTS "transfer_toUserId_claimedAt_idx" ON "transfer" ("toUserId", "claimedAt");
CREATE INDEX IF NOT EXISTS "transfer_fromUserId_idx" ON "transfer" ("fromUserId");
-- Sweep TTL: DELETE WHERE "expiresAt" < now().
CREATE INDEX IF NOT EXISTS "transfer_expiresAt_idx" ON "transfer" ("expiresAt");

-- CASCADE (bukan RESTRICT): menghapus akun harus ikut menghapus transfer-nya.
-- RESTRICT di sini akan membuat user.deleteMany() gagal dan mematikan test suite.
DO $$ BEGIN
  ALTER TABLE "transfer"
    ADD CONSTRAINT "transfer_fromUserId_fkey"
    FOREIGN KEY ("fromUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "transfer"
    ADD CONSTRAINT "transfer_toUserId_fkey"
    FOREIGN KEY ("toUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
