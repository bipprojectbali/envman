import { z } from 'zod'
import { appLog } from '../../../src/lib/applog'
import { prisma } from '../../../src/lib/db'
import { jsonText, type ToolModule } from './shared'
import { runMigrations } from '../../../src/lib/migrate'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SQL } from 'bun'

async function audit(userId: string | null, action: string, detail: string | null) {
  await prisma.auditLog.create({ data: { userId, action, detail, ip: 'mcp' } }).catch(() => {})
}

export const adminTools: ToolModule = {
  name: 'admin',
  scope: 'admin',
  register(server) {
    server.registerTool(
      'admin_set_user_role',
      {
        title: 'Change user role',
        description: 'Set role to USER, QC, or ADMIN. SUPER_ADMIN promotion must be done via env.',
        inputSchema: {
          userId: z.string(),
          role: z.enum(['USER', 'QC', 'ADMIN']),
        },
      },
      async ({ userId, role }) => {
        const user = await prisma.user.findUnique({ where: { id: userId } })
        if (!user) return jsonText({ error: 'User not found' })
        if (user.role === 'SUPER_ADMIN') return jsonText({ error: 'Cannot demote SUPER_ADMIN' })
        const updated = await prisma.user.update({
          where: { id: userId },
          data: { role },
          select: { id: true, email: true, role: true },
        })
        await audit(userId, 'MCP_ROLE_CHANGED', `${user.role} -> ${role}`)
        appLog('info', `MCP: role ${user.email} -> ${role}`)
        return jsonText({ ok: true, user: updated })
      },
    )

    server.registerTool(
      'admin_block_user',
      {
        title: 'Block user',
        description: 'Block a user and revoke all their sessions',
        inputSchema: {
          userId: z.string(),
          reason: z.string().optional(),
        },
      },
      async ({ userId, reason }) => {
        const user = await prisma.user.findUnique({ where: { id: userId } })
        if (!user) return jsonText({ error: 'User not found' })
        await prisma.$transaction([
          prisma.user.update({ where: { id: userId }, data: { blocked: true } }),
          prisma.session.deleteMany({ where: { userId } }),
        ])
        await audit(userId, 'MCP_BLOCKED', reason ?? null)
        appLog('warn', `MCP: blocked ${user.email}`, reason)
        return jsonText({ ok: true, userId })
      },
    )

    server.registerTool(
      'admin_unblock_user',
      {
        title: 'Unblock user',
        description: 'Remove the blocked flag from a user',
        inputSchema: { userId: z.string() },
      },
      async ({ userId }) => {
        const user = await prisma.user.findUnique({ where: { id: userId } })
        if (!user) return jsonText({ error: 'User not found' })
        await prisma.user.update({ where: { id: userId }, data: { blocked: false } })
        await audit(userId, 'MCP_UNBLOCKED', null)
        appLog('info', `MCP: unblocked ${user.email}`)
        return jsonText({ ok: true, userId })
      },
    )

    server.registerTool(
      'admin_revoke_sessions',
      {
        title: 'Revoke user sessions',
        description: 'Delete all sessions for a user (force logout everywhere)',
        inputSchema: { userId: z.string() },
      },
      async ({ userId }) => {
        const { count } = await prisma.session.deleteMany({ where: { userId } })
        await audit(userId, 'MCP_SESSIONS_REVOKED', `count: ${count}`)
        appLog('info', `MCP: revoked ${count} sessions for ${userId}`)
        return jsonText({ ok: true, revoked: count })
      },
    )

    server.registerTool(
      'admin_create_user',
      {
        title: 'Create user',
        description: 'Create a new user with hashed password',
        inputSchema: {
          name: z.string().min(1),
          email: z.string().email(),
          password: z.string().min(6),
          role: z.enum(['USER', 'QC', 'ADMIN']).default('USER'),
        },
      },
      async ({ name, email, password, role }) => {
        const existing = await prisma.user.findUnique({ where: { email } })
        if (existing) return jsonText({ error: 'Email already registered' })
        const hashed = await Bun.password.hash(password)
        const user = await prisma.user.create({
          data: { name, email, password: hashed, role },
          select: { id: true, name: true, email: true, role: true, createdAt: true },
        })
        await audit(user.id, 'MCP_USER_CREATED', `role: ${role}`)
        appLog('info', `MCP: created user ${email} (${role})`)
        return jsonText({ ok: true, user })
      },
    )

    server.registerTool(
      'admin_reset_password',
      {
        title: 'Reset password',
        description: 'Reset a user password (requires the new password). Revokes all sessions.',
        inputSchema: {
          userId: z.string(),
          newPassword: z.string().min(6),
          revokeSessions: z.boolean().default(true),
        },
      },
      async ({ userId, newPassword, revokeSessions }) => {
        const user = await prisma.user.findUnique({ where: { id: userId } })
        if (!user) return jsonText({ error: 'User not found' })
        const hashed = await Bun.password.hash(newPassword)
        await prisma.user.update({ where: { id: userId }, data: { password: hashed } })
        let revoked = 0
        if (revokeSessions) {
          const { count } = await prisma.session.deleteMany({ where: { userId } })
          revoked = count
        }
        await audit(userId, 'MCP_PASSWORD_RESET', `sessions revoked: ${revoked}`)
        appLog('warn', `MCP: password reset for ${user.email}`)
        return jsonText({ ok: true, userId, sessionsRevoked: revoked })
      },
    )

    // ─── Migration tools ───────────────────────────────────────────────────────

    server.registerTool(
      'migrate_status',
      {
        title: 'Migration status',
        description: 'List all applied migrations from _prisma_migrations with timestamps.',
        annotations: { readOnlyHint: true },
        inputSchema: {},
      },
      async () => {
        const db = new SQL(process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL!, { max: 1 })
        try {
          const rows = await db`
            SELECT migration_name, finished_at, started_at
            FROM "_prisma_migrations"
            ORDER BY started_at
          `
          return jsonText({
            total: rows.length,
            migrations: rows.map((r: any) => ({
              name: r.migration_name,
              appliedAt: r.finished_at,
              ok: r.finished_at !== null,
            })),
          })
        } finally {
          await db.close()
        }
      },
    )

    server.registerTool(
      'migrate_run',
      {
        title: 'Run migrations',
        description: 'Trigger runMigrations() on demand — applies any pending migrations without restarting the server.',
        annotations: { destructiveHint: false },
        inputSchema: {},
      },
      async () => {
        const logs: string[] = []
        const t0 = Date.now()
        try {
          await runMigrations({ onLog: line => logs.push(line) })
          return jsonText({ ok: true, durationMs: Date.now() - t0, logs })
        } catch (err: any) {
          logs.push(`✗ ${err?.message ?? String(err)}`)
          return jsonText({ ok: false, durationMs: Date.now() - t0, logs })
        }
      },
    )

    server.registerTool(
      'migrate_simulate',
      {
        title: 'Simulate migration',
        description: 'Full end-to-end migration test: writes a temp migration, applies it, verifies the table was created, then cleans up everything. Proves the migration mechanism works without any real schema change.',
        annotations: { destructiveHint: false },
        inputSchema: {},
      },
      async () => {
        const SIM_NAME = '99999999999999_migrate_sim_test'
        const SIM_DIR = `./prisma/migrations/${SIM_NAME}`
        const SIM_SQL = `CREATE TABLE IF NOT EXISTS "_migrate_sim_test" (id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now());`
        const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL!
        const logs: string[] = []
        const t0 = Date.now()

        const cleanup = async () => {
          await rm(SIM_DIR, { recursive: true, force: true }).catch(() => {})
          const db = new SQL(url, { max: 1 })
          try {
            await db.unsafe('DROP TABLE IF EXISTS "_migrate_sim_test"')
            await db`DELETE FROM "_prisma_migrations" WHERE migration_name = ${SIM_NAME}`
          } finally { await db.close() }
        }

        try {
          await cleanup()
          logs.push('✓ Cleaned up any previous sim state')
          await mkdir(SIM_DIR, { recursive: true })
          await writeFile(join(SIM_DIR, 'migration.sql'), SIM_SQL)
          logs.push(`✓ Wrote temp migration: ${SIM_NAME}`)
          await runMigrations({ onLog: line => logs.push(line) })
          const db = new SQL(url, { max: 1 })
          let verified = false
          try {
            const rows = await db`SELECT COUNT(*) as c FROM information_schema.tables WHERE table_name = '_migrate_sim_test'`
            verified = Number(rows[0]?.c) > 0
          } finally { await db.close() }
          logs.push(verified ? '✓ Verified: _migrate_sim_test table exists' : '✗ Table not found after apply')
          await cleanup()
          logs.push('✓ Cleanup complete — DB restored to original state')
          return jsonText({ ok: verified, durationMs: Date.now() - t0, logs })
        } catch (err: any) {
          logs.push(`✗ Simulation failed: ${err?.message ?? String(err)}`)
          await cleanup().catch(() => {})
          return jsonText({ ok: false, durationMs: Date.now() - t0, logs })
        }
      },
    )
  },
}
