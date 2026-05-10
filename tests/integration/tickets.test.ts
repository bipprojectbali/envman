import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { createTestApp, seedTestUser, createTestSession, cleanupTestData, prisma } from '../helpers'

const app = createTestApp()

let adminId: string
let qcId: string
let userId: string
let adminToken: string
let qcToken: string
let userToken: string
let ticketId: string

beforeAll(async () => {
  await cleanupTestData()
  const admin = await seedTestUser('tkt-admin@test.com', 'pass123', 'TktAdmin', 'ADMIN')
  const qc = await seedTestUser('tkt-qc@test.com', 'pass123', 'TktQC', 'QC')
  const user = await seedTestUser('tkt-user@test.com', 'pass123', 'TktUser', 'USER')
  adminId = admin.id
  qcId = qc.id
  userId = user.id
  adminToken = await createTestSession(adminId)
  qcToken = await createTestSession(qcId)
  userToken = await createTestSession(userId)
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

const json = (token: string) => ({ 'Content-Type': 'application/json', cookie: `session=${token}` })

describe('GET /api/tickets', () => {
  test('ADMIN can list tickets', async () => {
    const res = await app.handle(new Request('http://localhost/api/tickets', { headers: json(adminToken) }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tickets).toBeArray()
  })

  test('QC can list tickets', async () => {
    const res = await app.handle(new Request('http://localhost/api/tickets', { headers: json(qcToken) }))
    expect(res.status).toBe(200)
  })

  test('USER gets 403', async () => {
    const res = await app.handle(new Request('http://localhost/api/tickets', { headers: json(userToken) }))
    expect(res.status).toBe(403)
  })

  test('no auth returns 401', async () => {
    const res = await app.handle(new Request('http://localhost/api/tickets'))
    expect(res.status).toBe(401)
  })
})

describe('POST /api/tickets', () => {
  test('ADMIN creates ticket', async () => {
    const res = await app.handle(new Request('http://localhost/api/tickets', {
      method: 'POST',
      headers: json(adminToken),
      body: JSON.stringify({ title: 'Bug fix needed', description: 'Something is broken', priority: 'HIGH' }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ticket.title).toBe('Bug fix needed')
    expect(body.ticket.status).toBe('OPEN')
    ticketId = body.ticket.id
  })

  test('QC creates ticket', async () => {
    const res = await app.handle(new Request('http://localhost/api/tickets', {
      method: 'POST',
      headers: json(qcToken),
      body: JSON.stringify({ title: 'QC found issue', description: 'Test failed' }),
    }))
    expect(res.status).toBe(200)
  })

  test('USER cannot create ticket (403)', async () => {
    const res = await app.handle(new Request('http://localhost/api/tickets', {
      method: 'POST',
      headers: json(userToken),
      body: JSON.stringify({ title: 'User ticket', description: 'desc' }),
    }))
    expect(res.status).toBe(403)
  })

  test('missing title returns 400', async () => {
    const res = await app.handle(new Request('http://localhost/api/tickets', {
      method: 'POST',
      headers: json(adminToken),
      body: JSON.stringify({ description: 'No title' }),
    }))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/tickets/:id', () => {
  test('returns ticket detail with comments and evidence', async () => {
    const res = await app.handle(new Request(`http://localhost/api/tickets/${ticketId}`, {
      headers: json(adminToken),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ticket.id).toBe(ticketId)
    expect(body.ticket.comments).toBeArray()
    expect(body.ticket.evidence).toBeArray()
  })

  test('unknown id returns 404', async () => {
    const res = await app.handle(new Request('http://localhost/api/tickets/not-exist', {
      headers: json(adminToken),
    }))
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/tickets/:id (status transitions)', () => {
  test('ADMIN transitions OPEN → IN_PROGRESS', async () => {
    const res = await app.handle(new Request(`http://localhost/api/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: json(adminToken),
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ticket.status).toBe('IN_PROGRESS')
  })

  test('ADMIN transitions IN_PROGRESS → READY_FOR_QC', async () => {
    const res = await app.handle(new Request(`http://localhost/api/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: json(adminToken),
      body: JSON.stringify({ status: 'READY_FOR_QC' }),
    }))
    expect(res.status).toBe(200)
  })

  test('invalid transition returns 400', async () => {
    const res = await app.handle(new Request(`http://localhost/api/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: json(adminToken),
      body: JSON.stringify({ status: 'OPEN' }),
    }))
    expect(res.status).toBe(400)
  })

  test('QC transitions READY_FOR_QC → CLOSED', async () => {
    const res = await app.handle(new Request(`http://localhost/api/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: json(qcToken),
      body: JSON.stringify({ status: 'CLOSED' }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ticket.status).toBe('CLOSED')
    expect(body.ticket.closedAt).not.toBeNull()
  })
})

describe('POST /api/tickets/:id/comments', () => {
  test('ADMIN adds comment', async () => {
    const res = await app.handle(new Request(`http://localhost/api/tickets/${ticketId}/comments`, {
      method: 'POST',
      headers: json(adminToken),
      body: JSON.stringify({ body: 'Working on it' }),
    }))
    expect(res.status).toBe(200)
    const b = await res.json()
    expect(b.comment.body).toBe('Working on it')
  })

  test('empty body returns 400', async () => {
    const res = await app.handle(new Request(`http://localhost/api/tickets/${ticketId}/comments`, {
      method: 'POST',
      headers: json(adminToken),
      body: JSON.stringify({ body: '' }),
    }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/tickets/:id/evidence', () => {
  test('ADMIN attaches evidence', async () => {
    const res = await app.handle(new Request(`http://localhost/api/tickets/${ticketId}/evidence`, {
      method: 'POST',
      headers: json(adminToken),
      body: JSON.stringify({ kind: 'screenshot', url: 'https://example.com/shot.png', note: 'See attached' }),
    }))
    expect(res.status).toBe(200)
    const b = await res.json()
    expect(b.evidence.kind).toBe('screenshot')
  })

  test('missing url returns 400', async () => {
    const res = await app.handle(new Request(`http://localhost/api/tickets/${ticketId}/evidence`, {
      method: 'POST',
      headers: json(adminToken),
      body: JSON.stringify({ kind: 'screenshot' }),
    }))
    expect(res.status).toBe(400)
  })
})
