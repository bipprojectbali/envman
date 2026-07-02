import { Elysia } from 'elysia'
import { requireEnvAuth } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'
import { hasCapability } from '../../lib/permissions'

export const connectionsCrudRouter = new Elysia()

  .get('/api/envman/portainer/connections', async ({ request, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!hasCapability(caller, 'connection:view')) {
      set.status = 403
      return { error: 'Tidak punya izin lihat Portainer connection.' }
    }
    const connections = await prisma.portainerConnection.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        portainerUrl: true,
        createdById: true,
        createdAt: true,
        _count: { select: { configs: true } },
      },
    })
    return { connections }
  })

  .post('/api/envman/portainer/connections', async ({ request, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!hasCapability(caller, 'connection:manage')) {
      set.status = 403
      return { error: 'Butuh capability: connection:manage' }
    }
    const body = await request.json().catch(() => null)
    if (!body?.name || !body?.portainerUrl || !body?.apiToken) {
      set.status = 400
      return { error: 'name, portainerUrl, apiToken required' }
    }
    const conn = await prisma.portainerConnection.create({
      data: { name: body.name, portainerUrl: body.portainerUrl, apiToken: body.apiToken, createdById: caller.userId },
    })
    return { connection: { id: conn.id, name: conn.name, portainerUrl: conn.portainerUrl } }
  })

  .patch('/api/envman/portainer/connections/:id', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!hasCapability(caller, 'connection:manage')) {
      set.status = 403
      return { error: 'Butuh capability: connection:manage' }
    }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) {
      set.status = 404
      return { error: 'Not found' }
    }
    const body = await request.json().catch(() => null)
    const updated = await prisma.portainerConnection.update({
      where: { id: params.id },
      data: {
        name: body?.name ?? conn.name,
        portainerUrl: body?.portainerUrl ?? conn.portainerUrl,
        ...(body?.apiToken ? { apiToken: body.apiToken } : {}),
      },
    })
    return { connection: { id: updated.id, name: updated.name, portainerUrl: updated.portainerUrl } }
  })

  .delete('/api/envman/portainer/connections/:id', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!hasCapability(caller, 'connection:manage')) {
      set.status = 403
      return { error: 'Butuh capability: connection:manage' }
    }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) {
      set.status = 404
      return { error: 'Not found' }
    }
    await prisma.portainerConnection.delete({ where: { id: params.id } })
    return { ok: true }
  })

  .post('/api/envman/portainer/connections/:id/probe', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!hasCapability(caller, 'connection:view')) {
      set.status = 403
      return { error: 'Tidak punya izin probe connection.' }
    }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) {
      set.status = 404
      return { error: 'Connection not found' }
    }
    const url = conn.portainerUrl.replace(/\/$/, '')
    try {
      const res = await fetch(`${url}/api/stacks`, { headers: { 'X-API-Key': conn.apiToken } })
      if (!res.ok) {
        set.status = 400
        return { error: `Portainer returned ${res.status}: ${await res.text()}` }
      }
      const stacks = (await res.json()) as any[]
      return { stacks: stacks.map((s) => ({ id: s.Id, name: s.Name, endpointId: s.EndpointId })) }
    } catch (e) {
      set.status = 400
      return { error: `Cannot reach Portainer: ${e instanceof Error ? e.message : String(e)}` }
    }
  })
