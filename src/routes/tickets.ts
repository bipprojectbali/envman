import { Elysia } from 'elysia'
import { appLog } from '../lib/applog'
import { audit } from '../lib/audit'
import { forbidden, requireAuth, unauthorized } from '../lib/auth-middleware'
import { prisma } from '../lib/db'
import { hasCapability } from '../lib/permissions'
import { getIp } from '../lib/request'

function getAllowedStatusTransitions(current: string, role: 'QC' | 'ADMIN' | 'SUPER_ADMIN'): string[] {
  const isQc = role === 'QC' || role === 'SUPER_ADMIN'
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN'
  const matrix: Record<string, { qc: string[]; admin: string[] }> = {
    OPEN: { qc: ['CLOSED'], admin: ['IN_PROGRESS'] },
    IN_PROGRESS: { qc: ['CLOSED'], admin: ['READY_FOR_QC'] },
    READY_FOR_QC: { qc: ['CLOSED', 'REOPENED'], admin: [] },
    REOPENED: { qc: ['CLOSED'], admin: ['IN_PROGRESS'] },
    CLOSED: { qc: ['REOPENED'], admin: [] },
  }
  const entry = matrix[current]
  if (!entry) return []
  const out = new Set<string>()
  if (isQc) for (const s of entry.qc) out.add(s)
  if (isAdmin) for (const s of entry.admin) out.add(s)
  return [...out]
}

