import { Elysia } from 'elysia'
import { appLog } from '../../lib/applog'
import { requireEnvAuth } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'
import { hasCapability } from '../../lib/permissions'
import { parseDockerLogStream } from './portainer-helpers'

export const connectionsStacksRouter = new Elysia()

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
        return { error: 'Stack not found' }
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

  .post(
    '/api/envman/portainer/connections/:id/stacks/:stackId/containers/:containerId/restart',
    async ({ request, params, set }) => {
      const caller = await requireEnvAuth(request)
      if (!caller) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      if (!hasCapability(caller, 'stack:power')) {
        set.status = 403
        return { error: 'Butuh capability: stack:power' }
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
          return { error: 'Stack not found' }
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
          return { error: 'Stack not found' }
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
