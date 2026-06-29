import { Elysia } from 'elysia'
import { forbidden, requireSuperAdmin } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'
import { getOnlineUserIds } from '../../lib/presence'

export const analyticsDataRouter = new Elysia()

  .get('/api/admin/test-coverage', async ({ request, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return forbidden(set)

    const fs = await import('node:fs')
    const pathMod = await import('node:path')
    const root = process.cwd()
    const exts = new Set(['.ts', '.tsx'])
    const skipDirs = new Set(['node_modules', 'dist', 'generated', '.git'])

    interface SrcFile { path: string; lines: number; exports: string[]; testedBy: string[]; coverage: string }
    interface TestFile { path: string; lines: number; type: string; targets: string[] }

    function scanDir(dir: string, collect: string[]) {
      const abs = pathMod.join(root, dir)
      if (!fs.existsSync(abs)) return
      for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
        if (skipDirs.has(entry.name)) continue
        const rel = pathMod.join(dir, entry.name).replace(/\\/g, '/')
        if (entry.isDirectory()) scanDir(rel, collect)
        else if (exts.has(pathMod.extname(entry.name))) collect.push(rel)
      }
    }

    const srcPaths: string[] = []
    scanDir('src', srcPaths)
    const srcFiltered = srcPaths.filter((f) => !f.includes('routeTree.gen'))

    const testPaths: string[] = []
    scanDir('tests', testPaths)
    const testFiltered = testPaths.filter((f) => f.includes('.test.'))

    const testFiles: TestFile[] = testFiltered.map((tp) => {
      const content = fs.readFileSync(pathMod.join(root, tp), 'utf-8')
      const lines = content.split('\n').length
      const type = tp.includes('/unit/') ? 'unit' : tp.includes('/integration/') ? 'integration' : 'other'
      const targets: string[] = []
      for (const m of content.matchAll(/from\s+['"]([^'"]*(?:src|lib)[^'"]*)['"]/g)) {
        let resolved = m[1].replace(/^.*?src\//, 'src/')
        if (resolved.startsWith('.')) {
          resolved = pathMod.normalize(pathMod.join(pathMod.dirname(tp), resolved)).replace(/\\/g, '/')
        }
        for (const ext of ['', '.ts', '.tsx']) {
          const full = resolved + ext
          if (srcFiltered.includes(full)) { targets.push(full); break }
        }
      }
      if (/fetch\(['"`]\/api\//.test(content) || /createApp|createTestApp/.test(content)) {
        if (!targets.includes('src/app.ts')) targets.push('src/app.ts')
      }
      return { path: tp, lines, type, targets: [...new Set(targets)] }
    })

    const testedByMap: Record<string, string[]> = {}
    for (const t of testFiles) {
      for (const target of t.targets) {
        if (!testedByMap[target]) testedByMap[target] = []
        testedByMap[target].push(t.path)
      }
    }

    const sourceFiles: SrcFile[] = srcFiltered.map((sp) => {
      const content = fs.readFileSync(pathMod.join(root, sp), 'utf-8')
      const lines = content.split('\n').length
      const exports: string[] = []
      for (const m of content.matchAll(
        /export\s+(?:default\s+)?(?:function|const|let|var|class|type|interface|enum)\s+(\w+)/g,
      )) {
        exports.push(m[1])
      }
      const tb = testedByMap[sp] || []
      const coverage = tb.length === 0 ? 'uncovered' : tb.some((t) => t.includes('/unit/')) ? 'covered' : 'partial'
      return { path: sp, lines, exports, testedBy: tb, coverage }
    })

    const covered = sourceFiles.filter((f) => f.coverage === 'covered').length
    const partial = sourceFiles.filter((f) => f.coverage === 'partial').length
    const uncovered = sourceFiles.filter((f) => f.coverage === 'uncovered').length

    return {
      sourceFiles,
      testFiles,
      summary: {
        totalSource: sourceFiles.length,
        totalTests: testFiles.length,
        covered,
        partial,
        uncovered,
        coveragePercent: Math.round(((covered + partial * 0.5) / sourceFiles.length) * 100),
      },
    }
  })

  .get('/api/admin/migrations', async ({ request, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return forbidden(set)

    const fs = await import('node:fs')
    const pathMod = await import('node:path')
    const root = process.cwd()
    const migrationsDir = pathMod.join(root, 'prisma/migrations')

    if (!fs.existsSync(migrationsDir)) {
      return {
        migrations: [],
        summary: { totalMigrations: 0, firstMigration: null, lastMigration: null, totalChanges: 0 },
      }
    }

    const entries = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^\d{14}_/.test(e.name))
      .sort((a, b) => a.name.localeCompare(b.name))

    const migrations = entries.map((entry) => {
      const sqlPath = pathMod.join(migrationsDir, entry.name, 'migration.sql')
      let sql = ''
      const changes: string[] = []
      if (fs.existsSync(sqlPath)) {
        sql = fs.readFileSync(sqlPath, 'utf-8')
        for (const m of sql.matchAll(
          /^(CREATE TABLE|ALTER TABLE|CREATE INDEX|CREATE UNIQUE INDEX|DROP TABLE|DROP INDEX|CREATE TYPE|ALTER TYPE)\s+["']?(\w+)["']?/gim,
        )) {
          changes.push(`${m[1]} ${m[2]}`)
        }
        for (const m of sql.matchAll(/CREATE TYPE\s+"(\w+)"/g)) {
          if (!changes.some((c) => c.includes(m[1]))) changes.push(`CREATE TYPE ${m[1]}`)
        }
      }
      const dateStr = entry.name.substring(0, 14)
      const createdAt = new Date(
        `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T${dateStr.slice(8, 10)}:${dateStr.slice(10, 12)}:${dateStr.slice(12, 14)}.000Z`,
      ).toISOString()
      return { name: entry.name.substring(15), folder: entry.name, createdAt, changes, sql: sql.substring(0, 800) }
    })

    const totalChanges = migrations.reduce((s, m) => s + m.changes.length, 0)
    return {
      migrations,
      summary: {
        totalMigrations: migrations.length,
        firstMigration: migrations[0]?.createdAt || null,
        lastMigration: migrations[migrations.length - 1]?.createdAt || null,
        totalChanges,
      },
    }
  })

  .get('/api/admin/sessions', async ({ request, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return forbidden(set)

    const onlineIds = new Set(getOnlineUserIds())
    const sessions = await prisma.session.findMany({
      include: { user: { select: { id: true, name: true, email: true, role: true, blocked: true, image: true } } },
      orderBy: { createdAt: 'desc' },
    })

    const now = new Date()
    const result = sessions.map((s) => ({
      id: s.id,
      userId: s.user.id,
      userName: s.user.name,
      userEmail: s.user.email,
      userRole: s.user.role,
      userBlocked: s.user.blocked,
      isOnline: onlineIds.has(s.user.id),
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      isExpired: s.expiresAt < now,
    }))

    const byRole: Record<string, number> = {}
    const uniqueUsers = new Set<string>()
    let active = 0, expired = 0
    for (const s of result) {
      uniqueUsers.add(s.userId)
      byRole[s.userRole] = (byRole[s.userRole] || 0) + 1
      if (s.isExpired) expired++
      else active++
    }

    return {
      sessions: result,
      summary: {
        totalSessions: result.length,
        activeSessions: active,
        expiredSessions: expired,
        onlineUsers: onlineIds.size,
        byRole,
      },
    }
  })
