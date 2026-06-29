import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { prisma } from '../../../src/lib/db'
import { ok } from './debug-dev-helpers'

const CLAUDE_EMAIL = 'claude@mcp.local'

async function getOrCreateClaudeUser() {
  const existing = await prisma.user.findUnique({ where: { email: CLAUDE_EMAIL } })
  if (existing) return existing
  const hashed = await Bun.password.hash(crypto.randomUUID())
  return prisma.user.create({
    data: { email: CLAUDE_EMAIL, name: 'Claude (MCP)', password: hashed, role: 'ADMIN' },
  })
}

export function registerTicketTools(server: McpServer): void {
  server.registerTool(
    'ticket_list',
    {
      title: 'List tickets',
      description: 'List tickets local. Default: OPEN + IN_PROGRESS + REOPENED (active only).',
      inputSchema: {
        status: z.enum(['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED', 'ACTIVE', 'ALL']).default('ACTIVE'),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
        assigneeId: z.string().optional(),
        mine: z.boolean().default(false).describe('Only tickets assigned to Claude MCP user'),
        limit: z.number().int().min(1).max(200).default(50),
      },
    },
    async ({ status, priority, assigneeId, mine, limit }) => {
      const where: Record<string, unknown> = {}
      if (status === 'ACTIVE') where.status = { in: ['OPEN', 'IN_PROGRESS', 'REOPENED', 'READY_FOR_QC'] }
      else if (status !== 'ALL') where.status = status
      if (priority) where.priority = priority
      if (assigneeId) where.assigneeId = assigneeId
      if (mine) { const claude = await getOrCreateClaudeUser(); where.assigneeId = claude.id }
      const tickets = await prisma.ticket.findMany({
        where,
        include: {
          reporter: { select: { id: true, name: true, email: true } },
          assignee: { select: { id: true, name: true, email: true } },
          _count: { select: { comments: true, evidence: true } },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        take: limit,
      })
      return ok({ count: tickets.length, tickets })
    },
  )

  server.registerTool(
    'ticket_get',
    {
      title: 'Get ticket',
      description: 'Fetch full ticket dengan comments dan evidence',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const ticket = await prisma.ticket.findUnique({
        where: { id },
        include: {
          reporter: { select: { id: true, name: true, email: true, role: true } },
          assignee: { select: { id: true, name: true, email: true, role: true } },
          comments: { include: { author: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'asc' } },
          evidence: { orderBy: { createdAt: 'asc' } },
        },
      })
      if (!ticket) return ok({ error: 'Ticket not found' })
      return ok({ ticket })
    },
  )

  server.registerTool(
    'ticket_create',
    {
      title: 'Create ticket',
      description: 'Create a new ticket. Reporter defaults to Claude MCP user.',
      inputSchema: {
        title: z.string().min(1),
        description: z.string().min(1),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
        route: z.string().optional(),
        reporterEmail: z.string().email().optional(),
        assigneeEmail: z.string().email().optional(),
      },
    },
    async ({ title, description, priority, route, reporterEmail, assigneeEmail }) => {
      const reporter = reporterEmail
        ? await prisma.user.findUnique({ where: { email: reporterEmail } })
        : await getOrCreateClaudeUser()
      if (!reporter) return ok({ error: `Reporter not found: ${reporterEmail}` })
      let assigneeId: string | null = null
      if (assigneeEmail) {
        const assignee = await prisma.user.findUnique({ where: { email: assigneeEmail } })
        if (!assignee) return ok({ error: `Assignee not found: ${assigneeEmail}` })
        assigneeId = assignee.id
      }
      const ticket = await prisma.ticket.create({
        data: { title, description, priority, route: route ?? null, reporterId: reporter.id, assigneeId },
      })
      return ok({ ok: true, ticket })
    },
  )

  server.registerTool(
    'ticket_claim',
    {
      title: 'Claim ticket',
      description: 'Assign ticket to Claude MCP user and move status to IN_PROGRESS',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const ticket = await prisma.ticket.findUnique({ where: { id } })
      if (!ticket) return ok({ error: 'Ticket not found' })
      if (!['OPEN', 'REOPENED'].includes(ticket.status)) return ok({ error: `Cannot claim ticket in status ${ticket.status}` })
      const claude = await getOrCreateClaudeUser()
      const updated = await prisma.ticket.update({ where: { id }, data: { assigneeId: claude.id, status: 'IN_PROGRESS' } })
      return ok({ ok: true, ticket: updated })
    },
  )

  server.registerTool(
    'ticket_comment',
    {
      title: 'Comment on ticket',
      description: 'Add a comment to a ticket as Claude (MCP)',
      inputSchema: { id: z.string(), body: z.string().min(1) },
    },
    async ({ id, body }) => {
      const ticket = await prisma.ticket.findUnique({ where: { id }, select: { id: true } })
      if (!ticket) return ok({ error: 'Ticket not found' })
      const claude = await getOrCreateClaudeUser()
      const comment = await prisma.ticketComment.create({
        data: { ticketId: id, authorId: claude.id, authorTag: 'CLAUDE', body },
      })
      return ok({ ok: true, comment })
    },
  )

  server.registerTool(
    'ticket_add_evidence',
    {
      title: 'Attach evidence',
      description: 'Attach evidence: screenshot path, commit hash, test log URL, or Playwright trace.',
      inputSchema: {
        id: z.string(),
        kind: z.enum(['screenshot', 'commit', 'test_log', 'trace', 'other']),
        url: z.string().min(1),
        note: z.string().optional(),
      },
    },
    async ({ id, kind, url, note }) => {
      const ticket = await prisma.ticket.findUnique({ where: { id }, select: { id: true } })
      if (!ticket) return ok({ error: 'Ticket not found' })
      const evidence = await prisma.ticketEvidence.create({ data: { ticketId: id, kind, url, note: note ?? null } })
      return ok({ ok: true, evidence })
    },
  )

  server.registerTool(
    'ticket_ready_for_qc',
    {
      title: 'Mark ready for QC',
      description: 'Move ticket to READY_FOR_QC with a summary comment',
      inputSchema: {
        id: z.string(),
        summary: z.string().min(1),
        commitHash: z.string().optional(),
        testLog: z.string().optional(),
      },
    },
    async ({ id, summary, commitHash, testLog }) => {
      const ticket = await prisma.ticket.findUnique({ where: { id } })
      if (!ticket) return ok({ error: 'Ticket not found' })
      if (!['IN_PROGRESS', 'REOPENED'].includes(ticket.status)) {
        return ok({ error: `Can only mark READY_FOR_QC from IN_PROGRESS or REOPENED (current: ${ticket.status})` })
      }
      const claude = await getOrCreateClaudeUser()
      const [updated, comment] = await prisma.$transaction([
        prisma.ticket.update({ where: { id }, data: { status: 'READY_FOR_QC' } }),
        prisma.ticketComment.create({ data: { ticketId: id, authorId: claude.id, authorTag: 'CLAUDE', body: summary } }),
      ])
      const evidence = []
      if (commitHash) evidence.push(await prisma.ticketEvidence.create({ data: { ticketId: id, kind: 'commit', url: commitHash, note: 'Fix commit' } }))
      if (testLog) evidence.push(await prisma.ticketEvidence.create({ data: { ticketId: id, kind: 'test_log', url: testLog, note: 'Playwright verification' } }))
      return ok({ ok: true, ticket: updated, comment, evidence })
    },
  )

  server.registerTool(
    'ticket_close',
    {
      title: 'Close ticket (QC)',
      description: 'Close a ticket. Typically used from READY_FOR_QC after verification.',
      inputSchema: { id: z.string(), comment: z.string().optional() },
    },
    async ({ id, comment }) => {
      const ticket = await prisma.ticket.findUnique({ where: { id } })
      if (!ticket) return ok({ error: 'Ticket not found' })
      if (ticket.status === 'CLOSED') return ok({ error: 'Ticket already closed' })
      const claude = await getOrCreateClaudeUser()
      const updated = await prisma.ticket.update({ where: { id }, data: { status: 'CLOSED', closedAt: new Date() } })
      if (comment) await prisma.ticketComment.create({ data: { ticketId: id, authorId: claude.id, authorTag: 'CLAUDE', body: comment } })
      return ok({ ok: true, ticket: updated })
    },
  )

  server.registerTool(
    'ticket_reopen',
    {
      title: 'Reopen ticket',
      description: 'Reopen a CLOSED or READY_FOR_QC ticket',
      inputSchema: { id: z.string(), reason: z.string().min(1) },
    },
    async ({ id, reason }) => {
      const ticket = await prisma.ticket.findUnique({ where: { id } })
      if (!ticket) return ok({ error: 'Ticket not found' })
      if (!['READY_FOR_QC', 'CLOSED'].includes(ticket.status)) return ok({ error: `Cannot reopen from status ${ticket.status}` })
      const claude = await getOrCreateClaudeUser()
      const [updated] = await prisma.$transaction([
        prisma.ticket.update({ where: { id }, data: { status: 'REOPENED', closedAt: null } }),
        prisma.ticketComment.create({ data: { ticketId: id, authorId: claude.id, authorTag: 'CLAUDE', body: `Reopened: ${reason}` } }),
      ])
      return ok({ ok: true, ticket: updated })
    },
  )

  server.registerTool(
    'ticket_update',
    {
      title: 'Update ticket',
      description: 'Update title, description, priority, route, or assignee.',
      inputSchema: {
        id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
        route: z.string().optional(),
        assigneeEmail: z.string().email().nullable().optional(),
      },
    },
    async ({ id, title, description, priority, route, assigneeEmail }) => {
      const ticket = await prisma.ticket.findUnique({ where: { id } })
      if (!ticket) return ok({ error: 'Ticket not found' })
      const data: Record<string, unknown> = {}
      if (title !== undefined) data.title = title
      if (description !== undefined) data.description = description
      if (priority !== undefined) data.priority = priority
      if (route !== undefined) data.route = route
      if (assigneeEmail !== undefined) {
        if (assigneeEmail === null) {
          data.assigneeId = null
        } else {
          const assignee = await prisma.user.findUnique({ where: { email: assigneeEmail } })
          if (!assignee) return ok({ error: `Assignee not found: ${assigneeEmail}` })
          data.assigneeId = assignee.id
        }
      }
      if (Object.keys(data).length === 0) return ok({ error: 'No fields to update' })
      const updated = await prisma.ticket.update({ where: { id }, data })
      return ok({ ok: true, ticket: updated })
    },
  )
}
