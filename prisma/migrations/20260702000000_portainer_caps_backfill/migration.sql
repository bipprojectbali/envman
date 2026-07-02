-- Backfill capability Portainer: pecahan granular dari stack:mutate.
-- Kenapa: restart/repull/recreate dipindah dari stack:mutate ke stack:power &
-- stack:deploy. Agar pemilik stack:mutate existing tak kehilangan akses lifecycle,
-- grant kedua capability baru ke mereka. Data-only (kolom permissions sudah ada).
-- Idempotent: guard NOT (... = ANY) supaya aman di-rerun.

-- stack:power (start/stop/restart) untuk pemilik stack:mutate
UPDATE "user"
SET "permissions" = array_append("permissions", 'stack:power')
WHERE 'stack:mutate' = ANY("permissions")
  AND NOT ('stack:power' = ANY("permissions"));

-- stack:deploy (repull/recreate) untuk pemilik stack:mutate
UPDATE "user"
SET "permissions" = array_append("permissions", 'stack:deploy')
WHERE 'stack:mutate' = ANY("permissions")
  AND NOT ('stack:deploy' = ANY("permissions"));

-- CATATAN: exec SENGAJA TIDAK di-backfill. stack:exec (shell penuh) kini terpisah
-- dari stack:operate — pemilik stack:operate harus di-grant stack:exec eksplisit.
