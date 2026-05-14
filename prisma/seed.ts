/**
 * Development seeder — comprehensive sample data untuk semua case di /envmanager.
 *
 * GUARD: HANYA berjalan di NODE_ENV=development.
 *
 * Yang di-seed:
 * - Users dengan berbagai role + capability (SUPER_ADMIN, ADMIN dengan/tanpa capability, USER, QC, blocked)
 * - Projects (15+) dengan tags & environments
 * - Env vars (regular + secret) per environment
 * - ProjectMember + EnvironmentMember (inherit / override / denied)
 * - ApiTokens (scope-limited & full)
 * - Gists (public & private dengan berbagai language)
 * - ProjectNotes (pinned & regular)
 * - PortainerConnection + PortainerConfig
 * - Tickets dengan berbagai status & priority
 *
 * Flags:
 *   --reset           Truncate semua tabel dulu sebelum seed (hard reset)
 *   --skip-tickets    Skip seed tickets
 *   --skip-portainer  Skip seed Portainer connection/config
 */

import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { encryptSecret, hasMasterKey } from '../src/lib/crypto'

// ─── Guard: development only ─────────────────────────────────────────────────

if (process.env.NODE_ENV === 'production') {
  console.error('❌ Seeder REFUSED to run in production. Set NODE_ENV=development to seed.')
  process.exit(1)
}

if (process.env.NODE_ENV !== 'development' && !process.env.ALLOW_SEED_IN_NON_DEV) {
  console.error('❌ NODE_ENV bukan "development". Set NODE_ENV=development (atau ALLOW_SEED_IN_NON_DEV=1 untuk override staging).')
  process.exit(1)
}

const args = new Set(process.argv.slice(2))
const RESET = args.has('--reset')
const SKIP_TICKETS = args.has('--skip-tickets')
const SKIP_PORTAINER = args.has('--skip-portainer')

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  }),
})

// ─── Logger helpers ──────────────────────────────────────────────────────────

const log = {
  step: (msg: string) => console.log(`\n▸ ${msg}`),
  ok: (msg: string) => console.log(`  ✓ ${msg}`),
  info: (msg: string) => console.log(`    ${msg}`),
  warn: (msg: string) => console.warn(`  ⚠ ${msg}`),
}

// ─── User dataset ────────────────────────────────────────────────────────────
//
// Catatan model collaboration:
// - ADMIN tidak punya hak default — capabilities di-grant explicit
// - "admin-lead" = ADMIN dengan semua capability (helper utama SUPER_ADMIN)
// - "admin-junior" = ADMIN tanpa capability (default state)
// - "admin-portainer" = ADMIN dengan akses Portainer saja
// - USER untuk anggota project biasa

const ALL_CAPS = [
  'project:create', 'ticket:create', 'gist:create', 'token:create', 'note:create',
  'menu:overview', 'menu:tokens', 'menu:connections', 'menu:gists',
  'connection:view', 'stack:operate', 'stack:mutate', 'stack:prune',
]

const USERS = [
  // SUPER_ADMIN
  { email: 'superadmin@example.com', name: 'Super Admin', password: 'superadmin123', role: 'SUPER_ADMIN' as const, permissions: [], blocked: false },

  // ADMIN — workspace lead (semua capability)
  { email: 'admin@example.com', name: 'Admin Lead', password: 'admin123', role: 'ADMIN' as const, permissions: ALL_CAPS, blocked: false },

  // ADMIN — Portainer specialist (hanya capability connection + stack)
  { email: 'devops@example.com', name: 'DevOps Engineer', password: 'devops123', role: 'ADMIN' as const,
    permissions: ['menu:overview', 'menu:connections', 'connection:view', 'stack:operate', 'stack:mutate', 'stack:prune', 'menu:tokens', 'token:create'],
    blocked: false },

  // ADMIN — project creator (hanya bisa create project, env stuff, no infra)
  { email: 'pm@example.com', name: 'Project Manager', password: 'pm123', role: 'ADMIN' as const,
    permissions: ['menu:overview', 'project:create', 'note:create', 'gist:create', 'menu:gists'],
    blocked: false },

  // ADMIN — junior (default — no capabilities, sesuai model collaboration strict)
  { email: 'junior@example.com', name: 'Junior Admin', password: 'junior123', role: 'ADMIN' as const,
    permissions: [],
    blocked: false },

  // ADMIN — blocked (test block state)
  { email: 'blocked@example.com', name: 'Blocked Admin', password: 'blocked123', role: 'ADMIN' as const,
    permissions: ALL_CAPS,
    blocked: true },

  // QC
  { email: 'qc@example.com', name: 'QC Tester', password: 'qc123', role: 'QC' as const, permissions: [], blocked: false },

  // USER — regular contributor (jadi project member)
  { email: 'user@example.com', name: 'Regular User', password: 'user123', role: 'USER' as const, permissions: [], blocked: false },
  { email: 'alice@example.com', name: 'Alice Frontend', password: 'alice123', role: 'USER' as const, permissions: [], blocked: false },
  { email: 'bob@example.com', name: 'Bob Backend', password: 'bob123', role: 'USER' as const, permissions: [], blocked: false },
  { email: 'charlie@example.com', name: 'Charlie Designer', password: 'charlie123', role: 'USER' as const, permissions: [], blocked: false },
  { email: 'dave@example.com', name: 'Dave Mobile', password: 'dave123', role: 'USER' as const, permissions: [], blocked: false },
  { email: 'eve@example.com', name: 'Eve Data', password: 'eve123', role: 'USER' as const, permissions: [], blocked: false },
]

