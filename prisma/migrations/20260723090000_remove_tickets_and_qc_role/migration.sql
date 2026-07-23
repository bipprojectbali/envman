-- Remove Tickets feature + QC role.
-- Kenapa: fitur Tickets dihapus total; role QC yang satu-satunya berfungsi untuk
-- ticket workflow ikut dibuang. Migration ini idempoten & aman dijalankan di
-- produksi (auto-run saat startup) — semua guard IF EXISTS, urutan drop benar.

-- 1) Drop tabel ticket (child dulu, lalu parent). CASCADE membereskan FK sisa.
DROP TABLE IF EXISTS "ticket_evidence" CASCADE;
DROP TABLE IF EXISTS "ticket_comment" CASCADE;
DROP TABLE IF EXISTS "ticket" CASCADE;

-- 2) Drop enum type khusus ticket (setelah tabel yang memakainya hilang).
DROP TYPE IF EXISTS "TicketStatus";
DROP TYPE IF EXISTS "TicketPriority";

-- 3) Buang nilai 'QC' dari enum "Role".
--    Postgres tak punya "DROP VALUE" untuk enum, jadi type di-recreate:
--    backfill user QC → USER dulu (agar tak ada baris yang memakai nilai QC),
--    lalu swap type lama dengan yang baru tanpa 'QC'.
--    DO block: no-op jika 'QC' sudah tak ada (idempoten, aman re-run).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'Role' AND e.enumlabel = 'QC'
  ) THEN
    -- User QC yang tersisa dialihkan ke USER (role paling rendah).
    UPDATE "user" SET "role" = 'USER' WHERE "role" = 'QC';

    -- Lepas default sebelum menukar type (default merujuk type lama).
    ALTER TABLE "user" ALTER COLUMN "role" DROP DEFAULT;

    -- Rename type lama, buat type baru tanpa QC, migrasi kolom, hapus type lama.
    ALTER TYPE "Role" RENAME TO "Role_old";
    CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN');
    ALTER TABLE "user"
      ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
    DROP TYPE "Role_old";

    -- Kembalikan default.
    ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'USER';
  END IF;
END
$$;
