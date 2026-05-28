import { Elysia } from 'elysia'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SQL } from 'bun'
import { requireSuperAdmin, unauthorized, forbidden } from '../../lib/auth-middleware'
import { runMigrations } from '../../lib/migrate'

const SIM_NAME = '99999999999999_migrate_sim_test'
const SIM_DIR = `./prisma/migrations/${SIM_NAME}`
const SIM_SQL = `CREATE TABLE IF NOT EXISTS "_migrate_sim_test" (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now()
);`

function dbUrl() {
  return process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL!
}

export const adminMigrateRouter = new Elysia()

  // GET /api/admin/migrate/status
  // List all migrations from _prisma_migrations with state
  .get('/api/admin/migrate/status', async ({ request, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return caller === null ? forbidden(set) : unauthorized(set)

    const db = new SQL(dbUrl(), { max: 1 })
    try {
      const rows = await db`
        SELECT migration_name, checksum, finished_at, started_at, applied_steps_count
        FROM "_prisma_migrations"
        ORDER BY started_at
      `
      return {
        total: rows.length,
        migrations: rows.map((r: any) => ({
          name: r.migration_name,
          appliedAt: r.finished_at,
          ok: r.finished_at !== null,
        })),
      }
    } catch (err: any) {
      return { error: err.message ?? String(err) }
    } finally {
      await db.close()
    }
  })

  // POST /api/admin/migrate/run
  // Trigger runMigrations() on demand — useful to run without restart
  .post('/api/admin/migrate/run', async ({ request, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return caller === null ? forbidden(set) : unauthorized(set)

    const logs: string[] = []
    const t0 = Date.now()
    try {
      await runMigrations({ onLog: line => logs.push(line) })
      return { ok: true, durationMs: Date.now() - t0, logs }
    } catch (err: any) {
      logs.push(`✗ ${err?.message ?? String(err)}`)
      return { ok: false, durationMs: Date.now() - t0, logs }
    }
  })

  // POST /api/admin/migrate/simulate
  // Full cycle test: write temp migration → apply → verify → cleanup
  // Proves the migration mechanism works end-to-end without any real schema change
  .post('/api/admin/migrate/simulate', async ({ request, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return caller === null ? forbidden(set) : unauthorized(set)

    const logs: string[] = []
    const t0 = Date.now()

    const cleanup = async () => {
      // Remove temp migration folder
      await rm(SIM_DIR, { recursive: true, force: true }).catch(() => {})
      // Drop sim table and remove DB record
      const db = new SQL(dbUrl(), { max: 1 })
      try {
        await db.unsafe('DROP TABLE IF EXISTS "_migrate_sim_test"')
        await db`DELETE FROM "_prisma_migrations" WHERE migration_name = ${SIM_NAME}`
      } finally {
        await db.close()
      }
    }

    try {
      // Step 1: ensure clean state
      await cleanup()
      logs.push('✓ Cleaned up any previous sim state')

      // Step 2: write temp migration to disk
      await mkdir(SIM_DIR, { recursive: true })
      await writeFile(join(SIM_DIR, 'migration.sql'), SIM_SQL)
      logs.push(`✓ Wrote temp migration: ${SIM_NAME}`)

      // Step 3: run migrations — should detect and apply exactly 1
      await runMigrations({ onLog: line => logs.push(line) })

      // Step 4: verify the sim table was created in DB
      const db = new SQL(dbUrl(), { max: 1 })
      let verified = false
      try {
        const rows = await db`
          SELECT COUNT(*) as c FROM information_schema.tables
          WHERE table_name = '_migrate_sim_test'
        `
        verified = Number(rows[0]?.c) > 0
      } finally {
        await db.close()
      }
      logs.push(verified ? '✓ Verified: _migrate_sim_test table exists in DB' : '✗ Table not found after apply')

      // Step 5: cleanup
      await cleanup()
      logs.push('✓ Cleanup complete — DB restored to original state')

      return { ok: verified, durationMs: Date.now() - t0, logs }
    } catch (err: any) {
      logs.push(`✗ Simulation failed: ${err?.message ?? String(err)}`)
      await cleanup().catch(() => {})
      return { ok: false, durationMs: Date.now() - t0, logs }
    }
  })