// ─── Project dataset ─────────────────────────────────────────────────────────

const PROJECTS = [
  {
    slug: 'web-app',
    name: 'Web App (Production)',
    description: 'Customer-facing web application — Next.js + PostgreSQL',
    tags: ['frontend', 'production', 'critical'],
    environments: ['development', 'staging', 'production'],
  },
  {
    slug: 'api-gateway',
    name: 'API Gateway',
    description: 'GraphQL gateway, rate limiting, auth proxy',
    tags: ['backend', 'production', 'critical'],
    environments: ['dev', 'staging', 'production'],
  },
  {
    slug: 'mobile-app',
    name: 'Mobile App',
    description: 'React Native iOS + Android client',
    tags: ['frontend', 'mobile'],
    environments: ['dev', 'production'],
  },
  {
    slug: 'admin-panel',
    name: 'Admin Panel',
    description: 'Internal tools dashboard',
    tags: ['internal', 'frontend'],
    environments: ['dev', 'production'],
  },
  {
    slug: 'payment-service',
    name: 'Payment Service',
    description: 'Stripe + Midtrans integration. SENSITIVE.',
    tags: ['backend', 'critical', 'pci'],
    environments: ['development', 'staging', 'production'],
  },
  {
    slug: 'analytics',
    name: 'Analytics Pipeline',
    description: 'ETL + BigQuery + dashboards',
    tags: ['data', 'backend'],
    environments: ['dev', 'production'],
  },
  {
    slug: 'ml-inference',
    name: 'ML Inference Service',
    description: 'Recommendation engine — PyTorch + FastAPI',
    tags: ['ml', 'experimental'],
    environments: ['dev', 'staging'],
  },
  {
    slug: 'notification',
    name: 'Notification Service',
    description: 'Email, SMS, push notification dispatcher',
    tags: ['backend', 'shared'],
    environments: ['dev', 'production'],
  },
  {
    slug: 'cms',
    name: 'CMS Backoffice',
    description: 'Content management — Strapi',
    tags: ['internal', 'cms'],
    environments: ['dev', 'production'],
  },
  {
    slug: 'docs-site',
    name: 'Docs Site',
    description: 'Public documentation — Nextra',
    tags: ['docs', 'public'],
    environments: ['production'],
  },
  {
    slug: 'blog',
    name: 'Marketing Blog',
    description: 'Marketing & company blog',
    tags: ['marketing', 'public'],
    environments: ['staging', 'production'],
  },
  {
    slug: 'experiments',
    name: 'Experiments Sandbox',
    description: 'Prototype playground, ephemeral data',
    tags: ['experimental', 'sandbox'],
    environments: ['dev'],
  },
  {
    slug: 'legacy-php',
    name: 'Legacy PHP App',
    description: 'Old PHP system, scheduled for retirement Q3',
    tags: ['legacy', 'deprecated'],
    environments: ['production'],
  },
  {
    slug: 'monitoring',
    name: 'Monitoring Stack',
    description: 'Prometheus + Grafana + Loki',
    tags: ['internal', 'infra'],
    environments: ['production'],
  },
  {
    slug: 'cdn-proxy',
    name: 'CDN Edge Worker',
    description: 'Cloudflare Worker untuk routing & cache',
    tags: ['edge', 'infra', 'critical'],
    environments: ['production'],
  },
]

// ─── Env vars template per kategori ─────────────────────────────────────────

