import { prisma } from '../src/lib/db'
import { createApp } from '../src/app'
import { auth } from '../src/lib/auth'

// ─── Test DB Safety Guard ──────────────────────────────────────────────────
// Mencegah cleanupTestData()/seedTestUser() menghapus data dev/prod tanpa sengaja.
// DATABASE_URL HARUS menunjuk ke database dengan nama yang diakhiri `_test`.
// Setup sekali: `createdb envman_test && DATABASE_URL=postgresql://...envman_test bunx prisma db push`
// Jalankan: `DATABASE_URL='postgresql://.../envman_test' bun test`

function getDbName(url: string): string {
  try {
    return new URL(url).pathname.slice(1).split('?')[0] ?? ''
  } catch {
    return ''
  }
}

const DATABASE_URL = process.env.DATABASE_URL ?? ''
const DB_NAME = getDbName(DATABASE_URL)
const IS_TEST_DB = DB_NAME.endsWith('_test')

function assertTestDb() {
  if (IS_TEST_DB) return
  const safe = DATABASE_URL.replace(/:[^@]*@/, ':***@')
  throw new Error(
    `🛑 REFUSED: DATABASE_URL bukan DB test.\n` +
    `   Database name harus diakhiri "_test" untuk safety — saat ini: "${DB_NAME}".\n` +
    `   Setup test DB:\n` +
    `     createdb ${DB_NAME || 'envman'}_test\n` +
    `     DATABASE_URL='${safe.replace(/\/[^/?]*(\?|$)/, `/${DB_NAME || 'envman'}_test$1`)}' bunx prisma db push\n` +
    `   Jalankan test:\n` +
    `     DATABASE_URL='postgresql://.../${DB_NAME || 'envman'}_test' bun test\n` +
    `   URL saat ini: ${safe}`
  )
}

// Fail-fast saat module di-import oleh test file apapun.
assertTestDb()

export { prisma }

export function createTestApp() {
  const app = createApp()
  return app
}

/** Create a test user via better-auth (creates both user + account records), returns the user record.
 * permissions defaults to all capabilities for ADMIN (preserves pre-capability test behavior).
 * For USER/SUPER_ADMIN defaults to []. SUPER_ADMIN bypasses checks anyway. */
export async function seedTestUser(
  email = 'test@example.com',
  password = 'test123',
  name = 'Test User',
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN' = 'USER',
  permissions?: string[],
) {
  assertTestDb()
  // Sign up via better-auth to ensure account record is created (password stored in account table)
  await auth.api.signUpEmail({ body: { email, password, name } }).catch(() => {})
  // Default: ADMIN gets all capabilities (legacy compatibility); USER gets none.
  // Connection CRUD is SUPER_ADMIN-only (no capability), so excluded here.
  const defaultPerms = role === 'ADMIN'
    ? [
        'project:create', 'ticket:create', 'gist:create', 'token:create', 'note:create',
        'menu:overview', 'menu:tokens', 'menu:connections', 'menu:gists',
        'connection:view', 'stack:operate', 'stack:mutate', 'stack:prune',
      ]
    : []
  const perms = permissions ?? defaultPerms
  return prisma.user.update({ where: { email }, data: { role, permissions: perms } })
}

/** Create a session for a user via better-auth, returns the signed session token */
export async function createTestSession(userId: string, expiresAt?: Date) {
  assertTestDb()
  // Get user email to sign in via better-auth (which creates a proper signed token)
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  if (!user) throw new Error(`User not found: ${userId}`)

  // Create session directly in DB for test simplicity (UUID format).
  // requireAuth() fallback handles UUID tokens via direct DB lookup.
  const token = crypto.randomUUID()
  await prisma.session.create({
    data: {
      token,
      userId,
      expiresAt: expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    },
  })
  return token
}

/** Clean up test data. REFUSES to run unless DATABASE_URL ends in `_test`. */
export async function cleanupTestData() {
  assertTestDb()
  await prisma.session.deleteMany()
  await prisma.account.deleteMany()
  await prisma.portainerConfig.deleteMany()
  await prisma.portainerConnection.deleteMany()
  await prisma.apiToken.deleteMany()
  await prisma.environmentMember.deleteMany()
  await prisma.projectMember.deleteMany()
  await prisma.envVar.deleteMany()
  await prisma.environment.deleteMany()
  await prisma.projectAlias.deleteMany()
  await prisma.projectFile.deleteMany()
  await prisma.project.deleteMany()
  await prisma.testMigrate.deleteMany()
  await prisma.user.deleteMany()
}
