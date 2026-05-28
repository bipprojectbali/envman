/**
 * Integration tests for scripts/migrate.ts — custom Prisma-compatible migrator.
 *
 * Setup (jalankan sekali):
 *   createdb envman_migrate_test
 *
 * Jalankan:
 *   MIGRATE_TEST_DB_URL='postgresql://USER@localhost:5432/envman_migrate_test' bun test tests/integration/migrate.test.ts
 *
 * DB tidak perlu di-push schema dulu — migrator yang setup semuanya dari scratch.
 * DB name HARUS diakhiri `_test` (safety guard).
 */

import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { SQL } from "bun";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// ─── Test DB Setup ─────────────────────────────────────────────────────────

const MIGRATE_DB_URL =
  process.env.MIGRATE_TEST_DB_URL ??
  `postgresql://${process.env.USER ?? "bip"}@localhost:5432/envman_migrate_test`;

// Safety guard — DB name harus diakhiri _test
function getDbName(url: string): string {
  try {
    return new URL(url).pathname.slice(1).split("?")[0] ?? "";
  } catch {
    return "";
  }
}

const DB_NAME = getDbName(MIGRATE_DB_URL);
if (!DB_NAME.endsWith("_test")) {
  throw new Error(
    `🛑 REFUSED: MIGRATE_TEST_DB_URL harus menunjuk ke DB yang diakhiri "_test".\n` +
      `   Saat ini: "${DB_NAME}"\n` +
      `   Contoh: MIGRATE_TEST_DB_URL='postgresql://bip@localhost:5432/envman_migrate_test'`
  );
}

const MIGRATIONS_DIR = "./prisma/migrations";

// Drop dan recreate public schema → state bersih seperti DB baru
async function resetSchema(db: SQL): Promise<void> {
  await db.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
}

// Ambil semua row dari _prisma_migrations
async function getMigrations(
  db: SQL
): Promise<{ migration_name: string; checksum: string; finished_at: Date | null }[]> {
  try {
    return await db`SELECT migration_name, checksum, finished_at FROM "_prisma_migrations" ORDER BY started_at`;
  } catch {
    return []; // table belum ada
  }
}

