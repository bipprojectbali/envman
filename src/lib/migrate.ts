/**
 * Generic PostgreSQL migrator compatible with Prisma's _prisma_migrations table.
 *
 * Zero npm dependencies — only Node.js stdlib + Bun.sql built-in.
 * Self-contained: safe to extract to a standalone package later.
 *
 * ENV vars (all optional, have defaults):
 *   MIGRATE_ON_STARTUP      — "true"|"false", checked by caller (not this module)
 *   MIGRATE_DATABASE_URL    — direct DB URL for migrations (bypasses pooler)
 *                             defaults to: DIRECT_URL ?? DATABASE_URL
 *   MIGRATIONS_DIR          — path to migrations folder
 *                             defaults to: ./prisma/migrations
 *   MIGRATE_DB_RETRIES      — number of connection retries before giving up
 *                             defaults to: 5
 */

import { createHash, randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SQL } from 'bun'

// Embed as literal to avoid BigInt parameter binding bug in some Bun 1.2.x versions.
// 123100735045985 = 0x707269736D61 = "prisma" as ASCII int8.
const LOCK_ACQUIRE = 'SELECT pg_advisory_lock(123100735045985)'
const LOCK_RELEASE = 'SELECT pg_advisory_unlock(123100735045985)'

const RETRY_DELAY_MS = 2000

export interface MigrateOptions {
  /** Direct DB URL. Defaults to MIGRATE_DATABASE_URL ?? DATABASE_URL */
  databaseUrl?: string
  /** Path to migrations folder. Defaults to MIGRATIONS_DIR ?? ./prisma/migrations */
  migrationsDir?: string
  /** Connection retries if DB is unreachable. Defaults to MIGRATE_DB_RETRIES ?? 5 */
  retries?: number
  /** Optional log sink. If provided, replaces console.log output. */
  onLog?: (line: string) => void
}

function sha256hex(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

async function ensureTable(db: SQL): Promise<void> {
  await db`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id"                    VARCHAR(36) PRIMARY KEY,
      "checksum"              VARCHAR(64) NOT NULL,
      "finished_at"           TIMESTAMPTZ,
      "migration_name"        VARCHAR(255) NOT NULL,
      "logs"                  TEXT,
      "rolled_back_at"        TIMESTAMPTZ,
      "started_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count"   INTEGER NOT NULL DEFAULT 0
    )
  `
}

async function getApplied(db: SQL): Promise<Map<string, string>> {
  const rows = await db`
    SELECT migration_name, checksum FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
  `
  return new Map(rows.map((r: any) => [r.migration_name as string, r.checksum as string]))
}

async function listMigrations(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter((e) => e.isDirectory() && /^\d{14}_/.test(e.name))
    .map((e) => e.name)
    .sort()
}

async function applyMigration(db: SQL, migrationsDir: string, name: string): Promise<void> {
  const sqlPath = join(migrationsDir, name, 'migration.sql')
  const body = await readFile(sqlPath, 'utf-8')
  const checksum = sha256hex(body)
  const id = randomUUID()

  await db.begin(async (tx: any) => {
    // Clean up partial record from a previous crash (finished_at = NULL).
    await tx`
      DELETE FROM "_prisma_migrations"
      WHERE migration_name = ${name} AND finished_at IS NULL
    `
    await tx`
      INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, applied_steps_count)
      VALUES (${id}, ${checksum}, ${name}, now(), 0)
    `
    // Use simple protocol (unsafe) — required for multi-statement SQL.
    if (body.trim()) {
      await tx.unsafe(body)
    }
    await tx`
      UPDATE "_prisma_migrations"
      SET finished_at = now(), applied_steps_count = 1
      WHERE id = ${id}
    `
  })
}

async function connectWithRetry(url: string, retries: number): Promise<SQL> {
  let last: unknown
  for (let attempt = 1; attempt <= retries; attempt++) {
    let db: SQL | null = null
    try {
      db = new SQL(url, { max: 1 })
      await db.unsafe(LOCK_ACQUIRE)
      return db
    } catch (err) {
      last = err
      if (db) {
        try {
          await db.close()
        } catch {}
      }
      if (attempt < retries) {
        console.warn(`  DB not ready (attempt ${attempt}/${retries}), retry in ${RETRY_DELAY_MS}ms…`)
        await Bun.sleep(RETRY_DELAY_MS)
      }
    }
  }
  throw last
}

/**
 * Run all pending migrations against the target database.
 *
 * Acquires a PostgreSQL advisory lock so concurrent instances (rolling deploy)
 * serialize safely — only one runs migrations, others wait then see "up to date".
 *
 * @throws if DB is unreachable after all retries, or if a migration SQL fails.
 */
export async function runMigrations(options?: MigrateOptions): Promise<void> {
  const url = options?.databaseUrl ?? process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL

  if (!url) {
    throw new Error('DATABASE_URL is not set — provide MIGRATE_DATABASE_URL or DATABASE_URL')
  }

  const migrationsDir = options?.migrationsDir ?? process.env.MIGRATIONS_DIR ?? './prisma/migrations'

  const retries = options?.retries ?? parseInt(process.env.MIGRATE_DB_RETRIES ?? '5', 10)

  const log = options?.onLog ?? ((line: string) => console.log(line))
  const warn = options?.onLog ?? ((line: string) => console.warn(line))

  log('→ Acquiring advisory lock…')
  const db = await connectWithRetry(url, retries)

  try {
    await ensureTable(db)

    const applied = await getApplied(db)
    const all = await listMigrations(migrationsDir)

    if (all.length === 0) {
      log(`✓ No migration files found in ${migrationsDir}`)
      return
    }

    // Drift detection: warn if a previously-applied file was modified on disk.
    for (const name of all) {
      const stored = applied.get(name)
      if (stored) {
        const body = await readFile(join(migrationsDir, name, 'migration.sql'), 'utf-8')
        const current = sha256hex(body)
        if (current !== stored) {
          warn(`  ⚠ Checksum mismatch: ${name}`)
          warn(`    Stored:  ${stored}`)
          warn(`    Current: ${current}`)
        }
      }
    }

    const pending = all.filter((n) => !applied.has(n))

    if (pending.length === 0) {
      log('✓ Database up to date')
      return
    }

    log(`→ Applying ${pending.length} migration(s):`)
    for (const name of pending) {
      const t0 = Date.now()
      await applyMigration(db, migrationsDir, name)
      log(`  ${name} … OK (${Date.now() - t0}ms)`)
    }
    log('✓ Done')
  } finally {
    await db.unsafe(LOCK_RELEASE)
    await db.close()
  }
}
