-- Account-scoped single-slot clipboard (pbcopy/pbpaste synced across devices).
-- One row per user; content encrypted at rest; auto-expires at expiresAt.
CREATE TABLE IF NOT EXISTS "clipboard" (
  "userId"     TEXT NOT NULL,
  "content"    TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clipboard_pkey" PRIMARY KEY ("userId")
);

-- Index supports the periodic TTL sweep (DELETE WHERE expiresAt < now()).
CREATE INDEX IF NOT EXISTS "clipboard_expiresAt_idx" ON "clipboard" ("expiresAt");

-- FK: clipboard removed when its owner is deleted.
DO $$ BEGIN
  ALTER TABLE "clipboard"
    ADD CONSTRAINT "clipboard_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