// Run migrate script sebagai subprocess
async function runMigrate(
  overrideEnv: Record<string, string> = {}
): Promise<{ exitCode: number; output: string }> {
  const env: Record<string, string> = {
    DATABASE_URL: MIGRATE_DB_URL,
    ...overrideEnv,
  };
  const proc = Bun.spawn([process.execPath, "run", "scripts/migrate.ts"], {
    env,
    stdout: "pipe",
    stderr: "pipe",
    cwd: process.cwd(),
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, output: stdout + stderr };
}

function sha256hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

// ─── Tests ────────────────────────────────────────────────────────────────

let db: SQL;

// Setup sekali di awal — kalau DB tidak bisa diakses, semua test skip
try {
  db = new SQL(MIGRATE_DB_URL, { max: 3 });
  await db`SELECT 1`; // connectivity check
} catch (e) {
  console.warn(
    `\n⚠ Skipping migrate tests — cannot connect to ${MIGRATE_DB_URL}\n` +
      `  Setup: createdb envman_migrate_test\n` +
      `  Run: MIGRATE_TEST_DB_URL='postgresql://bip@localhost:5432/envman_migrate_test' bun test tests/integration/migrate.test.ts\n`
  );
  process.exit(0);
}

beforeEach(async () => {
  await resetSchema(db);
});

afterAll(async () => {
  await db.close();
  // Cleanup test DBs yang dibuat selama test
  for (const name of [
    "envman_migrate_test",
    "envman_migrate_test2",
    "envman_migrate_test3",
    "envman_migrate_test4",
  ]) {
    // Biarkan tetap ada — user yang cleanup manual jika mau
  }
});

describe("scripts/migrate.ts", () => {
  test("applies all migrations to a fresh database", async () => {
    const { exitCode, output } = await runMigrate();

    expect(exitCode).toBe(0);
    expect(output).toContain("→ Applying 21 migration(s):");
    expect(output).toContain("✓ Done");
    expect(output).not.toContain("✗ Migration failed");

    const rows = await getMigrations(db);
    expect(rows).toHaveLength(21);
    expect(rows.every((r) => r.finished_at !== null)).toBe(true);
  });

  test("is idempotent — second run reports up to date", async () => {
    // First run
    await runMigrate();

    // Second run — must be idempotent
    const { exitCode, output } = await runMigrate();
    expect(exitCode).toBe(0);
    expect(output).toContain("✓ Database up to date");
    expect(output).not.toContain("→ Applying");
  });

  test("applies only pending migrations when some are already applied", async () => {
    // Apply all migrations first
    await runMigrate();

    // Delete the last migration record to simulate it not having been applied.
    // We only undo the last migration (20260526000000_add_portainer_backup) because
    // it only adds new tables (easy to DROP, no ALTER TABLE needed).
    await db`
      DELETE FROM "_prisma_migrations"
      WHERE migration_name = '20260526000000_add_portainer_backup'
    `;
    // Drop everything the last migration created so re-apply succeeds
    // Table names are lowercase (portainer_backup) per @@map in Prisma schema
    await db.unsafe(
      'DROP TABLE IF EXISTS "portainer_backup" CASCADE;' +
        ' DROP TABLE IF EXISTS "portainer_backup_schedule" CASCADE;' +
        ' DROP TYPE IF EXISTS "PortainerBackupType";'
    );

    const { exitCode, output } = await runMigrate();
    expect(exitCode).toBe(0);
    expect(output).toContain("→ Applying 1 migration(s):");
    expect(output).toContain("20260526000000_add_portainer_backup");
    expect(output).toContain("✓ Done");

    const rows = await getMigrations(db);
    expect(rows).toHaveLength(21);
    expect(rows.every((r) => r.finished_at !== null)).toBe(true);
  });

  test("stores correct SHA-256 checksums matching raw file content", async () => {
    await runMigrate();

    const rows = await getMigrations(db);
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows.slice(0, 5)) {
      // Spot-check first 5 for speed
      const sqlPath = join(MIGRATIONS_DIR, row.migration_name, "migration.sql");
      const body = await readFile(sqlPath, "utf-8");
      const expected = sha256hex(body);
      expect(row.checksum).toBe(expected);
    }
  });

  test("is compatible with prisma migrate status", async () => {
    await runMigrate();

    const proc = Bun.spawn([process.execPath, "x", "prisma", "migrate", "status"], {
      env: { DATABASE_URL: MIGRATE_DB_URL },
      stdout: "pipe",
      stderr: "pipe",
      cwd: process.cwd(),
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Database schema is up to date!");
  });

  test("exits with code 1 when DATABASE_URL is empty", async () => {
    const { exitCode, output } = await runMigrate({ DATABASE_URL: "" });

    expect(exitCode).toBe(1);
    expect(output).toContain("DATABASE_URL is not set");
  });

  test("handles partial apply state — migration with finished_at NULL is retried", async () => {
    // Apply all migrations first
    await runMigrate();

    // Simulate crash mid-migration: set finished_at = NULL for last migration
    await db`
      UPDATE "_prisma_migrations"
      SET finished_at = NULL, applied_steps_count = 0
      WHERE migration_name = '20260526000000_add_portainer_backup'
    `;
    // Undo the schema changes from that migration so re-apply succeeds
    await db.unsafe(
      'DROP TABLE IF EXISTS "portainer_backup" CASCADE;' +
        ' DROP TABLE IF EXISTS "portainer_backup_schedule" CASCADE;' +
        ' DROP TYPE IF EXISTS "PortainerBackupType";'
    );

    // Migrator should see finished_at = NULL → treat as pending → retry
    const { exitCode, output } = await runMigrate();
    expect(exitCode).toBe(0);
    expect(output).toContain("20260526000000_add_portainer_backup");
    expect(output).toContain("✓ Done");

    // Verify finished_at is now set (retry succeeded)
    const rows = await db`
      SELECT finished_at FROM "_prisma_migrations"
      WHERE migration_name = '20260526000000_add_portainer_backup'
    `;
    expect(rows[0]?.finished_at).not.toBeNull();
  });

  test("emits warning on checksum mismatch without blocking", async () => {
    await runMigrate();

    // Tamper checksum for first migration to simulate drift
    await db`
      UPDATE "_prisma_migrations"
      SET checksum = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
      WHERE migration_name = '20260331061237_init'
    `;

    const { exitCode, output } = await runMigrate();
    // Must still succeed (warning only)
    expect(exitCode).toBe(0);
    expect(output).toContain("⚠ Checksum mismatch: 20260331061237_init");
    expect(output).toContain("✓ Database up to date");
  });
});
