import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { prisma } from './db'
import { env } from './env'

function getIp(ctx: { request?: Request } | null): string {
  if (!ctx?.request) return 'unknown'
  return (
    ctx.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    ctx.request.headers.get('x-real-ip') ??
    'unknown'
  )
}

function audit(userId: string | null, action: string, detail: string | null, ip: string) {
  prisma.auditLog.create({ data: { userId, action, detail, ip } }).catch(() => {})
}

// Trusted origins = baseURL origin + optional extras dari env
const trustedOrigins: string[] = [env.BETTER_AUTH_URL]
if (env.BETTER_AUTH_TRUSTED_ORIGINS) {
  trustedOrigins.push(
    ...env.BETTER_AUTH_TRUSTED_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  )
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins,

  advanced: {
    // Set nama cookie session secara eksplisit jadi "session" (kompatibel dengan existing frontend)
    cookies: {
      session_token: {
        name: 'session',
        attributes: {
          httpOnly: true,
          sameSite: 'lax' as const,
          secure: env.NODE_ENV === 'production',
          path: '/',
          maxAge: 60 * 60 * 24, // 24 jam
        },
      },
    },
    disableCSRFCheck: true,
  },

  session: {
    expiresIn: 60 * 60 * 24, // 24 jam
    updateAge: 60 * 60, // refresh token setiap 1 jam jika aktif
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // cache session di cookie selama 5 menit
    },
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
    // Pakai bcrypt (Bun.password) supaya kompatibel dengan data user existing
    password: {
      hash: (password: string) => Bun.password.hash(password, { algorithm: 'bcrypt' }),
      verify: ({ hash, password }: { hash: string; password: string }) => Bun.password.verify(password, hash),
    },
  },

  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },

  databaseHooks: {
    session: {
      create: {
        // Cek blocked user sebelum session dibuat → return false = session tidak jadi dibuat
        before: async (session, _ctx) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId as string },
            select: { blocked: true, role: true, email: true },
          })
          if (!user || user.blocked) {
            return false
          }
          return
        },
        // Audit log LOGIN setelah session berhasil dibuat
        after: async (session, ctx) => {
          const ip = getIp(ctx)
          const user = await prisma.user.findUnique({
            where: { id: session.userId as string },
            select: { email: true, role: true },
          })
          if (user) {
            audit(session.userId as string, 'LOGIN', `via better-auth (${user.role})`, ip)
          }
        },
      },
      delete: {
        // Audit log LOGOUT saat session dihapus
        after: async (session, ctx) => {
          const ip = getIp(ctx)
          audit(session.userId as string, 'LOGOUT', null, ip)
        },
      },
    },
    user: {
      create: {
        // Auto-promote ke SUPER_ADMIN jika email ada di SUPER_ADMIN_EMAILS
        after: async (user) => {
          if (
            env.SUPER_ADMIN_EMAILS.length > 0 &&
            env.SUPER_ADMIN_EMAILS.includes(user.email as string) &&
            (user as any).role !== 'SUPER_ADMIN'
          ) {
            await prisma.user.update({
              where: { id: user.id as string },
              data: { role: 'SUPER_ADMIN' },
            })
          }
        },
      },
    },
  },

  user: {
    // Map field additionalFields agar better-auth tahu tentang custom fields
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'USER',
        input: false,
      },
      blocked: {
        type: 'boolean',
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
})

export type Auth = typeof auth