function generateVarsForEnv(projectSlug: string, envName: string): { key: string; value: string; isSecret: boolean }[] {
  const isProd = envName.includes('prod')
  const isStaging = envName.includes('stag')
  const envSuffix = isProd ? 'prod' : isStaging ? 'staging' : 'dev'

  const base = [
    { key: 'NODE_ENV', value: envName, isSecret: false },
    { key: 'APP_NAME', value: projectSlug, isSecret: false },
    { key: 'PORT', value: isProd ? '3000' : '4000', isSecret: false },
    { key: 'LOG_LEVEL', value: isProd ? 'warn' : 'debug', isSecret: false },
    { key: 'DATABASE_URL', value: `postgresql://user:pass@${envSuffix}-db.internal:5432/${projectSlug}`, isSecret: true },
    { key: 'REDIS_URL', value: `redis://${envSuffix}-redis.internal:6379`, isSecret: true },
    { key: 'JWT_SECRET', value: `jwt-${envSuffix}-${Math.random().toString(36).slice(2, 18)}`, isSecret: true },
    { key: 'API_BASE_URL', value: isProd ? `https://api.example.com` : `https://api-${envSuffix}.example.com`, isSecret: false },
  ]

  // Project-specific vars
  if (projectSlug === 'payment-service') {
    base.push(
      { key: 'STRIPE_SECRET_KEY', value: `sk_${envSuffix}_${Math.random().toString(36).slice(2, 32)}`, isSecret: true },
      { key: 'STRIPE_WEBHOOK_SECRET', value: `whsec_${Math.random().toString(36).slice(2, 32)}`, isSecret: true },
      { key: 'MIDTRANS_SERVER_KEY', value: `Mid-server-${Math.random().toString(36).slice(2, 24)}`, isSecret: true },
      { key: 'STRIPE_PUBLISHABLE_KEY', value: `pk_${envSuffix}_${Math.random().toString(36).slice(2, 24)}`, isSecret: false },
    )
  }
  if (projectSlug === 'api-gateway' || projectSlug === 'web-app') {
    base.push(
      { key: 'NEXT_PUBLIC_APP_URL', value: isProd ? 'https://app.example.com' : `https://${envSuffix}.example.com`, isSecret: false },
      { key: 'GOOGLE_OAUTH_CLIENT_ID', value: `${Math.random().toString(36).slice(2, 22)}.apps.googleusercontent.com`, isSecret: false },
      { key: 'GOOGLE_OAUTH_CLIENT_SECRET', value: `GOCSPX-${Math.random().toString(36).slice(2, 28)}`, isSecret: true },
    )
  }
  if (projectSlug === 'analytics' || projectSlug === 'ml-inference') {
    base.push(
      { key: 'GCP_PROJECT_ID', value: `myorg-${envSuffix}`, isSecret: false },
      { key: 'GCP_SERVICE_ACCOUNT_KEY', value: `{"type":"service_account","project_id":"myorg-${envSuffix}",...}`, isSecret: true },
      { key: 'BIGQUERY_DATASET', value: `analytics_${envSuffix}`, isSecret: false },
    )
  }
  if (projectSlug === 'notification') {
    base.push(
      { key: 'SENDGRID_API_KEY', value: `SG.${Math.random().toString(36).slice(2, 32)}`, isSecret: true },
      { key: 'TWILIO_AUTH_TOKEN', value: Math.random().toString(36).slice(2, 34), isSecret: true },
      { key: 'FCM_SERVER_KEY', value: `AAAA${Math.random().toString(36).slice(2, 32)}`, isSecret: true },
    )
  }

  // Disabled var contoh (untuk test toggle)
  if (isStaging) {
    base.push({ key: 'FEATURE_EXPERIMENTAL', value: 'true', isSecret: false })
  }

  return base
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function hashPassword(plain: string): Promise<string> {
  return Bun.password.hash(plain, { algorithm: 'bcrypt' })
}

function pick<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, n)
}

// ─── Reset ───────────────────────────────────────────────────────────────────

async function resetAll() {
  log.step('Reset: truncating all tables...')
  // Reverse FK order (children → parents)
  const tables = [
    'ticket_evidence', 'ticket_comment', 'env_var',
    'portainer_sync_log', 'portainer_stack_target', 'portainer_config',
    'environment_member', 'environment', 'project_member', 'project_note',
    'ticket', 'project', 'portainer_connection',
    'api_token', 'gist', 'session', 'account', 'audit_log', 'verification',
    'user',
  ]
  for (const t of tables) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${t}" CASCADE`)
  }
  log.ok(`Truncated ${tables.length} tables`)
}

// ─── Seed users ──────────────────────────────────────────────────────────────

async function seedUsers() {
  log.step('Users')
  const userMap = new Map<string, { id: string; email: string; role: string }>()
  for (const u of USERS) {
    const hashed = await hashPassword(u.password)
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, password: hashed, role: u.role, permissions: u.permissions, blocked: u.blocked },
      create: { name: u.name, email: u.email, password: hashed, role: u.role, permissions: u.permissions, blocked: u.blocked },
    })
    userMap.set(u.email, { id: user.id, email: user.email, role: user.role })
    const blockedTag = u.blocked ? ' [BLOCKED]' : ''
    const capCount = u.permissions.length > 0 ? ` · ${u.permissions.length} caps` : ''
    log.ok(`${u.email} (${u.role})${capCount}${blockedTag}`)
  }
  return userMap
}

// ─── Seed projects + environments + vars ─────────────────────────────────────

