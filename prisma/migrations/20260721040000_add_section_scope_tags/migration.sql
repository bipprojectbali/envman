-- Per-tag access scope untuk ProjectSectionMember.
-- Kenapa: sebelumnya akses section bersifat all-or-nothing — begitu member punya
-- akses ke sebuah section, ia melihat SEMUA item di dalamnya. Kolom ini
-- memperkenalkan "limit by tag": bila diisi, member hanya boleh mengakses item
-- (note/alias/file/storage object) yang punya minimal satu tag yang cocok.
-- Kosong ('{}') = full access = perilaku lama, jadi additive & backward-compatible.
-- Tanpa backfill: semua baris existing default ke '{}' (full access).
ALTER TABLE "project_section_member"
  ADD COLUMN IF NOT EXISTS "scopeTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
