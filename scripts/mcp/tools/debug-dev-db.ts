import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { prisma } from '../../../src/lib/db'
import { ok } from './debug-dev-helpers'

export function registerDbTools(server: McpServer): void {
  server.registerTool(
    'db_count_by_table',
    {
      title: 'Table row counts',
      description: 'Row counts for each primary table di DB local',
      inputSchema: {},
    },
    async () => {
      const [users, sessions, auditLogs, activeSessions, blockedUsers, projects, environments, envVars, tickets] =
        await Promise.all([
          prisma.user.count(),
          prisma.session.count(),
          prisma.auditLog.count(),
          prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
          prisma.user.count({ where: { blocked: true } }),
          prisma.project.count(),
          prisma.environment.count(),
          prisma.envVar.count(),
          prisma.ticket.count(),
        ])
      return ok({ users, sessions, auditLogs, activeSessions, blockedUsers, projects, environments, envVars, tickets })
    },
  )

  server.registerTool(
    'db_list_users',
    {
      title: 'List users',
      description: 'List users di DB local dengan filter role/blocked/search',
      inputSchema: {
        role: z.enum(['USER', 'ADMIN', 'SUPER_ADMIN']).optional(),
        blocked: z.boolean().optional(),
        limit: z.number().int().min(1).max(500).default(50),
        search: z.string().optional().describe('Substring match on name or email'),
      },
    },
    async ({ role, blocked, limit, search }) => {
      const where: Record<string, unknown> = {}
      if (role) where.role = role
      if (typeof blocked === 'boolean') where.blocked = blocked
      if (search) where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
      const users = await prisma.user.findMany({
        where, take: limit, orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, email: true, role: true, blocked: true, createdAt: true },
      })
      return ok({ count: users.length, users })
    },
  )

  server.registerTool(
    'db_get_user',
    {
      title: 'Get user',
      description: 'Fetch a single user by id or email, including active session count',
      inputSchema: {
        id: z.string().optional(),
        email: z.string().email().optional(),
      },
    },
    async ({ id, email }) => {
      if (!id && !email) return ok({ error: 'Provide id or email' })
      const user = await prisma.user.findFirst({
        where: id ? { id } : { email },
        include: { _count: { select: { sessions: true } } },
      })
      if (!user) return ok({ user: null })
      const { password, _count, ...safe } = user
      return ok({ user: { ...safe, sessionCount: _count.sessions } })
    },
  )

  server.registerTool(
    'db_list_sessions',
    {
      title: 'List sessions',
      description: 'List sessions local dengan filter',
      inputSchema: {
        userId: z.string().optional(),
        active: z.boolean().optional().describe('true = not expired, false = expired'),
        limit: z.number().int().min(1).max(500).default(50),
      },
    },
    async ({ userId, active, limit }) => {
      const where: Record<string, unknown> = {}
      if (userId) where.userId = userId
      if (typeof active === 'boolean') where.expiresAt = active ? { gt: new Date() } : { lte: new Date() }
      const sessions = await prisma.session.findMany({
        where, take: limit, orderBy: { createdAt: 'desc' },
        include: { user: { select: { email: true, role: true } } },
      })
      return ok({
        count: sessions.length,
        sessions: sessions.map((s) => ({
          id: s.id,
          token: `${s.token.slice(0, 8)}…`,
          userId: s.userId,
          userEmail: s.user.email,
          userRole: s.user.role,
          createdAt: s.createdAt,
          expiresAt: s.expiresAt,
          isExpired: s.expiresAt < new Date(),
        })),
      })
    },
  )
}