async function seedProjects(userMap: Map<string, { id: string; email: string; role: string }>) {
  log.step('Projects + Environments + Env Vars')
  const projectMap = new Map<string, { id: string; slug: string; envIds: Map<string, string> }>()
  const adminLead = userMap.get('admin@example.com')!
  const pm = userMap.get('pm@example.com')!

  if (!hasMasterKey()) {
    log.warn('MASTER_KEY tidak set — env vars secret akan disimpan plaintext.')
  }

  for (const p of PROJECTS) {
    const project = await prisma.project.upsert({
      where: { slug: p.slug },
      update: { name: p.name, description: p.description, tags: p.tags },
      create: { slug: p.slug, name: p.name, description: p.description, tags: p.tags },
    })

    // Default OWNER: rotate antara admin@ dan pm@ supaya distribusi
    const defaultOwner = PROJECTS.indexOf(p) % 2 === 0 ? adminLead : pm
    await prisma.projectMember.upsert({
      where: { userId_projectId: { userId: defaultOwner.id, projectId: project.id } },
      update: { role: 'OWNER' },
      create: { userId: defaultOwner.id, projectId: project.id, role: 'OWNER' },
    })

    const envIds = new Map<string, string>()
    for (const envName of p.environments) {
      const env = await prisma.environment.upsert({
        where: { projectId_name: { projectId: project.id, name: envName } },
        update: {},
        create: { name: envName, projectId: project.id },
      })
      envIds.set(envName, env.id)

      // Seed env vars
      const vars = generateVarsForEnv(p.slug, envName)
      for (const v of vars) {
        const stored = v.isSecret && hasMasterKey() ? encryptSecret(v.value) : v.value
        await prisma.envVar.upsert({
          where: { environmentId_key: { environmentId: env.id, key: v.key } },
          update: { value: stored, isSecret: v.isSecret },
          create: { key: v.key, value: stored, isSecret: v.isSecret, environmentId: env.id },
        })
      }

      // Toggle disabled untuk staging "FEATURE_EXPERIMENTAL"
      if (envName.includes('stag')) {
        await prisma.envVar.updateMany({
          where: { environmentId: env.id, key: 'FEATURE_EXPERIMENTAL' },
          data: { isDisabled: true },
        })
      }
    }

    projectMap.set(p.slug, { id: project.id, slug: p.slug, envIds })
    log.ok(`${p.slug} (${p.environments.length} env, ${p.tags.length} tags)`)
  }

  return projectMap
}

// ─── Seed project members + env overrides ────────────────────────────────────

