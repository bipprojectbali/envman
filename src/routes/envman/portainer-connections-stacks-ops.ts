import { Elysia } from 'elysia'
import { appLog } from '../../lib/applog'
import { requireEnvAuth } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'
import { hasCapability } from '../../lib/permissions'

export const connectionsStacksOpsRouter = new Elysia()

  .get('/api/envman/portainer/connections/:id/health', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!hasCapability(caller, 'connection:view')) {
      set.status = 403
      return { error: 'Tidak punya izin lihat connection health.' }
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
        return { error: `Portainer error ${res.status}` }
      }
      const stacks = (await res.json()) as any[]
      const activeStacks = stacks.filter((s) => s.Status === 1).length
      return { totalStacks: stacks.length, activeStacks, inactiveStacks: stacks.length - activeStacks }
    } catch (e) {
      set.status = 500
      return { error: `Failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  .get('/api/envman/portainer/connections/:id/stacks/:stackId/file', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!hasCapability(caller, 'stack:operate')) {
      set.status = 403
      return { error: 'Tidak punya izin lihat compose file.' }
    }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) {
      set.status = 404
      return { error: 'Connection not found' }
    }
    const url = conn.portainerUrl.replace(/\/$/, '')
    try {
      const res = await fetch(`${url}/api/stacks/${params.stackId}/file`, { headers: { 'X-API-Key': conn.apiToken } })
      if (!res.ok) {
        set.status = 400
        return { error: `Portainer error ${res.status}` }
      }
      const data = (await res.json()) as any
      return { content: data.StackFileContent ?? '' }
    } catch (e) {
      set.status = 500
      return { error: `Failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  .put('/api/envman/portainer/connections/:id/stacks/:stackId/file', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!hasCapability(caller, 'stack:mutate')) {
      set.status = 403
      return { error: 'Butuh capability: stack:mutate' }
    }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) {
      set.status = 404
      return { error: 'Connection not found' }
    }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const body = (await request.json().catch(() => null)) as any
    if (!body?.content) {
      set.status = 400
      return { error: 'content required' }
    }
    try {
      const stackRes = await fetch(`${url}/api/stacks/${params.stackId}`, { headers: { 'X-API-Key': conn.apiToken } })
      if (!stackRes.ok) {
        set.status = 400
        return { error: 'Stack not found' }
      }
      const stack = (await stackRes.json()) as any
      const res = await fetch(`${url}/api/stacks/${params.stackId}?endpointId=${stack.EndpointId}`, {
        method: 'PUT',
        headers: { 'X-API-Key': conn.apiToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ StackFileContent: body.content, Env: stack.Env ?? [], Prune: false, PullImage: false }),
      })
      if (!res.ok) {
        set.status = 400
        return { error: `Save failed: ${res.status} ${await res.text()}` }
      }
      appLog('info', `[portainer:compose-save] connection=${conn.name} stack=${params.stackId}`)
      return { ok: true }
    } catch (e) {
      set.status = 500
      return { error: `Failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  .post('/api/envman/portainer/connections/:id/stacks/:stackId/repull', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!hasCapability(caller, 'stack:deploy')) {
      set.status = 403
      return { error: 'Butuh capability: stack:deploy' }
    }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) {
      set.status = 404
      return { error: 'Connection not found' }
    }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const stackId = Number(params.stackId)
    try {
      const fileRes = await fetch(`${url}/api/stacks/${stackId}/file`, { headers: { 'X-API-Key': conn.apiToken } })
      if (!fileRes.ok) {
        set.status = 400
        return { error: `Stack file error ${fileRes.status}` }
      }
      const { StackFileContent } = (await fileRes.json()) as { StackFileContent: string }
      const stackRes = await fetch(`${url}/api/stacks/${stackId}`, { headers: { 'X-API-Key': conn.apiToken } })
      const stackData = stackRes.ok ? ((await stackRes.json()) as any) : { Env: [], EndpointId: 1 }
      const res = await fetch(`${url}/api/stacks/${stackId}?endpointId=${stackData.EndpointId}`, {
        method: 'PUT',
        headers: { 'X-API-Key': conn.apiToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ StackFileContent, Env: stackData.Env ?? [], Prune: false, PullImage: true }),
      })
      if (!res.ok) {
        set.status = 400
        return { error: `Repull failed: ${res.status} ${await res.text()}` }
      }
      appLog('info', `Portainer repull via connection ${conn.name}: stack ${stackId}`)
      return { ok: true, stackName: stackData.Name }
    } catch (e) {
      set.status = 500
      return { error: `Repull failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  .post('/api/envman/portainer/connections/:id/stacks/:stackId/recreate', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!hasCapability(caller, 'stack:deploy')) {
      set.status = 403
      return { error: 'Butuh capability: stack:deploy' }
    }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) {
      set.status = 404
      return { error: 'Connection not found' }
    }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const stackId = Number(params.stackId)
    try {
      const stackRes = await fetch(`${url}/api/stacks/${stackId}`, { headers: { 'X-API-Key': conn.apiToken } })
      const stackData = stackRes.ok ? ((await stackRes.json()) as any) : { EndpointId: 1, Name: String(stackId) }
      const endpointId = stackData.EndpointId ?? 1
      const stopRes = await fetch(`${url}/api/stacks/${stackId}/stop?endpointId=${endpointId}`, {
        method: 'POST',
        headers: { 'X-API-Key': conn.apiToken },
      })
      if (!stopRes.ok) {
        set.status = 400
        return { error: `Stop failed: ${stopRes.status}` }
      }
      const startRes = await fetch(`${url}/api/stacks/${stackId}/start?endpointId=${endpointId}`, {
        method: 'POST',
        headers: { 'X-API-Key': conn.apiToken },
      })
      if (!startRes.ok) {
        set.status = 400
        return { error: `Start failed: ${startRes.status}` }
      }
      appLog('info', `Portainer recreate via connection ${conn.name}: stack ${stackId}`)
      return { ok: true, stackName: stackData.Name }
    } catch (e) {
      set.status = 500
      return { error: `Recreate failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })
