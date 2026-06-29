import { Elysia } from 'elysia'
import { forbidden, requireSuperAdmin } from '../../lib/auth-middleware'

export const analyticsInspectRouter = new Elysia()

  .get('/api/admin/env-map', async ({ request, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return forbidden(set)

    const fs = await import('node:fs')
    const path = await import('node:path')
    const root = process.cwd()

    const envDefs: { name: string; envKey: string; required: boolean; default: string | null; category: string; description: string }[] = [
      { name: 'DATABASE_URL', envKey: 'DATABASE_URL', required: true, default: null, category: 'database', description: 'PostgreSQL connection string' },
      { name: 'REDIS_URL', envKey: 'REDIS_URL', required: true, default: null, category: 'cache', description: 'Redis connection string' },
      { name: 'GOOGLE_CLIENT_ID', envKey: 'GOOGLE_CLIENT_ID', required: true, default: null, category: 'auth', description: 'Google OAuth client ID' },
      { name: 'GOOGLE_CLIENT_SECRET', envKey: 'GOOGLE_CLIENT_SECRET', required: true, default: null, category: 'auth', description: 'Google OAuth client secret' },
      { name: 'SUPER_ADMIN_EMAIL', envKey: 'SUPER_ADMIN_EMAIL', required: false, default: '(empty)', category: 'auth', description: 'Comma-separated emails to auto-promote to SUPER_ADMIN' },
      { name: 'PORT', envKey: 'PORT', required: false, default: '3000', category: 'app', description: 'Server port' },
      { name: 'NODE_ENV', envKey: 'NODE_ENV', required: false, default: 'development', category: 'app', description: 'Environment mode' },
      { name: 'REACT_EDITOR', envKey: 'REACT_EDITOR', required: false, default: 'code', category: 'app', description: 'Editor for click-to-source' },
      { name: 'AUDIT_LOG_RETENTION_DAYS', envKey: 'AUDIT_LOG_RETENTION_DAYS', required: false, default: '90', category: 'app', description: 'Days to keep audit logs' },
    ]

    const srcFiles = ['src/lib/env.ts', 'src/lib/db.ts', 'src/lib/redis.ts', 'src/lib/applog.ts', 'src/app.ts', 'src/index.tsx', 'src/vite.ts']
    const fileContents: Record<string, string> = {}
    for (const f of srcFiles) {
      const absPath = path.join(root, f)
      if (fs.existsSync(absPath)) fileContents[f] = fs.readFileSync(absPath, 'utf-8')
    }

    const variables = envDefs.map((def) => {
      const usedBy: string[] = []
      for (const [file, content] of Object.entries(fileContents)) {
        if (content.includes(def.envKey) || content.includes(`env.${def.name}`)) usedBy.push(file)
      }
      return { name: def.name, required: def.required, isSet: !!process.env[def.envKey], default: def.default, category: def.category, description: def.description, usedBy }
    })

    const byCategory: Record<string, number> = {}
    let setCount = 0, requiredCount = 0
    for (const v of variables) {
      byCategory[v.category] = (byCategory[v.category] || 0) + 1
      if (v.isSet) setCount++
      if (v.required) requiredCount++
    }

    return {
      variables,
      summary: { total: variables.length, set: setCount, unset: variables.length - setCount, required: requiredCount, byCategory },
    }
  })

  .get('/api/admin/dependencies', async ({ request, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return forbidden(set)

    const fs = await import('node:fs')
    const pathMod = await import('node:path')
    const root = process.cwd()
    const pkgPath = pathMod.join(root, 'package.json')
    if (!fs.existsSync(pkgPath)) { set.status = 404; return { error: 'package.json not found' } }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    const deps: Record<string, string> = pkg.dependencies || {}
    const devDeps: Record<string, string> = pkg.devDependencies || {}

    const catMap: Record<string, string> = {
      elysia: 'server', '@elysiajs/cors': 'server', '@elysiajs/html': 'server',
      react: 'ui', 'react-dom': 'ui', '@mantine/core': 'ui', '@mantine/hooks': 'ui',
      '@tanstack/react-router': 'ui', '@tanstack/react-query': 'ui', '@xyflow/react': 'ui', 'react-icons': 'ui',
      '@prisma/client': 'database', prisma: 'database',
      vite: 'build', typescript: 'build', '@biomejs/biome': 'build', '@vitejs/plugin-react': 'build', '@tanstack/router-plugin': 'build',
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
    for (const f of srcFiles) fileContents[f] = fs.readFileSync(pathMod.join(root, f), 'utf-8')

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
    let runtime = 0, dev = 0
    for (const p of allPkgs) {
      byCategory[p.category] = (byCategory[p.category] || 0) + 1
      if (p.type === 'runtime') runtime++
      else dev++
    }

    return { packages: allPkgs, summary: { total: allPkgs.length, runtime, dev, byCategory } }
  })