async function seedMembershipsAndOverrides(
  userMap: Map<string, { id: string; email: string; role: string }>,
  projectMap: Map<string, { id: string; slug: string; envIds: Map<string, string> }>,
) {
  log.step('ProjectMember & EnvironmentMember (access matrix)')

  const u = (email: string) => userMap.get(email)!
  const p = (slug: string) => projectMap.get(slug)!

  // Pattern: user A → project AA → various env access (sesuai contoh user)
  const memberships: { user: string; project: string; role: 'OWNER' | 'EDITOR' | 'VIEWER' }[] = [
    // alice (frontend) — punya akses ke web-app, mobile, blog
    { user: 'alice@example.com', project: 'web-app', role: 'EDITOR' },
    { user: 'alice@example.com', project: 'mobile-app', role: 'OWNER' },
    { user: 'alice@example.com', project: 'blog', role: 'EDITOR' },
    { user: 'alice@example.com', project: 'docs-site', role: 'VIEWER' },

    // bob (backend) — punya akses ke api-gateway, payment, notification, analytics
    { user: 'bob@example.com', project: 'api-gateway', role: 'OWNER' },
    { user: 'bob@example.com', project: 'payment-service', role: 'EDITOR' },
    { user: 'bob@example.com', project: 'notification', role: 'OWNER' },
    { user: 'bob@example.com', project: 'analytics', role: 'EDITOR' },
    { user: 'bob@example.com', project: 'web-app', role: 'VIEWER' },

    // charlie (designer) — limited access
    { user: 'charlie@example.com', project: 'web-app', role: 'VIEWER' },
    { user: 'charlie@example.com', project: 'mobile-app', role: 'VIEWER' },
    { user: 'charlie@example.com', project: 'docs-site', role: 'EDITOR' },

    // dave (mobile) — focus mobile
    { user: 'dave@example.com', project: 'mobile-app', role: 'EDITOR' },
    { user: 'dave@example.com', project: 'api-gateway', role: 'VIEWER' },
    { user: 'dave@example.com', project: 'notification', role: 'EDITOR' },

    // eve (data) — analytics + ml
    { user: 'eve@example.com', project: 'analytics', role: 'OWNER' },
    { user: 'eve@example.com', project: 'ml-inference', role: 'OWNER' },
    { user: 'eve@example.com', project: 'web-app', role: 'VIEWER' },

    // user@ (regular) — limited
    { user: 'user@example.com', project: 'experiments', role: 'OWNER' },
    { user: 'user@example.com', project: 'docs-site', role: 'VIEWER' },

    // devops (admin) — limited project, focus infra (Portainer di project lain)
    { user: 'devops@example.com', project: 'monitoring', role: 'OWNER' },
    { user: 'devops@example.com', project: 'cdn-proxy', role: 'OWNER' },
    { user: 'devops@example.com', project: 'legacy-php', role: 'OWNER' },

    // junior — TIDAK punya project membership (sesuai model strict)
  ]

  let memberCount = 0
  for (const m of memberships) {
    const user = u(m.user)
    const proj = p(m.project)
    await prisma.projectMember.upsert({
      where: { userId_projectId: { userId: user.id, projectId: proj.id } },
      update: { role: m.role },
      create: { userId: user.id, projectId: proj.id, role: m.role },
    })
    memberCount++
  }
  log.ok(`${memberCount} project memberships`)

  // EnvironmentMember overrides — beberapa contoh untuk demo access matrix
  type EnvOverride = { user: string; project: string; env: string; role: 'OWNER' | 'EDITOR' | 'VIEWER' | null }
  const envOverrides: EnvOverride[] = [
    // bob EDITOR di payment-service, tapi production di-DENY (terlalu sensitif)
    { user: 'bob@example.com', project: 'payment-service', env: 'production', role: null },

    // alice EDITOR di web-app, tapi production VIEWER (downgrade)
    { user: 'alice@example.com', project: 'web-app', env: 'production', role: 'VIEWER' },

    // dave VIEWER di api-gateway, tapi dev di-naikkan jadi EDITOR
    { user: 'dave@example.com', project: 'api-gateway', env: 'dev', role: 'EDITOR' },

    // charlie (designer) VIEWER di mobile-app, dev di-naikkan EDITOR
    { user: 'charlie@example.com', project: 'mobile-app', env: 'dev', role: 'EDITOR' },

    // eve OWNER di analytics, tapi production di-deny (read-only via override null saja akan jadi OWNER inherit, jadi pakai EDITOR)
    { user: 'eve@example.com', project: 'analytics', env: 'production', role: 'EDITOR' },

    // env-only access: user@ tidak member api-gateway, tapi diberi VIEWER di dev saja
    // (memerlukan dia DULU jadi non-member, lalu tambah EnvironmentMember)
    { user: 'user@example.com', project: 'api-gateway', env: 'dev', role: 'VIEWER' },
  ]

  let overrideCount = 0
  for (const o of envOverrides) {
    const user = u(o.user)
    const proj = p(o.project)
    const envId = proj.envIds.get(o.env)
    if (!envId) {
      log.warn(`Env ${o.env} tidak ada di project ${o.project}, skip override`)
      continue
    }
    await prisma.environmentMember.upsert({
      where: { userId_environmentId: { userId: user.id, environmentId: envId } },
      update: { role: o.role },
      create: { userId: user.id, environmentId: envId, role: o.role },
    })
    overrideCount++
  }
  log.ok(`${overrideCount} env-level overrides`)
  log.info('Contoh: bob @ payment-service:production = DENIED, alice @ web-app:production = VIEWER (downgrade)')
}

// ─── Seed API tokens ─────────────────────────────────────────────────────────

async function seedTokens(userMap: Map<string, { id: string; email: string; role: string }>) {
  log.step('API Tokens')
  const existingCount = await prisma.apiToken.count()
  if (existingCount > 0 && !RESET) {
    log.info(`Skip — ${existingCount} token sudah ada. Pakai --reset untuk re-seed.`)
    return
  }
  const tokens = [
    { user: 'admin@example.com', name: 'CI/CD deploy', scopes: [], canWrite: true },
    { user: 'admin@example.com', name: 'Local CLI', scopes: [], canWrite: true },
    { user: 'bob@example.com', name: 'Read-only audit', scopes: ['api-gateway:*'], canWrite: false },
    { user: 'bob@example.com', name: 'Bob deploy script', scopes: ['payment-service:dev', 'payment-service:staging', 'notification:*'], canWrite: true },
    { user: 'eve@example.com', name: 'Analytics dump (expired)', scopes: ['analytics:*'], canWrite: false, expired: true },
    { user: 'alice@example.com', name: 'Mobile dev', scopes: ['mobile-app:dev'], canWrite: true },
  ]

  let count = 0
  for (const t of tokens) {
    const user = userMap.get(t.user)!
    const expiresAt = t.expired
      ? new Date(Date.now() - 24 * 60 * 60 * 1000) // expired yesterday
      : null
    const token = `em_${crypto.randomUUID().replace(/-/g, '')}`
    await prisma.apiToken.upsert({
      where: { token }, // token unique — kalau exist by chance, skip
      update: {},
      create: {
        userId: user.id,
        name: t.name,
        token,
        scopes: t.scopes,
        canWrite: t.canWrite,
        expiresAt,
      },
    }).catch(() => {})
    count++
  }
  log.ok(`${count} API tokens`)
}

