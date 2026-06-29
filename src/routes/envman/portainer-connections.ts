import { Elysia } from 'elysia'
import { appLog } from '../../lib/applog'
import { requireEnvAuth } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'
import { hasCapability } from '../../lib/permissions'
import { parseDockerLogStream } from './portainer-helpers'

export const connectionsRouter = new Elysia()

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
    if (caller.role !== 'SUPER_ADMIN') {
      set.status = 403
      return { error: 'Hanya SUPER_ADMIN yang boleh create Portainer connection.' }
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
    if (caller.role !== 'SUPER_ADMIN') {
      set.status = 403
      return { error: 'Hanya SUPER_ADMIN yang boleh edit Portainer connection.' }
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
    if (caller.role !== 'SUPER_ADMIN') {
      set.status = 403
      return { error: 'Hanya SUPER_ADMIN yang boleh hapus Portainer connection.' }
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

  .get('/api/envman/portainer/connections/:id/stacks', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!hasCapability(caller, 'stack:operate')) {
      set.status = 403
      return { error: 'Tidak punya izin operate stack.' }
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
        return { error: `Portainer error ${res.status}: ${await res.text()}` }
      }
      const rawStacks = (await res.json()) as any[]
      const configs = await prisma.portainerConfig.findMany({
        where: { connectionId: params.id },
        include: { project: { select: { slug: true, name: true } } },
      })
      const stacks = rawStacks.map((s) => {
        const linked = configs
          .filter((c) => c.stackId === s.Id)
          .map((c) => ({
            slug: c.project.slug,
            projectName: c.project.name,
            envName: c.envName,
            lastSyncAt: c.lastSyncAt,
            lastSyncOk: c.lastSyncOk,
          }))
        return {
          id: s.Id,
          name: s.Name,
          status: s.Status,
          type: s.Type,
          endpointId: s.EndpointId,
          createdAt: s.CreationDate,
          updatedAt: s.UpdateDate,
          linkedEnvs: linked,
        }
      })
      return { connection: { id: conn.id, name: conn.name, portainerUrl: conn.portainerUrl }, stacks }
    } catch (e) {
      set.status = 500
      return { error: `Failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  .get('/api/envman/portainer/connections/:id/stacks/:stackId/status', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!hasCapability(caller, 'stack:operate')) {
      set.status = 403
      return { error: 'Tidak punya izin operate stack.' }
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
      if (!stackRes.ok) {
        set.status = 400
        return { error: `Portainer error ${stackRes.status}` }
      }
      const stack = (await stackRes.json()) as any
      appLog(
        'info',
        `[portainer:status] stack.Name=${stack.Name} stack.ResourceControl=${JSON.stringify(stack.ResourceControl?.SubResourceIds ?? [])} endpointId=${stack.EndpointId}`,
      )
      const allRes = await fetch(`${url}/api/endpoints/${stack.EndpointId}/docker/containers/json?all=1`, {
        headers: { 'X-API-Key': conn.apiToken },
      })
      let containers: any[] = []
      if (allRes.ok) {
        const all = (await allRes.json()) as any[]
        const projects = [
          ...new Set(all.map((c: any) => c.Labels?.['com.docker.compose.project'] ?? '').filter(Boolean)),
        ]
        appLog(
          'info',
          `[portainer:status] total=${all.length} compose_projects=${JSON.stringify(projects)} stack.Name=${stack.Name}`,
        )
        const stackNameLower = stack.Name.toLowerCase()
        containers = all.filter(
          (c: any) => (c.Labels?.['com.docker.compose.project'] ?? '').toLowerCase() === stackNameLower,
        )
        if (containers.length === 0) {
          containers = all.filter(
            (c: any) => (c.Labels?.['com.docker.stack.namespace'] ?? '').toLowerCase() === stackNameLower,
          )
        }
        appLog('info', `[portainer:status] matched=${containers.length}`)
      } else {
        appLog('warn', `[portainer:status] list containers failed: ${allRes.status} ${await allRes.text()}`)
      }
      return {
        stack: { id: stack.Id, name: stack.Name, status: stack.Status, type: stack.Type, endpointId: stack.EndpointId },
        containers: containers.map((c) => ({
          id: c.Id,
          shortId: c.Id.slice(0, 12),
          names: c.Names.map((n: string) => n.replace(/^\//, '')),
          image: c.Image,
          status: c.Status,
          state: c.State,
          ports:
            c.Ports?.map((p: any) => (p.PublicPort ? `${p.PublicPort}:${p.PrivatePort}` : null)).filter(Boolean) ?? [],
        })),
      }
    } catch (e) {
      set.status = 500
      return { error: `Status failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  .get(
    '/api/envman/portainer/connections/:id/stacks/:stackId/logs/:containerId',
    async ({ request, params, query, set }) => {
      const caller = await requireEnvAuth(request)
      if (!caller) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (!hasCapability(caller, 'stack:operate')) {
        set.status = 403
        return { error: 'Tidak punya izin lihat logs.' }
      }
      const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
      if (!conn) {
        set.status = 404
        return { error: 'Connection not found' }
      }
      const url = conn.portainerUrl.replace(/\/$/, '')
      const stackRes = await fetch(`${url}/api/stacks/${params.stackId}`, { headers: { 'X-API-Key': conn.apiToken } })
      if (!stackRes.ok) {
        set.status = 400
        return { error: `Stack not found` }
      }
      const stack = (await stackRes.json()) as any
      const tail = Math.min(Number((query as any).tail) || 200, 1000)
      const stdout = (query as any).stdout !== '0' ? 1 : 0
      const stderr = (query as any).stderr !== '0' ? 1 : 0
      const timestamps = (query as any).timestamps !== '0' ? 1 : 0
      const since = (query as any).since as string | undefined
      try {
        const qs = new URLSearchParams({
          stdout: String(stdout),
          stderr: String(stderr),
          tail: String(tail),
          timestamps: String(timestamps),
        })
        if (since) qs.set('since', since)
        const res = await fetch(
          `${url}/api/endpoints/${stack.EndpointId}/docker/containers/${params.containerId}/logs?${qs}`,
          { headers: { 'X-API-Key': conn.apiToken } },
        )
        if (!res.ok) {
          set.status = 400
          return { error: `Logs error ${res.status}: ${await res.text()}` }
        }
        const buf = Buffer.from(await res.arrayBuffer())
        const lines = parseDockerLogStream(buf, timestamps === 1)
        return { lines, total: lines.length }
      } catch (e) {
        set.status = 500
        return { error: `Logs failed: ${e instanceof Error ? e.message : String(e)}` }
      }
    },
  )

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
      return { error: 'Tidak punya izin edit compose file.' }
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
        return { error: `Stack not found` }
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

  .post(
    '/api/envman/portainer/connections/:id/stacks/:stackId/containers/:containerId/restart',
    async ({ request, params, set }) => {
      const caller = await requireEnvAuth(request)
      if (!caller) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (!hasCapability(caller, 'stack:mutate')) {
        set.status = 403
        return { error: 'Tidak punya izin restart container.' }
      }
      const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
      if (!conn) {
        set.status = 404
        return { error: 'Connection not found' }
      }
      const url = conn.portainerUrl.replace(/\/$/, '')
      try {
        const stackRes = await fetch(`${url}/api/stacks/${params.stackId}`, { headers: { 'X-API-Key': conn.apiToken } })
        if (!stackRes.ok) {
          set.status = 400
          return { error: `Stack not found` }
        }
        const stack = (await stackRes.json()) as any
        const res = await fetch(
          `${url}/api/endpoints/${stack.EndpointId}/docker/containers/${params.containerId}/restart`,
          { method: 'POST', headers: { 'X-API-Key': conn.apiToken } },
        )
        if (!res.ok) {
          set.status = 400
          return { error: `Restart failed: ${res.status}` }
        }
        appLog('info', `[portainer:restart] connection=${conn.name} container=${params.containerId.slice(0, 12)}`)
        return { ok: true }
      } catch (e) {
        set.status = 500
        return { error: `Failed: ${e instanceof Error ? e.message : String(e)}` }
      }
    },
  )

  .get(
    '/api/envman/portainer/connections/:id/stacks/:stackId/containers/:containerId/stats',
    async ({ request, params, set }) => {
      const caller = await requireEnvAuth(request)
      if (!caller) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (!hasCapability(caller, 'stack:operate')) {
        set.status = 403
        return { error: 'Tidak punya izin lihat container stats.' }
      }
      const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
      if (!conn) {
        set.status = 404
        return { error: 'Connection not found' }
      }
      const url = conn.portainerUrl.replace(/\/$/, '')
      try {
        const stackRes = await fetch(`${url}/api/stacks/${params.stackId}`, { headers: { 'X-API-Key': conn.apiToken } })
        if (!stackRes.ok) {
          set.status = 400
          return { error: `Stack not found` }
        }
        const stack = (await stackRes.json()) as any
        const res = await fetch(
          `${url}/api/endpoints/${stack.EndpointId}/docker/containers/${params.containerId}/stats?stream=false`,
          { headers: { 'X-API-Key': conn.apiToken } },
        )
        if (!res.ok) {
          set.status = 400
          return { error: `Stats error ${res.status}` }
        }
        const s = (await res.json()) as any
        const cpuDelta = (s.cpu_stats?.cpu_usage?.total_usage ?? 0) - (s.precpu_stats?.cpu_usage?.total_usage ?? 0)
        const systemDelta = (s.cpu_stats?.system_cpu_usage ?? 0) - (s.precpu_stats?.system_cpu_usage ?? 0)
        const numCPUs = s.cpu_stats?.online_cpus ?? s.cpu_stats?.cpu_usage?.percpu_usage?.length ?? 1
        const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * numCPUs * 100 : 0
        const memUsage = s.memory_stats?.usage ?? 0
        const memCache = s.memory_stats?.stats?.cache ?? 0
        const memLimit = s.memory_stats?.limit ?? 0
        const memUsageMB = Math.round((memUsage - memCache) / 1024 / 1024)
        const memLimitMB = Math.round(memLimit / 1024 / 1024)
        const memPercent = memLimit > 0 ? ((memUsage - memCache) / memLimit) * 100 : 0
        const netStats = s.networks ?? {}
        const netRx = Object.values(netStats).reduce((acc: number, n: any) => acc + (n.rx_bytes ?? 0), 0)
        const netTx = Object.values(netStats).reduce((acc: number, n: any) => acc + (n.tx_bytes ?? 0), 0)
        return {
          cpuPercent: Math.round(cpuPercent * 10) / 10,
          memUsageMB,
          memLimitMB,
          memPercent: Math.round(memPercent * 10) / 10,
          netRxMB: Math.round((netRx / 1024 / 1024) * 100) / 100,
          netTxMB: Math.round((netTx / 1024 / 1024) * 100) / 100,
        }
      } catch (e) {
        set.status = 500
        return { error: `Failed: ${e instanceof Error ? e.message : String(e)}` }
      }
    },
  )

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

  .post('/api/envman/portainer/connections/:id/stacks/:stackId/repull', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!hasCapability(caller, 'stack:mutate')) {
      set.status = 403
      return { error: 'Tidak punya izin repull image.' }
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
    if (!hasCapability(caller, 'stack:mutate')) {
      set.status = 403
      return { error: 'Tidak punya izin recreate stack.' }
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

  .get('/api/envman/portainer/connections/:id/images/dangling', async ({ request, params, query, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!hasCapability(caller, 'stack:operate')) {
      set.status = 403
      return { error: 'Tidak punya izin lihat dangling images.' }
    }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) {
      set.status = 404
      return { error: 'Connection not found' }
    }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const endpointId = Number((query as any).endpointId) || 1
    try {
      const filters = encodeURIComponent(JSON.stringify({ dangling: ['true'] }))
      const res = await fetch(`${url}/api/endpoints/${endpointId}/docker/images/json?filters=${filters}`, {
        headers: { 'X-API-Key': conn.apiToken },
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        appLog('warn', `[portainer:dangling] endpointId=${endpointId} status=${res.status} body=${errText}`)
        set.status = 400
        return { error: `Portainer error ${res.status}: ${errText}` }
      }
      const images = (await res.json()) as any[]
      const totalSize = images.reduce((acc, img) => acc + (img.Size ?? 0), 0)
      return {
        images: images.map((img) => ({
          id: img.Id.replace('sha256:', '').slice(0, 12),
          tags: img.RepoTags ?? [],
          size: img.Size,
          created: img.Created,
        })),
        count: images.length,
        totalSizeMB: Math.round(totalSize / 1024 / 1024),
        endpointId,
      }
    } catch (e) {
      set.status = 500
      return { error: `Failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  .get('/api/envman/portainer/connections/:id/containers/stopped', async ({ request, params, query, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!hasCapability(caller, 'stack:operate')) {
      set.status = 403
      return { error: 'Tidak punya izin.' }
    }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) {
      set.status = 404
      return { error: 'Connection not found' }
    }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const endpointId = Number((query as any).endpointId) || 1
    try {
      const filters = encodeURIComponent(JSON.stringify({ status: ['exited', 'dead'] }))
      const res = await fetch(`${url}/api/endpoints/${endpointId}/docker/containers/json?all=1&filters=${filters}`, {
        headers: { 'X-API-Key': conn.apiToken },
      })
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        set.status = 400
        return { error: `Portainer error ${res.status}: ${t}` }
      }
      const containers = (await res.json()) as any[]
      const totalSize = containers.reduce((acc, c) => acc + (c.SizeRootFs ?? 0), 0)
      return {
        containers: containers.map((c) => ({
          id: c.Id.slice(0, 12),
          name: (c.Names?.[0] ?? '').replace(/^\//, ''),
          image: c.Image,
          state: c.State,
          status: c.Status,
          size: c.SizeRootFs ?? 0,
        })),
        count: containers.length,
        totalSizeMB: Math.round(totalSize / 1024 / 1024),
        endpointId,
      }
    } catch (e) {
      set.status = 500
      return { error: `Failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  .get('/api/envman/portainer/connections/:id/volumes/unused', async ({ request, params, query, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!hasCapability(caller, 'stack:operate')) {
      set.status = 403
      return { error: 'Tidak punya izin.' }
    }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) {
      set.status = 404
      return { error: 'Connection not found' }
    }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const endpointId = Number((query as any).endpointId) || 1
    try {
      const filters = encodeURIComponent(JSON.stringify({ dangling: ['true'] }))
      const res = await fetch(`${url}/api/endpoints/${endpointId}/docker/volumes?filters=${filters}`, {
        headers: { 'X-API-Key': conn.apiToken },
      })
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        set.status = 400
        return { error: `Portainer error ${res.status}: ${t}` }
      }
      const data = (await res.json()) as any
      const volumes = (data.Volumes ?? []) as any[]
      return {
        volumes: volumes.map((v) => ({
          name: v.Name,
          driver: v.Driver,
          mountpoint: v.Mountpoint,
          createdAt: v.CreatedAt,
        })),
        count: volumes.length,
        endpointId,
      }
    } catch (e) {
      set.status = 500
      return { error: `Failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  .get('/api/envman/portainer/connections/:id/networks/unused', async ({ request, params, query, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!hasCapability(caller, 'stack:operate')) {
      set.status = 403
      return { error: 'Tidak punya izin.' }
    }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) {
      set.status = 404
      return { error: 'Connection not found' }
    }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const endpointId = Number((query as any).endpointId) || 1
    try {
      const filters = encodeURIComponent(JSON.stringify({ dangling: ['true'] }))
      const res = await fetch(`${url}/api/endpoints/${endpointId}/docker/networks?filters=${filters}`, {
        headers: { 'X-API-Key': conn.apiToken },
      })
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        set.status = 400
        return { error: `Portainer error ${res.status}: ${t}` }
      }
      const networks = (await res.json()) as any[]
      return {
        networks: networks.map((n) => ({ id: n.Id?.slice(0, 12), name: n.Name, driver: n.Driver, scope: n.Scope })),
        count: networks.length,
        endpointId,
      }
    } catch (e) {
      set.status = 500
      return { error: `Failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  .post('/api/envman/portainer/connections/:id/prune/images', async ({ request, params, query, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!hasCapability(caller, 'stack:prune')) {
      set.status = 403
      return { error: 'Tidak punya izin prune images.' }
    }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) {
      set.status = 404
      return { error: 'Connection not found' }
    }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const endpointId = Number((query as any).endpointId) || 1
    try {
      const res = await fetch(`${url}/api/endpoints/${endpointId}/docker/images/prune`, {
        method: 'POST',
        headers: { 'X-API-Key': conn.apiToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ Filters: { dangling: ['true'] } }),
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        appLog('warn', `[portainer:prune-images] failed ${res.status}: ${errText}`)
        set.status = 400
        return { error: `Prune failed: ${res.status}: ${errText}` }
      }
      const result = (await res.json()) as any
      const reclaimedMB = Math.round((result.SpaceReclaimed ?? 0) / 1024 / 1024)
      appLog('info', `[portainer:prune-images] deleted=${result.ImagesDeleted?.length ?? 0} reclaimed=${reclaimedMB}MB`)
      const filters2 = encodeURIComponent(JSON.stringify({ dangling: ['true'] }))
      const remainRes = await fetch(`${url}/api/endpoints/${endpointId}/docker/images/json?filters=${filters2}`, {
        headers: { 'X-API-Key': conn.apiToken },
      })
      let remaining: any[] = []
      if (remainRes.ok) remaining = (await remainRes.json()) as any[]
      if (remaining.length > 0) {
        const allContainersRes = await fetch(`${url}/api/endpoints/${endpointId}/docker/containers/json?all=1`, {
          headers: { 'X-API-Key': conn.apiToken },
        })
        const allContainers = allContainersRes.ok ? ((await allContainersRes.json()) as any[]) : []
        const usedImageIds = new Set(allContainers.map((c: any) => c.ImageID))
        const stuck = remaining.filter((img: any) => usedImageIds.has(img.Id))
        appLog(
          'info',
          `[portainer:prune-images] remaining=${remaining.length} stuck_by_stopped_containers=${stuck.length}`,
        )
        return {
          ok: true,
          deletedCount: result.ImagesDeleted?.length ?? 0,
          reclaimedMB,
          remaining: remaining.length,
          stuckByContainers: stuck.length,
          stuckImages: stuck.map((img: any) => ({
            id: img.Id.replace('sha256:', '').slice(0, 12),
            tags: img.RepoTags ?? [],
          })),
        }
      }
      return { ok: true, deletedCount: result.ImagesDeleted?.length ?? 0, reclaimedMB, remaining: 0, stuckByContainers: 0 }
    } catch (e) {
      set.status = 500
      return { error: `Prune failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  .post('/api/envman/portainer/connections/:id/prune/volumes', async ({ request, params, query, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!hasCapability(caller, 'stack:prune')) {
      set.status = 403
      return { error: 'Tidak punya izin prune volumes.' }
    }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) {
      set.status = 404
      return { error: 'Connection not found' }
    }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const endpointId = Number((query as any).endpointId) || 1
    try {
      const res = await fetch(`${url}/api/endpoints/${endpointId}/docker/volumes/prune`, {
        method: 'POST',
        headers: { 'X-API-Key': conn.apiToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        set.status = 400
        return { error: `Prune volumes failed: ${res.status}` }
      }
      const result = (await res.json()) as any
      const reclaimedMB = Math.round((result.SpaceReclaimed ?? 0) / 1024 / 1024)
      appLog('info', `Portainer prune volumes via connection ${conn.name}`)
      return { ok: true, deletedVolumes: result.VolumesDeleted ?? [], reclaimedMB }
    } catch (e) {
      set.status = 500
      return { error: `Prune volumes failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  .post('/api/envman/portainer/connections/:id/prune/networks', async ({ request, params, query, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!hasCapability(caller, 'stack:prune')) {
      set.status = 403
      return { error: 'Tidak punya izin prune networks.' }
    }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) {
      set.status = 404
      return { error: 'Connection not found' }
    }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const endpointId = Number((query as any).endpointId) || 1
    try {
      const res = await fetch(`${url}/api/endpoints/${endpointId}/docker/networks/prune`, {
        method: 'POST',
        headers: { 'X-API-Key': conn.apiToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        set.status = 400
        return { error: `Prune networks failed: ${res.status}` }
      }
      const result = (await res.json()) as any
      appLog('info', `Portainer prune networks via connection ${conn.name}`)
      return { ok: true, deletedNetworks: result.NetworksDeleted ?? [] }
    } catch (e) {
      set.status = 500
      return { error: `Prune networks failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  .post('/api/envman/portainer/connections/:id/prune/containers', async ({ request, params, query, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!hasCapability(caller, 'stack:prune')) {
      set.status = 403
      return { error: 'Tidak punya izin prune containers.' }
    }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) {
      set.status = 404
      return { error: 'Connection not found' }
    }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const endpointId = Number((query as any).endpointId) || 1
    try {
      const res = await fetch(`${url}/api/endpoints/${endpointId}/docker/containers/prune`, {
        method: 'POST',
        headers: { 'X-API-Key': conn.apiToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        set.status = 400
        return { error: `Prune containers failed: ${res.status}: ${t}` }
      }
      const result = (await res.json()) as any
      const reclaimedMB = Math.round((result.SpaceReclaimed ?? 0) / 1024 / 1024)
      appLog('info', `Portainer prune containers via connection ${conn.name}`)
      return { ok: true, deletedContainers: result.ContainersDeleted ?? [], reclaimedMB }
    } catch (e) {
      set.status = 500
      return { error: `Prune containers failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  .post('/api/envman/portainer/connections/:id/exec', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!hasCapability(caller, 'stack:operate')) {
      set.status = 403
      return { error: 'Tidak punya izin exec container.' }
    }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) {
      set.status = 404
      return { error: 'Connection not found' }
    }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const body = (await request.json().catch(() => null)) as any
    if (!body?.containerId || !body?.endpointId || !body?.command) {
      set.status = 400
      return { error: 'containerId, endpointId, command required' }
    }
    const command: string = String(body.command)
    const endpointId: number = Number(body.endpointId)
    const containerId: string = String(body.containerId)
    try {
      const createRes = await fetch(`${url}/api/endpoints/${endpointId}/docker/containers/${containerId}/exec`, {
        method: 'POST',
        headers: { 'X-API-Key': conn.apiToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          AttachStdin: false,
          AttachStdout: true,
          AttachStderr: true,
          Tty: false,
          Cmd: ['/bin/sh', '-c', command],
        }),
      })
      if (!createRes.ok) {
        set.status = 400
        return { error: `Exec create failed: ${createRes.status} ${await createRes.text()}` }
      }
      const { Id: execId } = (await createRes.json()) as { Id: string }
      const startRes = await fetch(`${url}/api/endpoints/${endpointId}/docker/exec/${execId}/start`, {
        method: 'POST',
        headers: { 'X-API-Key': conn.apiToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ Detach: false, Tty: false }),
        signal: AbortSignal.timeout(30_000),
      })
      if (!startRes.ok) {
        set.status = 400
        return { error: `Exec start failed: ${startRes.status}` }
      }
      const buf = Buffer.from(await startRes.arrayBuffer())
      const stdoutLines: string[] = []
      const stderrLines: string[] = []
      let offset = 0
      while (offset < buf.length) {
        if (offset + 8 > buf.length) break
        const streamType = buf[offset]
        const size = buf.readUInt32BE(offset + 4)
        offset += 8
        if (offset + size > buf.length) break
        const payload = buf.slice(offset, offset + size).toString('utf8')
        offset += size
        const lines = payload
          .split('\n')
          .map((l) => l.trimEnd())
          .filter((l) => l !== '')
        if (streamType === 2) stderrLines.push(...lines)
        else stdoutLines.push(...lines)
      }
      let exitCode: number | null = null
      try {
        const inspectRes = await fetch(`${url}/api/endpoints/${endpointId}/docker/exec/${execId}/json`, {
          headers: { 'X-API-Key': conn.apiToken },
        })
        if (inspectRes.ok) {
          const info = (await inspectRes.json()) as any
          exitCode = info.ExitCode ?? null
        }
      } catch {}
      appLog(
        'info',
        `[portainer:exec] connection=${conn.name} container=${containerId.slice(0, 12)} cmd="${command.slice(0, 60)}" exit=${exitCode}`,
      )
      return { stdout: stdoutLines, stderr: stderrLines, exitCode }
    } catch (e) {
      set.status = 500
      return { error: `Exec failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })
