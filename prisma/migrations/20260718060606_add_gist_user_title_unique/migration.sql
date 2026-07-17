-- Make (userId, title) unique on gist so the CLI (`envman gists push <name>`)
-- can resolve a gist by name instead of by UUID. Titles were free-form before,
-- so existing rows may collide — de-duplicate first, then add the constraint.

-- Backfill: for each (userId, title) collision group, keep the oldest gist's
-- title and give the rest a fresh " (N)" suffix. N is bumped until the new title
-- is actually free within that user, so a pre-existing "foo (2)" can't cause a
-- second collision. Done in plpgsql because the free slot depends on live state.
DO $$
DECLARE
  dup       RECORD;
  candidate TEXT;
  n         INT;
BEGIN
  FOR dup IN
    SELECT "id", "userId", "title"
    FROM (
      SELECT "id", "userId", "title",
             ROW_NUMBER() OVER (
               PARTITION BY "userId", "title" ORDER BY "createdAt", "id"
             ) AS rn
      FROM "gist"
    ) ranked
    WHERE ranked.rn > 1
  LOOP
    n := 2;
    LOOP
      candidate := dup."title" || ' (' || n || ')';
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM "gist"
        WHERE "userId" = dup."userId" AND "title" = candidate
      );
      n := n + 1;
    END LOOP;
    UPDATE "gist" SET "title" = candidate WHERE "id" = dup."id";
  END LOOP;
END $$;

-- Unique index enforcing one title per user going forward.
CREATE UNIQUE INDEX IF NOT EXISTS "gist_userId_title_key" ON "gist" ("userId", "title");