// ─── Seed gists ──────────────────────────────────────────────────────────────

async function seedGists(userMap: Map<string, { id: string; email: string; role: string }>) {
  log.step('Gists')
  const existingCount = await prisma.gist.count()
  if (existingCount > 0 && !RESET) {
    log.info(`Skip — ${existingCount} gist sudah ada. Pakai --reset untuk re-seed.`)
    return
  }
  const gists = [
    {
      user: 'admin@example.com', title: 'Postgres dump quick script',
      description: 'Backup DB pakai pg_dump dengan timestamp filename',
      isPublic: true, tags: ['bash', 'postgres', 'backup'],
      files: [{
        filename: 'pg-backup.sh', language: 'bash',
        content: '#!/usr/bin/env bash\nset -euo pipefail\n\nTIMESTAMP=$(date +%Y%m%d-%H%M%S)\npg_dump $DATABASE_URL > "backup-$TIMESTAMP.sql"\necho "Backup tersimpan: backup-$TIMESTAMP.sql"',
      }],
    },
    {
      user: 'bob@example.com', title: 'Prisma transaction example',
      description: 'Atomic update + delete pattern',
      isPublic: true, tags: ['prisma', 'typescript', 'pattern'],
      files: [{
        filename: 'transaction.ts', language: 'typescript',
        content: 'await prisma.$transaction([\n  prisma.user.update({ where: { id }, data: { blocked: true } }),\n  prisma.session.deleteMany({ where: { userId: id } }),\n])',
      }],
    },
    {
      user: 'alice@example.com', title: 'React hooks cheatsheet',
      description: 'Common patterns yang sering dipakai',
      isPublic: false, tags: ['react', 'cheatsheet'],
      files: [
        { filename: 'use-debounce.ts', language: 'typescript', content: 'export function useDebounce<T>(value: T, delay = 300): T {\n  // implementation\n}' },
        { filename: 'use-local-storage.ts', language: 'typescript', content: 'export function useLocalStorage(key: string) {\n  // implementation\n}' },
      ],
    },
    {
      user: 'eve@example.com', title: 'BigQuery cost optimization',
      description: 'Tips untuk reduce slot consumption',
      isPublic: true, tags: ['bigquery', 'sql', 'optimization'],
      files: [{
        filename: 'partition-prune.sql', language: 'sql',
        content: '-- BAD: full table scan\nSELECT COUNT(*) FROM events;\n\n-- GOOD: partition prune\nSELECT COUNT(*) FROM events\nWHERE _PARTITIONTIME >= "2026-01-01";',
      }],
    },
    {
      user: 'devops@example.com', title: 'Docker prune cron',
      description: 'Hapus dangling images & volumes seminggu sekali',
      isPublic: true, tags: ['docker', 'cron', 'devops'],
      files: [{
        filename: 'docker-cleanup.sh', language: 'bash',
        content: '# /etc/cron.weekly/docker-cleanup\ndocker image prune -a -f --filter "until=168h"\ndocker volume prune -f',
      }],
    },
  ]

  let count = 0
  for (const g of gists) {
    const user = userMap.get(g.user)!
    await prisma.gist.create({
      data: {
        userId: user.id,
        title: g.title,
        description: g.description,
        isPublic: g.isPublic,
        tags: g.tags,
        files: g.files,
      },
    })
    count++
  }
  log.ok(`${count} gists (mix public/private, ${gists.flatMap(g => g.files).length} files total)`)
}

// ─── Seed project notes ──────────────────────────────────────────────────────