export const ticketsRouter = new Elysia()

  .get('/api/tickets', async ({ request, query, set }) => {
    const caller = await requireAuth(request)
    if (!caller) return unauthorized(set)
    if (caller.role === 'USER') return forbidden(set)

    const where: Record<string, unknown> = {}
    if (query.status) where.status = String(query.status)
    if (query.priority) where.priority = String(query.priority)
    if (query.assigneeId) where.assigneeId = String(query.assigneeId)
    if (query.reporterId) where.reporterId = String(query.reporterId)
    if (query.mine === '1') where.assigneeId = caller.userId

    const limit = Math.min(Number(query.limit) || 50, 200)
    const cursor = query.cursor as string | undefined
    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        reporter: { select: { id: true, name: true, email: true, role: true } },
        assignee: { select: { id: true, name: true, email: true, role: true } },
        _count: { select: { comments: true, evidence: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    const hasMore = tickets.length > limit
    const page = hasMore ? tickets.slice(0, limit) : tickets
    const nextCursor = hasMore ? page[page.length - 1]?.id : undefined
    return { tickets: page, nextCursor, hasMore }
  })

  .get('/api/tickets/:id', async ({ request, params, set }) => {
    const caller = await requireAuth(request)
    if (!caller) return unauthorized(set)
    if (caller.role === 'USER') return forbidden(set)

    const ticket = await prisma.ticket.findUnique({
      where: { id: params.id },
      include: {
        reporter: { select: { id: true, name: true, email: true, role: true } },
        assignee: { select: { id: true, name: true, email: true, role: true } },
        comments: {
          include: { author: { select: { id: true, name: true, email: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
        evidence: { orderBy: { createdAt: 'asc' } },
      },
    })
    if (!ticket) {
      set.status = 404
      return { error: 'Ticket not found' }
    }
    return { ticket }
  })

  .post('/api/tickets', async ({ request, set }) => {
    const caller = await requireAuth(request)
    if (!caller) return unauthorized(set)
    // QC tetap khusus untuk ticket workflow. ADMIN butuh capability eksplisit.
    const isQcOrSuper = caller.role === 'QC' || caller.role === 'SUPER_ADMIN'
    if (!isQcOrSuper && !hasCapability(caller, 'ticket:create')) return forbidden(set)

    const body = (await request.json()) as {
      title?: string
      description?: string
      priority?: string
      route?: string
      assigneeId?: string
    }
    if (!body.title || !body.description) {
      set.status = 400
      return { error: 'title dan description wajib diisi' }
    }

    const ticket = await prisma.ticket.create({
      data: {
        title: body.title,
        description: body.description,
        priority: (body.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') ?? 'MEDIUM',
        route: body.route ?? null,
        reporterId: caller.userId,
        assigneeId: body.assigneeId ?? null,
      },
    })
    audit(caller.userId, 'TICKET_CREATED', `#${ticket.id} ${ticket.title}`, getIp(request))
    appLog('info', `Ticket created: ${ticket.title} by ${caller.email}`)
    return { ticket }
  })

  .patch('/api/tickets/:id', async ({ request, params, set }) => {
    const caller = await requireAuth(request)
    if (!caller) return unauthorized(set)
    if (caller.role === 'USER') return forbidden(set)

    const current = await prisma.ticket.findUnique({ where: { id: params.id } })
    if (!current) {
      set.status = 404
      return { error: 'Ticket not found' }
    }

    const body = (await request.json()) as {
      title?: string
      description?: string
      priority?: string
      route?: string | null
      status?: string
      assigneeId?: string | null
    }
    const data: Record<string, unknown> = {}
    if (body.title !== undefined) data.title = body.title
    if (body.description !== undefined) data.description = body.description
    if (body.priority !== undefined) data.priority = body.priority
    if (body.route !== undefined) data.route = body.route
    if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId

    if (body.status !== undefined) {
      const allowed = getAllowedStatusTransitions(current.status, caller.role as 'QC' | 'ADMIN' | 'SUPER_ADMIN')
      if (!allowed.includes(body.status)) {
        set.status = 400
        return {
          error: `Transisi status tidak diizinkan untuk role ${caller.role}: ${current.status} → ${body.status}`,
        }
      }
      data.status = body.status
      if (body.status === 'CLOSED') data.closedAt = new Date()
      if (body.status === 'REOPENED') data.closedAt = null
    }

    const ticket = await prisma.ticket.update({ where: { id: params.id }, data })
    audit(caller.userId, 'TICKET_UPDATED', `#${ticket.id} ${Object.keys(data).join(',')}`, getIp(request))
    return { ticket }
  })

  .post('/api/tickets/:id/comments', async ({ request, params, set }) => {
    const caller = await requireAuth(request)
    if (!caller) return unauthorized(set)
    if (caller.role === 'USER') return forbidden(set)

    const ticket = await prisma.ticket.findUnique({ where: { id: params.id }, select: { id: true } })
    if (!ticket) {
      set.status = 404
      return { error: 'Ticket not found' }
    }

    const { body } = (await request.json()) as { body?: string }
    if (!body?.trim()) {
      set.status = 400
      return { error: 'body wajib diisi' }
    }

    const comment = await prisma.ticketComment.create({
      data: {
        ticketId: params.id,
        authorId: caller.userId,
        authorTag: caller.role === 'QC' ? 'QC' : caller.role === 'ADMIN' ? 'ADMIN' : 'SUPER_ADMIN',
        body,
      },
      include: { author: { select: { id: true, name: true, email: true, role: true } } },
    })
    return { comment }
  })

  .post('/api/tickets/:id/evidence', async ({ request, params, set }) => {
    const caller = await requireAuth(request)
    if (!caller) return unauthorized(set)
    if (caller.role === 'USER') return forbidden(set)

    const ticket = await prisma.ticket.findUnique({ where: { id: params.id }, select: { id: true } })
    if (!ticket) {
      set.status = 404
      return { error: 'Ticket not found' }
    }

    const body = (await request.json()) as { kind?: string; url?: string; note?: string }
    if (!body.kind || !body.url) {
      set.status = 400
      return { error: 'kind dan url wajib diisi' }
    }

    const evidence = await prisma.ticketEvidence.create({
      data: { ticketId: params.id, kind: body.kind, url: body.url, note: body.note ?? null },
    })
    return { evidence }
  })
