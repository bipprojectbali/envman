import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { prisma } from '../../../src/lib/db'
import { ok } from './debug-dev-helpers'

export function registerAdminTools(server: McpServer): void {
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
      if (!user) return ok({ error: 'User not found' })
      if (user.role === 'SUPER_ADMIN') return ok({ error: 'Cannot demote SUPER_ADMIN' })
      const updated = await prisma.user.update({
        where: { id: userId }, data: { role },
        select: { id: true, email: true, role: true },
      })
      await prisma.auditLog.create({ data: { userId, action: 'ROLE_CHANGED', detail: `${user.role} -> ${role}`, ip: 'mcp-dev' } }).catch(() => {})
      return ok({ ok: true, user: updated })
    },
  )

  server.registerTool(
    'admin_block_user',
    {
      title: 'Block user',
      description: 'Block a user and revoke all their sessions',
      inputSchema: { userId: z.string(), reason: z.string().optional() },
    },
    async ({ userId, reason }) => {
      const user = await prisma.user.findUnique({ where: { id: userId } })
      if (!user) return ok({ error: 'User not found' })
      await prisma.$transaction([
        prisma.user.update({ where: { id: userId }, data: { blocked: true } }),
        prisma.session.deleteMany({ where: { userId } }),
      ])
      await prisma.auditLog.create({ data: { userId, action: 'BLOCKED', detail: reason ?? null, ip: 'mcp-dev' } }).catch(() => {})
      return ok({ ok: true, userId })
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
      if (!user) return ok({ error: 'User not found' })
      await prisma.user.update({ where: { id: userId }, data: { blocked: false } })
      await prisma.auditLog.create({ data: { userId, action: 'UNBLOCKED', detail: null, ip: 'mcp-dev' } }).catch(() => {})
      return ok({ ok: true, userId })
    },
  )

  server.registerTool(
    'admin_revoke_sessions',
    {
      title: 'Revoke all sessions',
      description: 'Delete all sessions for a user (force logout everywhere)',
      inputSchema: { userId: z.string() },
    },
    async ({ userId }) => {
      const result = await prisma.session.deleteMany({ where: { userId } })
      return ok({ ok: true, revoked: result.count })
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
      if (existing) return ok({ error: 'Email already taken' })
      const hashed = await Bun.password.hash(password)
      const user = await prisma.user.create({
        data: { name, email, password: hashed, role },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      })
      return ok({ ok: true, user })
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
      if (!user) return ok({ error: 'User not found' })
      const hashed = await Bun.password.hash(newPassword)
      await prisma.user.update({ where: { id: userId }, data: { password: hashed } })
      if (revokeSessions) await prisma.session.deleteMany({ where: { userId } })
      return ok({ ok: true, userId, sessionRevoked: revokeSessions })
    },
  )
}