async function seedNotes(
  userMap: Map<string, { id: string; email: string; role: string }>,
  projectMap: Map<string, { id: string; slug: string; envIds: Map<string, string> }>,
) {
  log.step('Project Notes')
  const existingCount = await prisma.projectNote.count()
  if (existingCount > 0 && !RESET) {
    log.info(`Skip — ${existingCount} note sudah ada. Pakai --reset untuk re-seed.`)
    return
  }
  const notes = [
    {
      project: 'payment-service', author: 'bob@example.com',
      title: 'PCI compliance checklist',
      body: '## Quarterly review\n\n- [ ] Rotate Stripe webhook secret\n- [ ] Audit log retention 90 hari (verify)\n- [ ] No card data in env vars\n- [ ] TLS 1.3 on all endpoints',
      pinned: true, tags: ['compliance', 'security'],
    },
    {
      project: 'web-app', author: 'alice@example.com',
      title: 'Deploy steps (Vercel)',
      body: '1. `vercel --prod`\n2. Wait green check\n3. Smoke test `/health`\n4. Notify #release di Slack',
      pinned: true, tags: ['deploy', 'runbook'],
    },
    {
      project: 'api-gateway', author: 'bob@example.com',
      title: 'Rate limit defaults',
      body: '- Public endpoints: 100/min per IP\n- Authenticated: 1000/min per user\n- Admin endpoints: no limit (internal only)',
      pinned: false, tags: ['config', 'reference'],
    },
    {
      project: 'mobile-app', author: 'dave@example.com',
      title: 'iOS build certs',
      body: '- Distribution cert expires **2026-08-15**\n- Push notification cert expires **2026-12-01**\n- Renew via Apple Developer portal',
      pinned: true, tags: ['ios', 'certs', 'reminder'],
    },
    {
      project: 'monitoring', author: 'devops@example.com',
      title: 'Grafana credentials reset',
      body: 'Jika lupa password admin: `kubectl exec ... grafana-cli admin reset-admin-password newpass`',
      pinned: false, tags: ['grafana', 'recovery'],
    },
    {
      project: 'analytics', author: 'eve@example.com',
      title: 'ETL schedule',
      body: '| Job | Frequency | Owner |\n|-----|-----------|-------|\n| User events | hourly | eve |\n| Daily aggregates | 03:00 UTC | eve |\n| Weekly report | Mon 08:00 | bob |',
      pinned: true, tags: ['etl', 'schedule'],
    },
  ]

  let count = 0
  for (const n of notes) {
    const user = userMap.get(n.author)
    const proj = projectMap.get(n.project)
    if (!user || !proj) continue
    await prisma.projectNote.create({
      data: {
        projectId: proj.id,
        authorId: user.id,
        title: n.title,
        body: n.body,
        pinned: n.pinned,
        tags: n.tags,
      },
    })
    count++
  }
  log.ok(`${count} project notes`)
}

// ─── Seed Portainer ──────────────────────────────────────────────────────────

async function seedPortainer(
  userMap: Map<string, { id: string; email: string; role: string }>,
  projectMap: Map<string, { id: string; slug: string; envIds: Map<string, string> }>,
) {
  log.step('Portainer connections & configs')
  const existingCount = await prisma.portainerConnection.count()
  if (existingCount > 0 && !RESET) {
    log.info(`Skip — ${existingCount} connection sudah ada. Pakai --reset untuk re-seed.`)
    return
  }
  const devops = userMap.get('devops@example.com')!

  const conn1 = await prisma.portainerConnection.create({
    data: {
      name: 'Production K8s (us-east)',
      portainerUrl: 'https://portainer-prod.internal.example.com',
      apiToken: 'ptr_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      createdById: devops.id,
    },
  })

  const conn2 = await prisma.portainerConnection.create({
    data: {
      name: 'Staging Swarm',
      portainerUrl: 'https://portainer-staging.internal.example.com',
      apiToken: 'ptr_yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy',
      createdById: devops.id,
    },
  })

  log.ok(`2 connections (Production K8s, Staging Swarm)`)

  // Per-env Portainer config — link beberapa env ke stack
  const configs = [
    { project: 'web-app', env: 'production', conn: conn1.id, stackId: 1, stackName: 'web-app-prod' },
    { project: 'web-app', env: 'staging', conn: conn2.id, stackId: 2, stackName: 'web-app-staging' },
    { project: 'api-gateway', env: 'production', conn: conn1.id, stackId: 3, stackName: 'api-gateway-prod' },
    { project: 'api-gateway', env: 'staging', conn: conn2.id, stackId: 4, stackName: 'api-gateway-staging' },
    { project: 'payment-service', env: 'production', conn: conn1.id, stackId: 5, stackName: 'payment-prod' },
    { project: 'notification', env: 'production', conn: conn1.id, stackId: 6, stackName: 'notification-prod' },
    { project: 'monitoring', env: 'production', conn: conn1.id, stackId: 7, stackName: 'monitoring-stack' },
  ]

  let cfgCount = 0
  for (const c of configs) {
    const proj = projectMap.get(c.project)!
    await prisma.portainerConfig.create({
      data: {
        projectId: proj.id,
        envName: c.env,
        connectionId: c.conn,
        stackId: c.stackId,
        stackName: c.stackName,
        endpointId: 1,
        autoSync: c.env === 'staging', // staging auto-sync, production manual
      },
    })
    cfgCount++
  }
  log.ok(`${cfgCount} per-env Portainer configs (staging auto-sync, production manual)`)
}

// ─── Seed tickets ────────────────────────────────────────────────────────────

