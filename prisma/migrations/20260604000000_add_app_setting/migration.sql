-- Key-value store untuk konfigurasi global aplikasi (runtime-changeable via Dev > Settings)
CREATE TABLE IF NOT EXISTS "app_setting" (
  "key"          TEXT NOT NULL,
  "value"        TEXT NOT NULL,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  "updatedById"  TEXT,
  CONSTRAINT "app_setting_pkey" PRIMARY KEY ("key")
);
