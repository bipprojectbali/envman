import { Elysia } from 'elysia'
import { forbidden, requireSuperAdmin } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'
import { getOnlineUserIds } from '../../lib/presence'

export const analyticsInspectRouter = new Elysia()

  .get('/api/admin/env-map', async ({ request, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return forbidden(set)

    const fs = await import('node:fs')
    const path = await import('node:path')
    const root = process.cwd()

    const envDefs: {
      name: string
      envKey: string
      required: boolean
      default: string | null
      category: string
      description: string
    }[] = [
      {
        name: 'DATABASE_URL',
        envKey: 'DATABASE_URL',
        required: true,
        default: null,
        category: 'database',
        description: 'PostgreSQL connection string',
      },
      {
        name: 'REDIS_URL',
        envKey: 'REDIS_URL',
        required: true,
        default: null,
        category: 'cache',
        description: 'Redis connection string',
      },
      {
        name: 'GOOGLE_CLIENT_ID',
        envKey: 'GOOGLE_CLIENT_ID',
        required: true,
        default: null,
        category: 'auth',
        description: 'Google OAuth client ID',
      },
      {
        name: 'GOOGLE_CLIENT_SECRET',
        envKey: 'GOOGLE_CLIENT_SECRET',
        required: true,
        default: null,
        category: 'auth',
        description: 'Google OAuth client secret',
      },
      {
        name: 'SUPER_ADMIN_EMAIL',
        envKey: 'SUPER_ADMIN_EMAIL',
        required: false,
        default: '(empty)',
        category: 'auth',
        description: 'Comma-separated emails to auto-promote to SUPER_ADMIN',
      },
      {
        name: 'PORT',
        envKey: 'PORT',
        required: false,
        default: '3000',
        category: 'app',
        description: 'Server port',
      },
      {
        name: 'NODE_ENV',
        envKey: 'NODE_ENV',
        required: false,
        default: 'development',
        category: 'app',
        description: 'Environment mode',
      },
      {
        name: 'REACT_EDITOR',
        envKey: 'REACT_EDITOR',
        required: false,
        default: 'code',
        category: 'app',
        description: 'Editor for click-to-source',
      },
      {
        name: 'AUDIT_LOG_RETENTION_DAYS',
        envKey: 'AUDIT_LOG_RETENTION_DAYS',
        required: false,
        default: '90',
        category: 'app',
        description: 'Days to keep audit logs',
      },
    ]

    const srcFiles = [
      'src/lib/env.ts',
      'src/lib/db.ts',
      'src/lib/redis.ts',
      'src/lib/applog.ts',
      'src/app.ts',
      'src/index.tsx',
      'src/vite.ts',
    ]
    const fileContents: Record<string, string> = {}
    for (const f of srcFiles) {
      const absPath = path.join(root, f)
      if (fs.existsSync(absPath)) fileContents[f] = fs.readFileSync(absPath, 'utf-8')
    }

    const variables = envDefs.map((def) => {
      const usedBy: string[] = []
      for (const [file, content] of Object.entries(fileContents)) {
        if (content.includes(def.envKey) || content.includes(`env.${def.name}`)) {
          usedBy.push(file)
        }
      }
      return {
        name: def.name,
        required: def.required,
        isSet: !!process.env[def.envKey],
        default: def.default,
        category: def.category,
        description: def.description,
        usedBy,
      }
    })

    const byCategory: Record<string, number> = {}
    let setCount = 0
    let requiredCount = 0
    for (const v of variables) {
      byCategory[v.category] = (byCategory[v.category] || 0) + 1
      if (v.isSet) setCount++
      if (v.required) requiredCount++
    }

    return {
      variables,
      summary: {
        total: variables.length,
        set: setCount,
        unset: variables.length - setCount,
        required: requiredCount,
        byCategory,
      },
    }
  })

  .get('/api/admin/test-coverage', async ({ request, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return forbidden(set)

    const fs = await import('node:fs')
    const pathMod = await import('node:path')
    const root = process.cwd()
    const exts = new Set(['.ts', '.tsx'])
    const skipDirs = new Set(['node_modules', 'dist', 'generated', '.git'])

    interface SrcFile {
      path: string
      lines: number
      exports: string[]
      testedBy: string[]
      coverage: string
    }
    interface TestFile {
      path: string
      lines: number
      type: string
      targets: string[]
    }

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
          if (srcFiltered.includes(full)) {
            targets.push(full)
            break
          }
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

  .get('/api/admin/dependencies', async ({ request, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return forbidden(set)

    const fs = await import('node:fs')
    const pathMod = await import('node:path')
    const root = process.cwd()
    const pkgPath = pathMod.join(root, 'package.json')
    if (!fs.existsSync(pkgPath)) {
      set.status = 404
      return { error: 'package.json not found' }
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    const deps: Record<string, string> = pkg.dependencies || {}
    const devDeps: Record<string, string> = pkg.devDependencies || {}

    const catMap: Record<string, string> = {
      elysia: 'server',
      '@elysiajs/cors': 'server',
      '@elysiajs/html': 'server',
      react: 'ui',
      'react-dom': 'ui',
      '@mantine/core': 'ui',
      '@mantine/hooks': 'ui',
      '@tanstack/react-router': 'ui',
      '@tanstack/react-query': 'ui',
      '@xyflow/react': 'ui',
      'react-icons': 'ui',
      '@prisma/client': 'database',
      prisma: 'database',
      vite: 'build',
      typescript: 'build',
      '@biomejs/biome': 'build',
      '@vitejs/plugin-react': 'build',
      '@tanstack/router-plugin': 'build',
    }

    const srcFiles: string[] = []
    function scanSrc(dir: string) {
      const abs = pathMod.join(root, dir)
      if (!fs.existsSync(abs)) return
      for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
        if (['node_modules', 'dist', 'generated', '.git'].includes(e.name)) continue
        const rel = pathMod.join(dir, e.name).replace(/\\/g, '/')
        if (e.isDirectory()) scanSrc(rel)
        else if (/\.(ts|tsx)$/.test(e.name)) srcFiles.push(rel)
      }
    }
    scanSrc('src')

    const fileContents: Record<string, string> = {}
    for (const f of srcFiles) {
      fileContents[f] = fs.readFileSync(pathMod.join(root, f), 'utf-8')
    }

    const allPkgs: { name: string; version: string; type: string; category: string; usedBy: string[] }[] = []

    for (const [name, version] of Object.entries(deps)) {
      const usedBy: string[] = []
      const importPattern = new RegExp(`from\\s+['"]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      for (const [file, content] of Object.entries(fileContents)) {
        if (importPattern.test(content)) usedBy.push(file)
      }
      allPkgs.push({ name, version, type: 'runtime', category: catMap[name] || 'other', usedBy })
    }

    for (const [name, version] of Object.entries(devDeps)) {
      allPkgs.push({ name, version, type: 'dev', category: catMap[name] || 'build', usedBy: [] })
    }

    const byCategory: Record<string, number> = {}
    let runtime = 0,
      dev = 0
    for (const p of allPkgs) {
      byCategory[p.category] = (byCategory[p.category] || 0) + 1
      if (p.type === 'runtime') runtime++
      else dev++
    }

    return {
      packages: allPkgs,
      summary: { total: allPkgs.length, runtime, dev, byCategory },
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

      const name = entry.name.substring(15)

      return { name, folder: entry.name, createdAt, changes, sql: sql.substring(0, 800) }
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
    let active = 0,
      expired = 0
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
