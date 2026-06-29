-- Tracking aktivitas token: usage count, IP terakhir, dan metadata disable oleh admin
ALTER TABLE "api_token" ADD COLUMN IF NOT EXISTS "useCount"       INTEGER       NOT NULL DEFAULT 0;
ALTER TABLE "api_token" ADD COLUMN IF NOT EXISTS "lastIp"         TEXT;
ALTER TABLE "api_token" ADD COLUMN IF NOT EXISTS "disabledBy"     TEXT;
ALTER TABLE "api_token" ADD COLUMN IF NOT EXISTS "disabledAt"     TIMESTAMP(3);
ALTER TABLE "api_token" ADD COLUMN IF NOT EXISTS "disabledReason" TEXT;