async function seedTickets(userMap: Map<string, { id: string; email: string; role: string }>) {
  log.step('Tickets')
  const existingCount = await prisma.ticket.count()
  if (existingCount > 0 && !RESET) {
    log.info(`Skip — ${existingCount} ticket sudah ada. Pakai --reset untuk re-seed.`)
    return
  }
  const reporter = userMap.get('user@example.com')!
  const qc = userMap.get('qc@example.com')!
  const admin = userMap.get('admin@example.com')!
  const bob = userMap.get('bob@example.com')!

  const tickets = [
    { title: 'Login redirect ke /profile bukan /envmanager untuk ADMIN', description: 'Setelah login ADMIN landing di /profile padahal harusnya /envmanager.', priority: 'HIGH', status: 'OPEN', reporter: reporter.id, assignee: null },
    { title: 'Env vars export tidak mask secret untuk VIEWER', description: 'VIEWER bisa dump plaintext secret via /vars/export endpoint.', priority: 'CRITICAL', status: 'CLOSED', reporter: qc.id, assignee: bob.id },
    { title: 'Tambah capability untuk note:manage', description: 'Saat ini edit/delete note hanya author atau project OWNER. Mau dibuat capability terpisah.', priority: 'LOW', status: 'OPEN', reporter: admin.id, assignee: null },
    { title: 'Mobile bottom tab tidak ada active animation', description: 'Bisa lebih jelas dengan pill indicator atau dot animasi.', priority: 'MEDIUM', status: 'READY_FOR_QC', reporter: reporter.id, assignee: bob.id },
    { title: 'Portainer connection delete tidak validasi configs', description: 'Kalau ada PortainerConfig yang link ke connection, delete tidak warn user.', priority: 'MEDIUM', status: 'IN_PROGRESS', reporter: qc.id, assignee: admin.id },
    { title: 'Drawer Users — Permissions tab terlalu panjang scroll', description: 'Sticky footer kadang ketutup. Sticky behavior perlu diperbaiki di mobile.', priority: 'LOW', status: 'REOPENED', reporter: qc.id, assignee: admin.id },
  ]

  let count = 0
  for (const t of tickets) {
    const ticket = await prisma.ticket.create({
      data: {
        title: t.title,
        description: t.description,
        priority: t.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
        status: t.status as 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED',
        reporterId: t.reporter,
        assigneeId: t.assignee,
        closedAt: t.status === 'CLOSED' ? new Date() : null,
      },
    })

    // Tambah 1-2 comment per ticket
    if (Math.random() > 0.4) {
      await prisma.ticketComment.create({
        data: {
          ticketId: ticket.id,
          authorId: bob.id,
          authorTag: 'Bob Backend',
          body: 'Saya cek dulu masalahnya. Reproduce dulu di staging.',
        },
      })
    }
    count++
  }
  log.ok(`${count} tickets (berbagai status + priority)`)
}

// ─── Main orchestrator ───────────────────────────────────────────────────────

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  Envman Development Seeder')
  console.log(`  NODE_ENV=${process.env.NODE_ENV} · MASTER_KEY=${hasMasterKey() ? 'set' : 'NOT SET (secret plaintext)'}`)
  console.log(`  Flags: ${RESET ? '--reset ' : ''}${SKIP_TICKETS ? '--skip-tickets ' : ''}${SKIP_PORTAINER ? '--skip-portainer ' : ''}`.trim() || '  Flags: (none)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  if (RESET) {
    await resetAll()
  }

  const userMap = await seedUsers()
  const projectMap = await seedProjects(userMap)
  await seedMembershipsAndOverrides(userMap, projectMap)
  await seedTokens(userMap)
  await seedGists(userMap)
  await seedNotes(userMap, projectMap)
  if (!SKIP_PORTAINER) {
    await seedPortainer(userMap, projectMap)
  }
  if (!SKIP_TICKETS) {
    await seedTickets(userMap)
  }

  // Promote super admin emails dari env (preserve existing behavior)
  const superAdminEmails = (process.env.SUPER_ADMIN_EMAIL ?? '').split(',').map(e => e.trim()).filter(Boolean)
  if (superAdminEmails.length > 0) {
    log.step('Promote SUPER_ADMIN dari ENV')
    for (const email of superAdminEmails) {
      const user = await prisma.user.findUnique({ where: { email } })
      if (user && user.role !== 'SUPER_ADMIN') {
        await prisma.user.update({ where: { email }, data: { role: 'SUPER_ADMIN' } })
        log.ok(`Promoted: ${email}`)
      }
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  Seed selesai!')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('\n  Login credentials:')
  console.log('  ───────────────────')
  for (const u of USERS) {
    const tag = u.blocked ? ' [BLOCKED]' : ''
    const caps = u.permissions.length === ALL_CAPS.length ? 'all caps' : u.permissions.length > 0 ? `${u.permissions.length} caps` : 'no caps'
    console.log(`  ${u.email.padEnd(28)} · ${u.password.padEnd(14)} · ${u.role.padEnd(12)} · ${caps}${tag}`)
  }
  console.log()
}

main()
  .catch((e) => {
    console.error('\n❌ Seeder failed:')
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
