import { prisma } from '../src/lib/db'
import { createApp } from '../src/app'
import { auth } from '../src/lib/auth'

export { prisma }

export function createTestApp() {
  const app = createApp()
  return app
}

/** Create a test user via better-auth (creates both user + account records), returns the user record */
export async function seedTestUser(email = 'test@example.com', password = 'test123', name = 'Test User', role: 'USER' | 'ADMIN' | 'SUPER_ADMIN' = 'USER') {
  // Sign up via better-auth to ensure account record is created (password stored in account table)
  await auth.api.signUpEmail({ body: { email, password, name } }).catch(() => {})
  // Update role if needed (better-auth always creates USER role)
  return prisma.user.update({ where: { email }, data: { role } })
}

/** Create a session for a user via better-auth, returns the signed session token */
export async function createTestSession(userId: string, expiresAt?: Date) {
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

/** Clean up test data */
export async function cleanupTestData() {
  await prisma.session.deleteMany()
  await prisma.account.deleteMany()
  await prisma.portainerConfig.deleteMany()
  await prisma.portainerConnection.deleteMany()
  await prisma.apiToken.deleteMany()
  await prisma.projectMember.deleteMany()
  await prisma.envVar.deleteMany()
  await prisma.environment.deleteMany()
  await prisma.project.deleteMany()
  await prisma.user.deleteMany()
}
