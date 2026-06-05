-- Log aktivitas CLI per token: waktu, aksi, project/env, IP
-- tokenId dan userId sengaja bukan FK agar log tetap ada setelah token/user dihapus
CREATE TABLE IF NOT EXISTS "token_activity_log" (
  "id"          TEXT NOT NULL,
  "tokenId"     TEXT NOT NULL,
  "userId"      TEXT,
  "tokenName"   TEXT,
  "action"      TEXT NOT NULL,
  "projectSlug" TEXT,
  "envName"     TEXT,
  "detail"      TEXT,
  "ip"          TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "token_activity_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "token_activity_log_tokenId_idx"  ON "token_activity_log" ("tokenId");
CREATE INDEX IF NOT EXISTS "token_activity_log_userId_idx"   ON "token_activity_log" ("userId");
CREATE INDEX IF NOT EXISTS "token_activity_log_createdAt_idx" ON "token_activity_log" ("createdAt" DESC);
