import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { requireEnvAuth, unauthorized, forbidden } from '../../lib/auth-middleware'
import { getEnvironmentAccess } from '../../lib/access'
import { hasCapability } from '../../lib/permissions'
import { decryptSecret } from '../../lib/crypto'
import { injectEnvFileIntoCompose } from '../../lib/portainer'
import { appLog } from '../../lib/applog'

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function resolveConn(cfg: { connectionId: string | null; portainerUrl: string | null; apiToken: string | null }): Promise<{ url: string; token: string } | null> {
  if (cfg.connectionId) {
    const conn = await prisma.portainerConnection.findUnique({ where: { id: cfg.connectionId } })
    if (!conn) return null
    return { url: conn.portainerUrl.replace(/\/$/, ''), token: conn.apiToken }
  }
  if (!cfg.portainerUrl || !cfg.apiToken) return null
  return { url: cfg.portainerUrl.replace(/\/$/, ''), token: cfg.apiToken }
}

async function getPortainerCfg(slug: string, envName: string) {
  const project = await prisma.project.findUnique({ where: { slug } })
  if (!project) return null
  return prisma.portainerConfig.findUnique({ where: { projectId_envName: { projectId: project.id, envName } } })
}

export async function triggerAutoSync(slug: string, envName: string, userId: string) {
  try {
    const project = await prisma.project.findUnique({ where: { slug } })
    if (!project) return
    const cfg = await prisma.portainerConfig.findUnique({ where: { projectId_envName: { projectId: project.id, envName } } })
    if (!cfg?.autoSync) return
    const environment = await prisma.environment.findUnique({ where: { projectId_name: { projectId: project.id, name: envName } }, include: { vars: true } })
    if (!environment) return
    let portainerUrl: string, portainerToken: string
    if (cfg.connectionId) {
      const conn = await prisma.portainerConnection.findUnique({ where: { id: cfg.connectionId } })
      if (!conn) return
      portainerUrl = conn.portainerUrl; portainerToken = conn.apiToken
    } else {
      if (!cfg.portainerUrl || !cfg.apiToken) return
      portainerUrl = cfg.portainerUrl; portainerToken = cfg.apiToken
    }
    const url = portainerUrl.replace(/\/$/, '')
    const startMs = Date.now()
    const fileRes = await fetch(`${url}/api/stacks/${cfg.stackId}/file`, { headers: { 'X-API-Key': portainerToken } })
    if (!fileRes.ok) return
    const { StackFileContent: rawFile } = await fileRes.json() as { StackFileContent: string }
    const content = injectEnvFileIntoCompose(rawFile)
    const escapeEnvValue = (val: string) => val.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
    const portainerEnv = environment.vars.filter(v => !v.isDisabled).map(v => ({
      name: v.key, value: escapeEnvValue(v.isSecret ? decryptSecret(v.value) : v.value),
    }))
    const syncRes = await fetch(`${url}/api/stacks/${cfg.stackId}?endpointId=${cfg.endpointId}`, {
      method: 'PUT',
      headers: { 'X-API-Key': portainerToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ StackFileContent: content, Env: portainerEnv, Prune: false }),
    })
    const ok = syncRes.ok
    const durationMs = Date.now() - startMs
    await prisma.portainerConfig.update({ where: { id: cfg.id }, data: { lastSyncAt: new Date(), lastSyncOk: ok } })
    await prisma.portainerSyncLog.create({ data: { configId: cfg.id, userId, triggeredBy: 'auto', varsCount: portainerEnv.length, secretCount: environment.vars.filter(v => v.isSecret && !v.isDisabled).length, ok, error: ok ? null : `HTTP ${syncRes.status}`, durationMs } })
    appLog('info', `[auto-sync] ${slug}:${envName} → ${ok ? 'ok' : 'failed'} (${durationMs}ms)`)
  } catch (e) {
    appLog('warn', `[auto-sync] ${slug}:${envName} error: ${e instanceof Error ? e.message : String(e)}`)
  }
}

export const portainerRouter = new Elysia()

      // ─── Portainer Connections (global) ──────────────────
  .get('/api/envman/portainer/connections', async ({ request, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    if (!hasCapability(caller, 'connection:view')) { set.status = 403; return { error: 'Tidak punya izin lihat Portainer connection.' } }
    const connections = await prisma.portainerConnection.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, portainerUrl: true, createdById: true, createdAt: true, _count: { select: { configs: true } } },
    })
    return { connections }
      })

  .post('/api/envman/portainer/connections', async ({ request, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    // Connection = infra global. Hanya SUPER_ADMIN yang boleh create.
    if (caller.role !== 'SUPER_ADMIN') { set.status = 403; return { error: 'Hanya SUPER_ADMIN yang boleh create Portainer connection.' } }
    const body = await request.json().catch(() => null)
    if (!body?.name || !body?.portainerUrl || !body?.apiToken) { set.status = 400; return { error: 'name, portainerUrl, apiToken required' } }
    const conn = await prisma.portainerConnection.create({
      data: { name: body.name, portainerUrl: body.portainerUrl, apiToken: body.apiToken, createdById: caller.userId },
    })
    return { connection: { id: conn.id, name: conn.name, portainerUrl: conn.portainerUrl } }
      })

  .patch('/api/envman/portainer/connections/:id', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    // Connection = infra global. Hanya SUPER_ADMIN yang boleh mutate.
    if (caller.role !== 'SUPER_ADMIN') { set.status = 403; return { error: 'Hanya SUPER_ADMIN yang boleh edit Portainer connection.' } }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Not found' } }
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
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    // Connection = infra global. Hanya SUPER_ADMIN yang boleh delete.
    if (caller.role !== 'SUPER_ADMIN') { set.status = 403; return { error: 'Hanya SUPER_ADMIN yang boleh hapus Portainer connection.' } }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Not found' } }
    await prisma.portainerConnection.delete({ where: { id: params.id } })
    return { ok: true }
      })

      // Probe stacks via connection ID (or legacy URL+token)
  .post('/api/envman/portainer/connections/:id/probe', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    if (!hasCapability(caller, 'connection:view')) { set.status = 403; return { error: 'Tidak punya izin probe connection.' } }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Connection not found' } }
    const url = conn.portainerUrl.replace(/\/$/, '')
    try {
      const res = await fetch(`${url}/api/stacks`, { headers: { 'X-API-Key': conn.apiToken } })
      if (!res.ok) { set.status = 400; return { error: `Portainer returned ${res.status}: ${await res.text()}` } }
      const stacks = await res.json() as any[]
      return { stacks: stacks.map(s => ({ id: s.Id, name: s.Name, endpointId: s.EndpointId })) }
    } catch (e) {
      set.status = 400
      return { error: `Cannot reach Portainer: ${e instanceof Error ? e.message : String(e)}` }
    }
      })

  // ─── Connection detail: list stacks + linked envs ────────────────────────
  .get('/api/envman/portainer/connections/:id/stacks', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    if (!hasCapability(caller, 'stack:operate')) { set.status = 403; return { error: 'Tidak punya izin operate stack.' } }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Connection not found' } }
    const url = conn.portainerUrl.replace(/\/$/, '')
    try {
      // Fetch all stacks from Portainer
      const res = await fetch(`${url}/api/stacks`, { headers: { 'X-API-Key': conn.apiToken } })
      if (!res.ok) { set.status = 400; return { error: `Portainer error ${res.status}: ${await res.text()}` } }
      const rawStacks = await res.json() as any[]

      // Find which envman environments are linked to each stack
      const configs = await prisma.portainerConfig.findMany({
        where: { connectionId: params.id },
        include: { project: { select: { slug: true, name: true } } },
      })

      const stacks = rawStacks.map(s => {
        const linked = configs.filter(c => c.stackId === s.Id).map(c => ({
          slug: c.project.slug,
          projectName: c.project.name,
          envName: c.envName,
          lastSyncAt: c.lastSyncAt,
          lastSyncOk: c.lastSyncOk,
        }))
        return {
          id: s.Id,
          name: s.Name,
          status: s.Status,       // 1=active, 2=inactive
          type: s.Type,           // 1=swarm, 2=compose
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

  // Stack status + containers (by connectionId)
  .get('/api/envman/portainer/connections/:id/stacks/:stackId/status', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    if (!hasCapability(caller, 'stack:operate')) { set.status = 403; return { error: 'Tidak punya izin operate stack.' } }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Connection not found' } }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const stackId = Number(params.stackId)
    try {
      const stackRes = await fetch(`${url}/api/stacks/${stackId}`, { headers: { 'X-API-Key': conn.apiToken } })
      if (!stackRes.ok) { set.status = 400; return { error: `Portainer error ${stackRes.status}` } }
      const stack = await stackRes.json() as any

      appLog('info', `[portainer:status] stack.Name=${stack.Name} stack.ResourceControl=${JSON.stringify(stack.ResourceControl?.SubResourceIds ?? [])} endpointId=${stack.EndpointId}`)

      // Fetch all containers on the endpoint, match by label
      const allRes = await fetch(`${url}/api/endpoints/${stack.EndpointId}/docker/containers/json?all=1`, { headers: { 'X-API-Key': conn.apiToken } })
      let containers: any[] = []
      if (allRes.ok) {
        const all = await allRes.json() as any[]
        // Log all unique compose project names found
        const projects = [...new Set(all.map((c: any) => c.Labels?.['com.docker.compose.project'] ?? '').filter(Boolean))]
        appLog('info', `[portainer:status] total=${all.length} compose_projects=${JSON.stringify(projects)} stack.Name=${stack.Name}`)

        const stackNameLower = stack.Name.toLowerCase()
        containers = all.filter((c: any) => {
          const proj = (c.Labels?.['com.docker.compose.project'] ?? '').toLowerCase()
          return proj === stackNameLower
        })

        // Fallback: match by com.docker.compose.config.hash or portainer label
        if (containers.length === 0) {
          containers = all.filter((c: any) => {
            const stackLabel = c.Labels?.['com.docker.stack.namespace'] ?? ''
            return stackLabel.toLowerCase() === stackNameLower
          })
        }

        appLog('info', `[portainer:status] matched=${containers.length}`)
      } else {
        appLog('warn', `[portainer:status] list containers failed: ${allRes.status} ${await allRes.text()}`)
      }

      return {
        stack: { id: stack.Id, name: stack.Name, status: stack.Status, type: stack.Type, endpointId: stack.EndpointId },
        containers: containers.map(c => ({
          id: c.Id, shortId: c.Id.slice(0, 12),
          names: c.Names.map((n: string) => n.replace(/^\//, '')),
          image: c.Image, status: c.Status, state: c.State,
          ports: c.Ports?.map((p: any) => p.PublicPort ? `${p.PublicPort}:${p.PrivatePort}` : null).filter(Boolean) ?? [],
        })),
      }
    } catch (e) {
      set.status = 500; return { error: `Status failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // Container logs (by connectionId)
  .get('/api/envman/portainer/connections/:id/stacks/:stackId/logs/:containerId', async ({ request, params, query, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    if (!hasCapability(caller, 'stack:operate')) { set.status = 403; return { error: 'Tidak punya izin lihat logs.' } }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Connection not found' } }
    const url = conn.portainerUrl.replace(/\/$/, '')

    // Need endpointId — fetch stack to get it
    const stackRes = await fetch(`${url}/api/stacks/${params.stackId}`, { headers: { 'X-API-Key': conn.apiToken } })
    if (!stackRes.ok) { set.status = 400; return { error: `Stack not found` } }
    const stack = await stackRes.json() as any

    const tail = Math.min(Number((query as any).tail) || 200, 1000)
    const stdout = (query as any).stdout !== '0' ? 1 : 0
    const stderr = (query as any).stderr !== '0' ? 1 : 0
    const timestamps = (query as any).timestamps !== '0' ? 1 : 0
    const since = (query as any).since as string | undefined  // ISO timestamp for incremental fetch

    try {
      const qs = new URLSearchParams({ stdout: String(stdout), stderr: String(stderr), tail: String(tail), timestamps: String(timestamps) })
      if (since) qs.set('since', since)
      const res = await fetch(`${url}/api/endpoints/${stack.EndpointId}/docker/containers/${params.containerId}/logs?${qs}`, { headers: { 'X-API-Key': conn.apiToken } })
      if (!res.ok) { set.status = 400; return { error: `Logs error ${res.status}: ${await res.text()}` } }

      const buf = Buffer.from(await res.arrayBuffer())
      const lines: { stream: 'stdout' | 'stderr'; timestamp: string | null; message: string }[] = []
      let offset = 0
      while (offset < buf.length) {
        if (offset + 8 > buf.length) break
        const streamType = buf[offset]
        const size = buf.readUInt32BE(offset + 4)
        offset += 8
        if (offset + size > buf.length) break
        const payload = buf.slice(offset, offset + size).toString('utf8')
        offset += size
        for (const raw of payload.split('\n')) {
          const line = raw.trimEnd()
          if (!line) continue
          let timestamp: string | null = null; let message = line
          if (timestamps) {
            const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s(.*)$/)
            if (tsMatch) { timestamp = tsMatch[1]; message = tsMatch[2] }
          }
          lines.push({ stream: streamType === 2 ? 'stderr' : 'stdout', timestamp, message })
        }
      }
      return { lines, total: lines.length }
    } catch (e) {
      set.status = 500; return { error: `Logs failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // Compose file viewer
  .get('/api/envman/portainer/connections/:id/stacks/:stackId/file', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    if (!hasCapability(caller, 'stack:operate')) { set.status = 403; return { error: 'Tidak punya izin lihat compose file.' } }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Connection not found' } }
    const url = conn.portainerUrl.replace(/\/$/, '')
    try {
      const res = await fetch(`${url}/api/stacks/${params.stackId}/file`, { headers: { 'X-API-Key': conn.apiToken } })
      if (!res.ok) { set.status = 400; return { error: `Portainer error ${res.status}` } }
      const data = await res.json() as any
      return { content: data.StackFileContent ?? '' }
    } catch (e) {
      set.status = 500; return { error: `Failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // Compose file editor (save)
  .put('/api/envman/portainer/connections/:id/stacks/:stackId/file', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    if (!hasCapability(caller, 'stack:mutate')) { set.status = 403; return { error: 'Tidak punya izin edit compose file.' } }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Connection not found' } }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const body = await request.json().catch(() => null) as any
    if (!body?.content) { set.status = 400; return { error: 'content required' } }
    try {
      const stackRes = await fetch(`${url}/api/stacks/${params.stackId}`, { headers: { 'X-API-Key': conn.apiToken } })
      if (!stackRes.ok) { set.status = 400; return { error: `Stack not found` } }
      const stack = await stackRes.json() as any
      const res = await fetch(`${url}/api/stacks/${params.stackId}?endpointId=${stack.EndpointId}`, {
        method: 'PUT',
        headers: { 'X-API-Key': conn.apiToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ StackFileContent: body.content, Env: stack.Env ?? [], Prune: false, PullImage: false }),
      })
      if (!res.ok) { set.status = 400; return { error: `Save failed: ${res.status} ${await res.text()}` } }
      appLog('info', `[portainer:compose-save] connection=${conn.name} stack=${params.stackId}`)
      return { ok: true }
    } catch (e) {
      set.status = 500; return { error: `Failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // Container restart
  .post('/api/envman/portainer/connections/:id/stacks/:stackId/containers/:containerId/restart', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    if (!hasCapability(caller, 'stack:mutate')) { set.status = 403; return { error: 'Tidak punya izin restart container.' } }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Connection not found' } }
    const url = conn.portainerUrl.replace(/\/$/, '')
    try {
      const stackRes = await fetch(`${url}/api/stacks/${params.stackId}`, { headers: { 'X-API-Key': conn.apiToken } })
      if (!stackRes.ok) { set.status = 400; return { error: `Stack not found` } }
      const stack = await stackRes.json() as any
      const res = await fetch(`${url}/api/endpoints/${stack.EndpointId}/docker/containers/${params.containerId}/restart`, {
        method: 'POST', headers: { 'X-API-Key': conn.apiToken },
      })
      if (!res.ok) { set.status = 400; return { error: `Restart failed: ${res.status}` } }
      appLog('info', `[portainer:restart] connection=${conn.name} container=${params.containerId.slice(0, 12)}`)
      return { ok: true }
    } catch (e) {
      set.status = 500; return { error: `Failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // Container stats (CPU%, memory, network)
  .get('/api/envman/portainer/connections/:id/stacks/:stackId/containers/:containerId/stats', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    if (!hasCapability(caller, 'stack:operate')) { set.status = 403; return { error: 'Tidak punya izin lihat container stats.' } }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Connection not found' } }
    const url = conn.portainerUrl.replace(/\/$/, '')
    try {
      const stackRes = await fetch(`${url}/api/stacks/${params.stackId}`, { headers: { 'X-API-Key': conn.apiToken } })
      if (!stackRes.ok) { set.status = 400; return { error: `Stack not found` } }
      const stack = await stackRes.json() as any
      const res = await fetch(`${url}/api/endpoints/${stack.EndpointId}/docker/containers/${params.containerId}/stats?stream=false`, { headers: { 'X-API-Key': conn.apiToken } })
      if (!res.ok) { set.status = 400; return { error: `Stats error ${res.status}` } }
      const s = await res.json() as any
      // CPU calculation
      const cpuDelta = (s.cpu_stats?.cpu_usage?.total_usage ?? 0) - (s.precpu_stats?.cpu_usage?.total_usage ?? 0)
      const systemDelta = (s.cpu_stats?.system_cpu_usage ?? 0) - (s.precpu_stats?.system_cpu_usage ?? 0)
      const numCPUs = s.cpu_stats?.online_cpus ?? s.cpu_stats?.cpu_usage?.percpu_usage?.length ?? 1
      const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * numCPUs * 100 : 0
      // Memory
      const memUsage = s.memory_stats?.usage ?? 0
      const memCache = s.memory_stats?.stats?.cache ?? 0
      const memLimit = s.memory_stats?.limit ?? 0
      const memUsageMB = Math.round((memUsage - memCache) / 1024 / 1024)
      const memLimitMB = Math.round(memLimit / 1024 / 1024)
      const memPercent = memLimit > 0 ? ((memUsage - memCache) / memLimit) * 100 : 0
      // Network
      const netStats = s.networks ?? {}
      const netRx = Object.values(netStats).reduce((acc: number, n: any) => acc + (n.rx_bytes ?? 0), 0)
      const netTx = Object.values(netStats).reduce((acc: number, n: any) => acc + (n.tx_bytes ?? 0), 0)
      return {
        cpuPercent: Math.round(cpuPercent * 10) / 10,
        memUsageMB,
        memLimitMB,
        memPercent: Math.round(memPercent * 10) / 10,
        netRxMB: Math.round(netRx / 1024 / 1024 * 100) / 100,
        netTxMB: Math.round(netTx / 1024 / 1024 * 100) / 100,
      }
    } catch (e) {
      set.status = 500; return { error: `Failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // Connection health (stack summary)
  .get('/api/envman/portainer/connections/:id/health', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    if (!hasCapability(caller, 'connection:view')) { set.status = 403; return { error: 'Tidak punya izin lihat connection health.' } }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Connection not found' } }
    const url = conn.portainerUrl.replace(/\/$/, '')
    try {
      const res = await fetch(`${url}/api/stacks`, { headers: { 'X-API-Key': conn.apiToken } })
      if (!res.ok) { set.status = 400; return { error: `Portainer error ${res.status}` } }
      const stacks = await res.json() as any[]
      const activeStacks = stacks.filter(s => s.Status === 1).length
      return { totalStacks: stacks.length, activeStacks, inactiveStacks: stacks.length - activeStacks }
    } catch (e) {
      set.status = 500; return { error: `Failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // Repull image (by connectionId)
  .post('/api/envman/portainer/connections/:id/stacks/:stackId/repull', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    if (!hasCapability(caller, 'stack:mutate')) { set.status = 403; return { error: 'Tidak punya izin repull image.' } }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Connection not found' } }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const stackId = Number(params.stackId)
    try {
      const fileRes = await fetch(`${url}/api/stacks/${stackId}/file`, { headers: { 'X-API-Key': conn.apiToken } })
      if (!fileRes.ok) { set.status = 400; return { error: `Stack file error ${fileRes.status}` } }
      const { StackFileContent } = await fileRes.json() as { StackFileContent: string }
      const stackRes = await fetch(`${url}/api/stacks/${stackId}`, { headers: { 'X-API-Key': conn.apiToken } })
      const stackData = stackRes.ok ? await stackRes.json() as any : { Env: [], EndpointId: 1 }
      const res = await fetch(`${url}/api/stacks/${stackId}?endpointId=${stackData.EndpointId}`, {
        method: 'PUT',
        headers: { 'X-API-Key': conn.apiToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ StackFileContent, Env: stackData.Env ?? [], Prune: false, PullImage: true }),
      })
      if (!res.ok) { set.status = 400; return { error: `Repull failed: ${res.status} ${await res.text()}` } }
      appLog('info', `Portainer repull via connection ${conn.name}: stack ${stackId}`)
      return { ok: true, stackName: stackData.Name }
    } catch (e) {
      set.status = 500; return { error: `Repull failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // Force recreate (stop → start, by connectionId)
  .post('/api/envman/portainer/connections/:id/stacks/:stackId/recreate', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    if (!hasCapability(caller, 'stack:mutate')) { set.status = 403; return { error: 'Tidak punya izin recreate stack.' } }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Connection not found' } }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const stackId = Number(params.stackId)
    try {
      const stackRes = await fetch(`${url}/api/stacks/${stackId}`, { headers: { 'X-API-Key': conn.apiToken } })
      const stackData = stackRes.ok ? await stackRes.json() as any : { EndpointId: 1, Name: String(stackId) }
      const endpointId = stackData.EndpointId ?? 1
      const stopRes = await fetch(`${url}/api/stacks/${stackId}/stop?endpointId=${endpointId}`, { method: 'POST', headers: { 'X-API-Key': conn.apiToken } })
      if (!stopRes.ok) { set.status = 400; return { error: `Stop failed: ${stopRes.status}` } }
      const startRes = await fetch(`${url}/api/stacks/${stackId}/start?endpointId=${endpointId}`, { method: 'POST', headers: { 'X-API-Key': conn.apiToken } })
      if (!startRes.ok) { set.status = 400; return { error: `Start failed: ${startRes.status}` } }
      appLog('info', `Portainer recreate via connection ${conn.name}: stack ${stackId}`)
      return { ok: true, stackName: stackData.Name }
    } catch (e) {
      set.status = 500; return { error: `Recreate failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // Dangling images (by connectionId, endpointId from query or default 1)
  .get('/api/envman/portainer/connections/:id/images/dangling', async ({ request, params, query, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    if (!hasCapability(caller, 'stack:operate')) { set.status = 403; return { error: 'Tidak punya izin lihat dangling images.' } }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Connection not found' } }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const endpointId = Number((query as any).endpointId) || 1
    try {
      const filters = encodeURIComponent(JSON.stringify({ dangling: ['true'] }))
      const res = await fetch(`${url}/api/endpoints/${endpointId}/docker/images/json?filters=${filters}`, { headers: { 'X-API-Key': conn.apiToken } })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        appLog('warn', `[portainer:dangling] endpointId=${endpointId} status=${res.status} body=${errText}`)
        set.status = 400; return { error: `Portainer error ${res.status}: ${errText}` }
      }
      const images = await res.json() as any[]
      const totalSize = images.reduce((acc, img) => acc + (img.Size ?? 0), 0)
      return {
        images: images.map(img => ({ id: img.Id.replace('sha256:', '').slice(0, 12), tags: img.RepoTags ?? [], size: img.Size, created: img.Created })),
        count: images.length,
        totalSizeMB: Math.round(totalSize / 1024 / 1024),
        endpointId,
      }
    } catch (e) {
      set.status = 500; return { error: `Failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // Stopped containers (by connectionId, endpointId from query)
  .get('/api/envman/portainer/connections/:id/containers/stopped', async ({ request, params, query, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    if (!hasCapability(caller, 'stack:operate')) { set.status = 403; return { error: 'Tidak punya izin.' } }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Connection not found' } }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const endpointId = Number((query as any).endpointId) || 1
    try {
      const filters = encodeURIComponent(JSON.stringify({ status: ['exited', 'dead'] }))
      const res = await fetch(`${url}/api/endpoints/${endpointId}/docker/containers/json?all=1&filters=${filters}`, { headers: { 'X-API-Key': conn.apiToken } })
      if (!res.ok) { const t = await res.text().catch(() => ''); set.status = 400; return { error: `Portainer error ${res.status}: ${t}` } }
      const containers = await res.json() as any[]
      const totalSize = containers.reduce((acc, c) => acc + (c.SizeRootFs ?? 0), 0)
      return {
        containers: containers.map(c => ({
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
      set.status = 500; return { error: `Failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // Unused volumes (by connectionId, endpointId from query)
  .get('/api/envman/portainer/connections/:id/volumes/unused', async ({ request, params, query, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    if (!hasCapability(caller, 'stack:operate')) { set.status = 403; return { error: 'Tidak punya izin.' } }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Connection not found' } }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const endpointId = Number((query as any).endpointId) || 1
    try {
      const filters = encodeURIComponent(JSON.stringify({ dangling: ['true'] }))
      const res = await fetch(`${url}/api/endpoints/${endpointId}/docker/volumes?filters=${filters}`, { headers: { 'X-API-Key': conn.apiToken } })
      if (!res.ok) { const t = await res.text().catch(() => ''); set.status = 400; return { error: `Portainer error ${res.status}: ${t}` } }
      const data = await res.json() as any
      const volumes = (data.Volumes ?? []) as any[]
      return {
        volumes: volumes.map(v => ({ name: v.Name, driver: v.Driver, mountpoint: v.Mountpoint, createdAt: v.CreatedAt })),
        count: volumes.length,
        endpointId,
      }
    } catch (e) {
      set.status = 500; return { error: `Failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // Unused networks (by connectionId, endpointId from query)
  .get('/api/envman/portainer/connections/:id/networks/unused', async ({ request, params, query, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    if (!hasCapability(caller, 'stack:operate')) { set.status = 403; return { error: 'Tidak punya izin.' } }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Connection not found' } }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const endpointId = Number((query as any).endpointId) || 1
    try {
      const filters = encodeURIComponent(JSON.stringify({ dangling: ['true'] }))
      const res = await fetch(`${url}/api/endpoints/${endpointId}/docker/networks?filters=${filters}`, { headers: { 'X-API-Key': conn.apiToken } })
      if (!res.ok) { const t = await res.text().catch(() => ''); set.status = 400; return { error: `Portainer error ${res.status}: ${t}` } }
      const networks = await res.json() as any[]
      return {
        networks: networks.map(n => ({ id: n.Id?.slice(0, 12), name: n.Name, driver: n.Driver, scope: n.Scope })),
        count: networks.length,
        endpointId,
      }
    } catch (e) {
      set.status = 500; return { error: `Failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // Prune images (by connectionId)
  .post('/api/envman/portainer/connections/:id/prune/images', async ({ request, params, query, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    if (!hasCapability(caller, 'stack:prune')) { set.status = 403; return { error: 'Tidak punya izin prune images.' } }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Connection not found' } }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const endpointId = Number((query as any).endpointId) || 1
    try {
      const res = await fetch(`${url}/api/endpoints/${endpointId}/docker/images/prune`, {
        method: 'POST', headers: { 'X-API-Key': conn.apiToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ Filters: { dangling: ['true'] } }),
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        appLog('warn', `[portainer:prune-images] failed ${res.status}: ${errText}`)
        set.status = 400; return { error: `Prune failed: ${res.status}: ${errText}` }
      }
      const result = await res.json() as any
      const reclaimedMB = Math.round((result.SpaceReclaimed ?? 0) / 1024 / 1024)
      appLog('info', `[portainer:prune-images] deleted=${result.ImagesDeleted?.length ?? 0} reclaimed=${reclaimedMB}MB`)

      // Cek sisa dangling images setelah prune (image yang masih direferensi container stopped)
      const filters2 = encodeURIComponent(JSON.stringify({ dangling: ['true'] }))
      const remainRes = await fetch(`${url}/api/endpoints/${endpointId}/docker/images/json?filters=${filters2}`, { headers: { 'X-API-Key': conn.apiToken } })
      let remaining: any[] = []
      if (remainRes.ok) remaining = await remainRes.json() as any[]
      if (remaining.length > 0) {
        // Cek apakah ada container stopped yang pakai image ini
        const allContainersRes = await fetch(`${url}/api/endpoints/${endpointId}/docker/containers/json?all=1`, { headers: { 'X-API-Key': conn.apiToken } })
        const allContainers = allContainersRes.ok ? await allContainersRes.json() as any[] : []
        const usedImageIds = new Set(allContainers.map((c: any) => c.ImageID))
        const stuck = remaining.filter((img: any) => usedImageIds.has(img.Id))
        appLog('info', `[portainer:prune-images] remaining=${remaining.length} stuck_by_stopped_containers=${stuck.length}`)
        return {
          ok: true,
          deletedCount: result.ImagesDeleted?.length ?? 0,
          reclaimedMB,
          remaining: remaining.length,
          stuckByContainers: stuck.length,
          stuckImages: stuck.map((img: any) => ({ id: img.Id.replace('sha256:', '').slice(0, 12), tags: img.RepoTags ?? [] })),
        }
      }

      return { ok: true, deletedCount: result.ImagesDeleted?.length ?? 0, reclaimedMB, remaining: 0, stuckByContainers: 0 }
    } catch (e) {
      set.status = 500; return { error: `Prune failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // Prune volumes (by connectionId)
  .post('/api/envman/portainer/connections/:id/prune/volumes', async ({ request, params, query, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    if (!hasCapability(caller, 'stack:prune')) { set.status = 403; return { error: 'Tidak punya izin prune volumes.' } }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Connection not found' } }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const endpointId = Number((query as any).endpointId) || 1
    try {
      const res = await fetch(`${url}/api/endpoints/${endpointId}/docker/volumes/prune`, { method: 'POST', headers: { 'X-API-Key': conn.apiToken, 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      if (!res.ok) { set.status = 400; return { error: `Prune volumes failed: ${res.status}` } }
      const result = await res.json() as any
      const reclaimedMB = Math.round((result.SpaceReclaimed ?? 0) / 1024 / 1024)
      appLog('info', `Portainer prune volumes via connection ${conn.name}`)
      return { ok: true, deletedVolumes: result.VolumesDeleted ?? [], reclaimedMB }
    } catch (e) {
      set.status = 500; return { error: `Prune volumes failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // Prune networks (by connectionId)
  .post('/api/envman/portainer/connections/:id/prune/networks', async ({ request, params, query, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    if (!hasCapability(caller, 'stack:prune')) { set.status = 403; return { error: 'Tidak punya izin prune networks.' } }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Connection not found' } }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const endpointId = Number((query as any).endpointId) || 1
    try {
      const res = await fetch(`${url}/api/endpoints/${endpointId}/docker/networks/prune`, { method: 'POST', headers: { 'X-API-Key': conn.apiToken, 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      if (!res.ok) { set.status = 400; return { error: `Prune networks failed: ${res.status}` } }
      const result = await res.json() as any
      appLog('info', `Portainer prune networks via connection ${conn.name}`)
      return { ok: true, deletedNetworks: result.NetworksDeleted ?? [] }
    } catch (e) {
      set.status = 500; return { error: `Prune networks failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // Prune stopped containers (by connectionId)
  .post('/api/envman/portainer/connections/:id/prune/containers', async ({ request, params, query, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    if (!hasCapability(caller, 'stack:prune')) { set.status = 403; return { error: 'Tidak punya izin prune containers.' } }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Connection not found' } }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const endpointId = Number((query as any).endpointId) || 1
    try {
      const res = await fetch(`${url}/api/endpoints/${endpointId}/docker/containers/prune`, { method: 'POST', headers: { 'X-API-Key': conn.apiToken, 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      if (!res.ok) { const t = await res.text().catch(() => ''); set.status = 400; return { error: `Prune containers failed: ${res.status}: ${t}` } }
      const result = await res.json() as any
      const reclaimedMB = Math.round((result.SpaceReclaimed ?? 0) / 1024 / 1024)
      appLog('info', `Portainer prune containers via connection ${conn.name}`)
      return { ok: true, deletedContainers: result.ContainersDeleted ?? [], reclaimedMB }
    } catch (e) {
      set.status = 500; return { error: `Prune containers failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

      // ─── Portainer Integration ────────────────────────────
  .get('/api/envman/projects/:slug/environments/:envName/portainer', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access) { set.status = 403; return { error: 'No access' } }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) { set.status = 404; return { error: 'Project not found' } }
    const cfg = await prisma.portainerConfig.findUnique({ where: { projectId_envName: { projectId: project.id, envName: params.envName } }, include: { additionalTargets: true } })
    if (!cfg) return { config: null, unsyncedCount: 0 }
    // Resolve connection details for response
    const conn = cfg.connectionId ? await prisma.portainerConnection.findUnique({ where: { id: cfg.connectionId }, select: { id: true, name: true, portainerUrl: true } }) : null
    // Count vars changed since last sync
    const env = await prisma.environment.findUnique({ where: { projectId_name: { projectId: project.id, name: params.envName } } })
    const unsyncedCount = env ? await prisma.envVar.count({
      where: {
        environmentId: env.id,
        isDisabled: false,
        ...(cfg.lastSyncAt ? { updatedAt: { gt: cfg.lastSyncAt } } : {}),
      }
    }) : 0
    return {
      config: {
        id: cfg.id, stackId: cfg.stackId, stackName: cfg.stackName, endpointId: cfg.endpointId,
        lastSyncAt: cfg.lastSyncAt, lastSyncOk: cfg.lastSyncOk,
        connectionId: cfg.connectionId, connectionName: conn?.name, portainerUrl: conn?.portainerUrl ?? cfg.portainerUrl,
        apiToken: '***',
        autoSync: cfg.autoSync,
        additionalTargets: cfg.additionalTargets.map(t => ({ id: t.id, stackId: t.stackId, stackName: t.stackName, endpointId: t.endpointId, label: t.label })),
      },
      unsyncedCount,
    }
      })

  .put('/api/envman/projects/:slug/environments/:envName/portainer', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access || access === 'VIEWER') { set.status = 403; return { error: 'Editor or Owner required' } }
    const body = await request.json().catch(() => null)
    if (!body?.stackId || !body?.stackName) { set.status = 400; return { error: 'stackId and stackName required' } }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) { set.status = 404; return { error: 'Project not found' } }
    const existing = await prisma.portainerConfig.findUnique({ where: { projectId_envName: { projectId: project.id, envName: params.envName } } })

    if (body.connectionId) {
      // New flow: use global connection
      const conn = await prisma.portainerConnection.findUnique({ where: { id: body.connectionId } })
      if (!conn) { set.status = 404; return { error: 'Connection not found' } }
      const cfg = await prisma.portainerConfig.upsert({
        where: { projectId_envName: { projectId: project.id, envName: params.envName } },
        update: { connectionId: body.connectionId, stackId: body.stackId, stackName: body.stackName, endpointId: body.endpointId ?? 1, portainerUrl: null, apiToken: null },
        create: { projectId: project.id, envName: params.envName, connectionId: body.connectionId, stackId: body.stackId, stackName: body.stackName, endpointId: body.endpointId ?? 1 },
      })
      return { config: { id: cfg.id, connectionId: conn.id, connectionName: conn.name, portainerUrl: conn.portainerUrl, stackId: cfg.stackId, stackName: cfg.stackName, endpointId: cfg.endpointId } }
    }

    // Legacy flow: direct URL + token
    if (!body.portainerUrl) { set.status = 400; return { error: 'connectionId or portainerUrl required' } }
    const apiToken = body.apiToken || existing?.apiToken
    if (!apiToken) { set.status = 400; return { error: 'apiToken required for new configuration' } }
    const cfg = await prisma.portainerConfig.upsert({
      where: { projectId_envName: { projectId: project.id, envName: params.envName } },
      update: { portainerUrl: body.portainerUrl, apiToken, stackId: body.stackId, stackName: body.stackName, endpointId: body.endpointId ?? 1, connectionId: null },
      create: { projectId: project.id, envName: params.envName, portainerUrl: body.portainerUrl, apiToken, stackId: body.stackId, stackName: body.stackName, endpointId: body.endpointId ?? 1 },
    })
    return { config: { id: cfg.id, portainerUrl: cfg.portainerUrl, stackId: cfg.stackId, stackName: cfg.stackName, endpointId: cfg.endpointId } }
      })

  // Update autoSync + additional stack targets
  .patch('/api/envman/projects/:slug/environments/:envName/portainer', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access || access === 'VIEWER') { set.status = 403; return { error: 'Editor or Owner required' } }
    const body = await request.json().catch(() => null) as any
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) { set.status = 404; return { error: 'Project not found' } }
    const cfg = await prisma.portainerConfig.findUnique({ where: { projectId_envName: { projectId: project.id, envName: params.envName } } })
    if (!cfg) { set.status = 404; return { error: 'Portainer not configured' } }

    if (typeof body?.autoSync === 'boolean') {
      await prisma.portainerConfig.update({ where: { id: cfg.id }, data: { autoSync: body.autoSync } })
    }

    // Add additional target
    if (body?.addTarget) {
      const t = body.addTarget
      await prisma.portainerStackTarget.create({ data: { configId: cfg.id, connectionId: t.connectionId ?? cfg.connectionId, stackId: t.stackId, stackName: t.stackName, endpointId: t.endpointId ?? 1, label: t.label ?? null } })
    }

    // Remove additional target
    if (body?.removeTargetId) {
      await prisma.portainerStackTarget.deleteMany({ where: { id: body.removeTargetId, configId: cfg.id } })
    }

    const updatedCfg = await prisma.portainerConfig.findUnique({ where: { id: cfg.id }, include: { additionalTargets: true } })
    return { ok: true, autoSync: updatedCfg?.autoSync, additionalTargets: updatedCfg?.additionalTargets }
  })

  .delete('/api/envman/projects/:slug/environments/:envName/portainer', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access || access !== 'OWNER') { set.status = 403; return { error: 'Owner required' } }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) { set.status = 404; return { error: 'Project not found' } }
    await prisma.portainerConfig.delete({ where: { projectId_envName: { projectId: project.id, envName: params.envName } } }).catch(() => {})
    return { ok: true }
      })

      // Probe Portainer — list stacks (for setup wizard)
  .post('/api/envman/portainer/probe', async ({ request, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const body = await request.json().catch(() => null)
    if (!body?.portainerUrl) { set.status = 400; return { error: 'portainerUrl required' } }
    // Allow probing with existing stored token (pass slug+envName to look it up)
    let apiToken = body.apiToken
    if (!apiToken && body.slug && body.envName) {
      const proj = await prisma.project.findUnique({ where: { slug: body.slug } })
      if (proj) {
        const stored = await prisma.portainerConfig.findUnique({ where: { projectId_envName: { projectId: proj.id, envName: body.envName } } })
        apiToken = stored?.apiToken
      }
    }
    if (!apiToken) { set.status = 400; return { error: 'apiToken required' } }
    const url = body.portainerUrl.replace(/\/$/, '')
    try {
      const res = await fetch(`${url}/api/stacks`, { headers: { 'X-API-Key': apiToken } })
      if (!res.ok) { set.status = 400; return { error: `Portainer returned ${res.status}: ${await res.text()}` } }
      const stacks = await res.json() as any[]
      return { stacks: stacks.map(s => ({ id: s.Id, name: s.Name, endpointId: s.EndpointId })) }
    } catch (e) {
      set.status = 400
      return { error: `Cannot reach Portainer: ${e instanceof Error ? e.message : String(e)}` }
    }
      })

      // Sync env vars to Portainer stack
  .post('/api/envman/projects/:slug/environments/:envName/portainer/sync', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access || access === 'VIEWER') { set.status = 403; return { error: 'Editor or Owner required' } }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) { set.status = 404; return { error: 'Project not found' } }
    const cfg = await prisma.portainerConfig.findUnique({ where: { projectId_envName: { projectId: project.id, envName: params.envName } } })
    if (!cfg) { set.status = 404; return { error: 'Portainer not configured for this environment' } }
    const environment = await prisma.environment.findUnique({ where: { projectId_name: { projectId: project.id, name: params.envName } }, include: { vars: true } })
    if (!environment) { set.status = 404; return { error: 'Environment not found' } }
    // Resolve URL + token: prefer global connection, fall back to legacy direct fields
    let portainerUrl: string, portainerToken: string
    if (cfg.connectionId) {
      const conn = await prisma.portainerConnection.findUnique({ where: { id: cfg.connectionId } })
      if (!conn) { set.status = 400; return { error: 'Portainer connection not found — reconfigure' } }
      portainerUrl = conn.portainerUrl
      portainerToken = conn.apiToken
    } else {
      if (!cfg.portainerUrl || !cfg.apiToken) { set.status = 400; return { error: 'Portainer not configured' } }
      portainerUrl = cfg.portainerUrl
      portainerToken = cfg.apiToken
    }
    const url = portainerUrl.replace(/\/$/, '')
    try {
      // Get current stack file from Portainer
      const fileRes = await fetch(`${url}/api/stacks/${cfg.stackId}/file`, { headers: { 'X-API-Key': portainerToken } })
      if (!fileRes.ok) { set.status = 400; return { error: `Portainer stack file error: ${fileRes.status}` } }
      const { StackFileContent: rawStackFile } = await fileRes.json() as { StackFileContent: string }
      // Inject env_file: stack.env into each service that doesn't have it,
      // so vars appear in container environment (not just compose substitution)
      const stackFileContent = injectEnvFileIntoCompose(rawStackFile)
      // Escape values for Docker Compose stack.env file format
      const escapeEnvValue = (val: string) => val.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
      const portainerEnv = environment.vars.filter(v => !v.isDisabled).map(v => ({
        name: v.key,
        value: escapeEnvValue(v.isSecret ? decryptSecret(v.value) : v.value),
      }))
      const startMs = Date.now()
      const syncToStack = async (stackId: number, endpointId: number, stackUrl: string, token: string) => {
        const fileRes = await fetch(`${stackUrl}/api/stacks/${stackId}/file`, { headers: { 'X-API-Key': token } })
        if (!fileRes.ok) throw new Error(`Stack file error: ${fileRes.status}`)
        const { StackFileContent: rawFile } = await fileRes.json() as { StackFileContent: string }
        const content = injectEnvFileIntoCompose(rawFile)
        const syncRes = await fetch(`${stackUrl}/api/stacks/${stackId}?endpointId=${endpointId}`, {
          method: 'PUT',
          headers: { 'X-API-Key': token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ StackFileContent: content, Env: portainerEnv, Prune: false }),
        })
        if (!syncRes.ok) throw new Error(`Portainer sync error ${syncRes.status}: ${await syncRes.text()}`)
      }

      // Sync primary stack
      await syncToStack(cfg.stackId, cfg.endpointId, url, portainerToken)

      // Sync additional targets (multi-stack)
      const additionalTargets = await prisma.portainerStackTarget.findMany({ where: { configId: cfg.id } })
      const targetResults: { stackName: string; ok: boolean; error?: string }[] = []
      for (const target of additionalTargets) {
        try {
          let tUrl = url; let tToken = portainerToken
          if (target.connectionId && target.connectionId !== cfg.connectionId) {
            const tConn = await prisma.portainerConnection.findUnique({ where: { id: target.connectionId } })
            if (tConn) { tUrl = tConn.portainerUrl.replace(/\/$/, ''); tToken = tConn.apiToken }
          }
          await syncToStack(target.stackId, target.endpointId, tUrl, tToken)
          targetResults.push({ stackName: target.stackName, ok: true })
        } catch (e) {
          targetResults.push({ stackName: target.stackName, ok: false, error: e instanceof Error ? e.message : String(e) })
        }
      }

      const durationMs = Date.now() - startMs
      const secretCount = environment.vars.filter(v => v.isSecret && !v.isDisabled).length
      const varsCount = environment.vars.filter(v => !v.isDisabled).length
      const body = await request.json().catch(() => ({})) as any
      const triggeredBy = (body as any)?.triggeredBy ?? 'manual'

      await prisma.portainerConfig.update({ where: { id: cfg.id }, data: { lastSyncAt: new Date(), lastSyncOk: true } })
      await prisma.portainerSyncLog.create({ data: { configId: cfg.id, userId: caller.userId, triggeredBy, varsCount, secretCount, ok: true, durationMs } })
      appLog('info', `Portainer sync: ${params.slug}:${params.envName} → stack ${cfg.stackName} (${varsCount} vars, ${durationMs}ms)`)
      return { ok: true, varsCount, stackName: cfg.stackName, durationMs, additionalTargets: targetResults }
    } catch (e) {
      const durationMs = Date.now()
      const errMsg = e instanceof Error ? e.message : String(e)
      await prisma.portainerConfig.update({ where: { id: cfg.id }, data: { lastSyncAt: new Date(), lastSyncOk: false } }).catch(() => {})
      await prisma.portainerSyncLog.create({ data: { configId: cfg.id, userId: caller.userId, triggeredBy: 'manual', varsCount: 0, ok: false, error: errMsg, durationMs: 0 } }).catch(() => {})
      set.status = 500
      return { error: `Sync failed: ${errMsg}` }
    }
  })

  // Sync history
  .get('/api/envman/projects/:slug/environments/:envName/portainer/history', async ({ request, params, query, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access) { set.status = 403; return { error: 'No access' } }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) { set.status = 404; return { error: 'Project not found' } }
    const cfg = await prisma.portainerConfig.findUnique({ where: { projectId_envName: { projectId: project.id, envName: params.envName } } })
    if (!cfg) return { logs: [] }
    const limit = Math.min(Number((query as any).limit) || 20, 100)
    const logs = await prisma.portainerSyncLog.findMany({
      where: { configId: cfg.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    return { logs }
  })

  // ─── Stack Status (services + containers) ────────────────────────────────
  .get('/api/envman/projects/:slug/environments/:envName/portainer/status', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access) { set.status = 403; return { error: 'No access' } }
    const cfg = await getPortainerCfg(params.slug, params.envName)
    if (!cfg) { set.status = 404; return { error: 'Portainer not configured' } }
    const conn = await resolveConn(cfg)
    if (!conn) { set.status = 400; return { error: 'Connection not found' } }
    try {
      // Get stack details
      const stackRes = await fetch(`${conn.url}/api/stacks/${cfg.stackId}`, { headers: { 'X-API-Key': conn.token } })
      if (!stackRes.ok) { set.status = 400; return { error: `Portainer error ${stackRes.status}` } }
      const stack = await stackRes.json() as any

      // Get containers filtered by compose project label
      const label = encodeURIComponent(JSON.stringify({ 'com.docker.compose.project': [cfg.stackName] }))
      const cRes = await fetch(`${conn.url}/api/endpoints/${cfg.endpointId}/docker/containers/json?all=1&filters=${label}`, { headers: { 'X-API-Key': conn.token } })
      const containers = cRes.ok ? (await cRes.json() as any[]) : []

      return {
        stack: {
          id: stack.Id,
          name: stack.Name,
          status: stack.Status, // 1=active, 2=inactive
          type: stack.Type,     // 1=swarm, 2=compose
          endpointId: stack.EndpointId,
          createdAt: stack.CreationDate,
          updatedAt: stack.UpdateDate,
        },
        containers: containers.map(c => ({
          id: c.Id.slice(0, 12),
          names: c.Names.map((n: string) => n.replace(/^\//, '')),
          image: c.Image,
          status: c.Status,
          state: c.State, // running, exited, paused, etc
          created: c.Created,
          ports: c.Ports?.map((p: any) => p.PublicPort ? `${p.PublicPort}:${p.PrivatePort}` : null).filter(Boolean) ?? [],
        })),
      }
    } catch (e) {
      set.status = 500
      return { error: `Status fetch failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // ─── Pre-sync Diff ────────────────────────────────────────────────────────
  .post('/api/envman/projects/:slug/environments/:envName/portainer/sync-preview', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access || access === 'VIEWER') { set.status = 403; return { error: 'Editor or Owner required' } }
    const cfg = await getPortainerCfg(params.slug, params.envName)
    if (!cfg) { set.status = 404; return { error: 'Portainer not configured' } }
    const conn = await resolveConn(cfg)
    if (!conn) { set.status = 400; return { error: 'Connection not found' } }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) { set.status = 404; return { error: 'Project not found' } }
    try {
      // Fetch current env from Portainer stack
      const stackRes = await fetch(`${conn.url}/api/stacks/${cfg.stackId}`, { headers: { 'X-API-Key': conn.token } })
      if (!stackRes.ok) { set.status = 400; return { error: `Portainer error ${stackRes.status}` } }
      const stack = await stackRes.json() as any
      const currentEnv: Record<string, string> = {}
      for (const e of (stack.Env ?? [])) currentEnv[e.name] = e.value

      // Fetch envman vars
      const environment = await prisma.environment.findUnique({ where: { projectId_name: { projectId: project.id, name: params.envName } }, include: { vars: true } })
      if (!environment) { set.status = 404; return { error: 'Environment not found' } }
      const proposed: Record<string, string> = {}
      for (const v of environment.vars.filter(v => !v.isDisabled)) {
        proposed[v.key] = v.isSecret ? '***' : v.value
      }

      const allKeys = new Set([...Object.keys(currentEnv), ...Object.keys(proposed)])
      const added: string[] = [], removed: string[] = [], changed: { key: string; oldValue: string; newValue: string }[] = [], unchanged: string[] = []
      for (const key of allKeys) {
        if (!(key in currentEnv)) { added.push(key) }
        else if (!(key in proposed)) { removed.push(key) }
        else if (currentEnv[key] !== proposed[key] && proposed[key] !== '***') { changed.push({ key, oldValue: currentEnv[key], newValue: proposed[key] }) }
        else { unchanged.push(key) }
      }

      return { current: currentEnv, proposed, diff: { added, removed, changed, unchanged, totalCurrent: Object.keys(currentEnv).length, totalProposed: Object.keys(proposed).length } }
    } catch (e) {
      set.status = 500
      return { error: `Preview failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // ─── Sync + Repull image terbaru (PullImage: true) ───────────────────────
  .post('/api/envman/projects/:slug/environments/:envName/portainer/repull', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access || access === 'VIEWER') { set.status = 403; return { error: 'Editor or Owner required' } }
    const cfg = await getPortainerCfg(params.slug, params.envName)
    if (!cfg) { set.status = 404; return { error: 'Portainer not configured' } }
    const conn = await resolveConn(cfg)
    if (!conn) { set.status = 400; return { error: 'Connection not found' } }
    try {
      // Fetch current stack file to preserve it
      const fileRes = await fetch(`${conn.url}/api/stacks/${cfg.stackId}/file`, { headers: { 'X-API-Key': conn.token } })
      if (!fileRes.ok) { set.status = 400; return { error: `Portainer stack file error: ${fileRes.status}` } }
      const { StackFileContent } = await fileRes.json() as { StackFileContent: string }

      // Fetch current env from stack (preserve existing env)
      const stackRes = await fetch(`${conn.url}/api/stacks/${cfg.stackId}`, { headers: { 'X-API-Key': conn.token } })
      const stackData = stackRes.ok ? await stackRes.json() as any : { Env: [] }

      const res = await fetch(`${conn.url}/api/stacks/${cfg.stackId}?endpointId=${cfg.endpointId}`, {
        method: 'PUT',
        headers: { 'X-API-Key': conn.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ StackFileContent, Env: stackData.Env ?? [], Prune: false, PullImage: true }),
      })
      if (!res.ok) { set.status = 400; return { error: `Repull failed: ${res.status} ${await res.text()}` } }
      appLog('info', `Portainer repull: ${params.slug}:${params.envName} → stack ${cfg.stackName}`)
      return { ok: true, stackName: cfg.stackName }
    } catch (e) {
      set.status = 500
      return { error: `Repull failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // ─── Force Recreate containers (stop → start) ────────────────────────────
  .post('/api/envman/projects/:slug/environments/:envName/portainer/recreate', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access || access === 'VIEWER') { set.status = 403; return { error: 'Editor or Owner required' } }
    const cfg = await getPortainerCfg(params.slug, params.envName)
    if (!cfg) { set.status = 404; return { error: 'Portainer not configured' } }
    const conn = await resolveConn(cfg)
    if (!conn) { set.status = 400; return { error: 'Connection not found' } }
    try {
      const stopRes = await fetch(`${conn.url}/api/stacks/${cfg.stackId}/stop?endpointId=${cfg.endpointId}`, {
        method: 'POST', headers: { 'X-API-Key': conn.token },
      })
      if (!stopRes.ok) { set.status = 400; return { error: `Stop failed: ${stopRes.status} ${await stopRes.text()}` } }

      const startRes = await fetch(`${conn.url}/api/stacks/${cfg.stackId}/start?endpointId=${cfg.endpointId}`, {
        method: 'POST', headers: { 'X-API-Key': conn.token },
      })
      if (!startRes.ok) { set.status = 400; return { error: `Start failed: ${startRes.status} ${await startRes.text()}` } }

      appLog('info', `Portainer recreate: ${params.slug}:${params.envName} → stack ${cfg.stackName}`)
      return { ok: true, stackName: cfg.stackName }
    } catch (e) {
      set.status = 500
      return { error: `Recreate failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // ─── Repull + Sync vars sekaligus ────────────────────────────────────────
  .post('/api/envman/projects/:slug/environments/:envName/portainer/sync-repull', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access || access === 'VIEWER') { set.status = 403; return { error: 'Editor or Owner required' } }
    const cfg = await getPortainerCfg(params.slug, params.envName)
    if (!cfg) { set.status = 404; return { error: 'Portainer not configured' } }
    const conn = await resolveConn(cfg)
    if (!conn) { set.status = 400; return { error: 'Connection not found' } }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) { set.status = 404; return { error: 'Project not found' } }
    const environment = await prisma.environment.findUnique({ where: { projectId_name: { projectId: project.id, name: params.envName } }, include: { vars: true } })
    if (!environment) { set.status = 404; return { error: 'Environment not found' } }
    try {
      const fileRes = await fetch(`${conn.url}/api/stacks/${cfg.stackId}/file`, { headers: { 'X-API-Key': conn.token } })
      if (!fileRes.ok) { set.status = 400; return { error: `Stack file error: ${fileRes.status}` } }
      const { StackFileContent: rawStackFile } = await fileRes.json() as { StackFileContent: string }
      const stackFileContent = injectEnvFileIntoCompose(rawStackFile)
      const escapeEnvValue = (val: string) => val.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
      const portainerEnv = environment.vars.filter(v => !v.isDisabled).map(v => ({
        name: v.key,
        value: escapeEnvValue(v.isSecret ? decryptSecret(v.value) : v.value),
      }))
      const res = await fetch(`${conn.url}/api/stacks/${cfg.stackId}?endpointId=${cfg.endpointId}`, {
        method: 'PUT',
        headers: { 'X-API-Key': conn.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ StackFileContent: stackFileContent, Env: portainerEnv, Prune: false, PullImage: true }),
      })
      if (!res.ok) {
        await prisma.portainerConfig.update({ where: { id: cfg.id }, data: { lastSyncAt: new Date(), lastSyncOk: false } })
        set.status = 400
        return { error: `Sync+Repull failed: ${res.status} ${await res.text()}` }
      }
      await prisma.portainerConfig.update({ where: { id: cfg.id }, data: { lastSyncAt: new Date(), lastSyncOk: true } })
      appLog('info', `Portainer sync+repull: ${params.slug}:${params.envName} → stack ${cfg.stackName}`)
      return { ok: true, varsCount: environment.vars.length, stackName: cfg.stackName }
    } catch (e) {
      await prisma.portainerConfig.update({ where: { id: cfg.id }, data: { lastSyncAt: new Date(), lastSyncOk: false } }).catch(() => {})
      set.status = 500
      return { error: `Sync+Repull failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // ─── Preview dangling images ──────────────────────────────────────────────
  .get('/api/envman/projects/:slug/environments/:envName/portainer/images/dangling', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access) { set.status = 403; return { error: 'No access' } }
    const cfg = await getPortainerCfg(params.slug, params.envName)
    if (!cfg) { set.status = 404; return { error: 'Portainer not configured' } }
    const conn = await resolveConn(cfg)
    if (!conn) { set.status = 400; return { error: 'Connection not found' } }
    try {
      const filters = encodeURIComponent(JSON.stringify({ dangling: ['true'] }))
      const res = await fetch(`${conn.url}/api/endpoints/${cfg.endpointId}/docker/images/json?filters=${filters}`, { headers: { 'X-API-Key': conn.token } })
      if (!res.ok) { set.status = 400; return { error: `Portainer error ${res.status}` } }
      const images = await res.json() as any[]
      const totalSize = images.reduce((acc, img) => acc + (img.Size ?? 0), 0)
      return {
        images: images.map(img => ({
          id: img.Id.replace('sha256:', '').slice(0, 12),
          tags: img.RepoTags ?? [],
          size: img.Size,
          created: img.Created,
        })),
        count: images.length,
        totalSizeMB: Math.round(totalSize / 1024 / 1024),
      }
    } catch (e) {
      set.status = 500
      return { error: `Failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // ─── Prune images ─────────────────────────────────────────────────────────
  .post('/api/envman/projects/:slug/environments/:envName/portainer/prune/images', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access || access === 'VIEWER') { set.status = 403; return { error: 'Editor or Owner required' } }
    const cfg = await getPortainerCfg(params.slug, params.envName)
    if (!cfg) { set.status = 404; return { error: 'Portainer not configured' } }
    const conn = await resolveConn(cfg)
    if (!conn) { set.status = 400; return { error: 'Connection not found' } }
    try {
      const res = await fetch(`${conn.url}/api/endpoints/${cfg.endpointId}/docker/images/prune`, {
        method: 'POST',
        headers: { 'X-API-Key': conn.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ Filters: { dangling: ['true'] } }),
      })
      if (!res.ok) { set.status = 400; return { error: `Prune failed: ${res.status} ${await res.text()}` } }
      const result = await res.json() as any
      const reclaimedMB = Math.round((result.SpaceReclaimed ?? 0) / 1024 / 1024)
      appLog('info', `Portainer prune images: ${params.slug}:${params.envName} — ${reclaimedMB}MB reclaimed`)
      return { ok: true, deletedCount: result.ImagesDeleted?.length ?? 0, reclaimedMB }
    } catch (e) {
      set.status = 500
      return { error: `Prune failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // ─── Prune volumes ────────────────────────────────────────────────────────
  .post('/api/envman/projects/:slug/environments/:envName/portainer/prune/volumes', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access || access === 'VIEWER') { set.status = 403; return { error: 'Editor or Owner required' } }
    const cfg = await getPortainerCfg(params.slug, params.envName)
    if (!cfg) { set.status = 404; return { error: 'Portainer not configured' } }
    const conn = await resolveConn(cfg)
    if (!conn) { set.status = 400; return { error: 'Connection not found' } }
    try {
      const res = await fetch(`${conn.url}/api/endpoints/${cfg.endpointId}/docker/volumes/prune`, {
        method: 'POST', headers: { 'X-API-Key': conn.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) { set.status = 400; return { error: `Prune volumes failed: ${res.status}` } }
      const result = await res.json() as any
      const reclaimedMB = Math.round((result.SpaceReclaimed ?? 0) / 1024 / 1024)
      appLog('info', `Portainer prune volumes: ${params.slug}:${params.envName} — ${reclaimedMB}MB`)
      return { ok: true, deletedVolumes: result.VolumesDeleted ?? [], reclaimedMB }
    } catch (e) {
      set.status = 500
      return { error: `Prune volumes failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // ─── Prune networks ───────────────────────────────────────────────────────
  .post('/api/envman/projects/:slug/environments/:envName/portainer/prune/networks', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access || access === 'VIEWER') { set.status = 403; return { error: 'Editor or Owner required' } }
    const cfg = await getPortainerCfg(params.slug, params.envName)
    if (!cfg) { set.status = 404; return { error: 'Portainer not configured' } }
    const conn = await resolveConn(cfg)
    if (!conn) { set.status = 400; return { error: 'Connection not found' } }
    try {
      const res = await fetch(`${conn.url}/api/endpoints/${cfg.endpointId}/docker/networks/prune`, {
        method: 'POST', headers: { 'X-API-Key': conn.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) { set.status = 400; return { error: `Prune networks failed: ${res.status}` } }
      const result = await res.json() as any
      appLog('info', `Portainer prune networks: ${params.slug}:${params.envName}`)
      return { ok: true, deletedNetworks: result.NetworksDeleted ?? [] }
    } catch (e) {
      set.status = 500
      return { error: `Prune networks failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // ─── Container Logs ───────────────────────────────────────────────────────
  // GET /api/envman/projects/:slug/environments/:envName/portainer/containers
  // → List containers milik stack ini (untuk log selector)
  .get('/api/envman/projects/:slug/environments/:envName/portainer/containers', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access) { set.status = 403; return { error: 'No access' } }
    const cfg = await getPortainerCfg(params.slug, params.envName)
    if (!cfg) { set.status = 404; return { error: 'Portainer not configured' } }
    const conn = await resolveConn(cfg)
    if (!conn) { set.status = 400; return { error: 'Connection not found' } }
    try {
      const label = encodeURIComponent(JSON.stringify({ 'com.docker.compose.project': [cfg.stackName] }))
      const res = await fetch(`${conn.url}/api/endpoints/${cfg.endpointId}/docker/containers/json?all=1&filters=${label}`, {
        headers: { 'X-API-Key': conn.token },
      })
      if (!res.ok) { set.status = 400; return { error: `Portainer error ${res.status}` } }
      const containers = await res.json() as any[]
      return {
        containers: containers.map(c => ({
          id: c.Id,
          shortId: c.Id.slice(0, 12),
          names: c.Names.map((n: string) => n.replace(/^\//, '')),
          image: c.Image,
          state: c.State,
          status: c.Status,
        })),
      }
    } catch (e) {
      set.status = 500
      return { error: `Failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // GET /api/envman/projects/:slug/environments/:envName/portainer/logs/:containerId
  // Query params: tail (default 200), stdout (default 1), stderr (default 1), timestamps (default 1)
  .get('/api/envman/projects/:slug/environments/:envName/portainer/logs/:containerId', async ({ request, params, set, query }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access) { set.status = 403; return { error: 'No access' } }
    const cfg = await getPortainerCfg(params.slug, params.envName)
    if (!cfg) { set.status = 404; return { error: 'Portainer not configured' } }
    const conn = await resolveConn(cfg)
    if (!conn) { set.status = 400; return { error: 'Connection not found' } }

    const tail = Math.min(Number((query as any).tail) || 200, 1000)
    const stdout = (query as any).stdout !== '0' ? 1 : 0
    const stderr = (query as any).stderr !== '0' ? 1 : 0
    const timestamps = (query as any).timestamps !== '0' ? 1 : 0

    try {
      const qs = new URLSearchParams({ stdout: String(stdout), stderr: String(stderr), tail: String(tail), timestamps: String(timestamps) })
      const res = await fetch(
        `${conn.url}/api/endpoints/${cfg.endpointId}/docker/containers/${params.containerId}/logs?${qs}`,
        { headers: { 'X-API-Key': conn.token } },
      )
      if (!res.ok) { set.status = 400; return { error: `Portainer logs error ${res.status}: ${await res.text()}` } }

      // Docker log stream menggunakan multiplexed format:
      // [stream_type(1)][0][0][0][size(4)] payload
      // stream_type: 1=stdout, 2=stderr
      const buf = Buffer.from(await res.arrayBuffer())
      const lines: { stream: 'stdout' | 'stderr'; timestamp: string | null; message: string }[] = []
      let offset = 0

      while (offset < buf.length) {
        if (offset + 8 > buf.length) break
        const streamType = buf[offset]       // 1=stdout, 2=stderr
        const size = buf.readUInt32BE(offset + 4)
        offset += 8
        if (offset + size > buf.length) break
        const payload = buf.slice(offset, offset + size).toString('utf8')
        offset += size

        // Tiap payload bisa punya banyak baris
        for (const raw of payload.split('\n')) {
          const line = raw.trimEnd()
          if (!line) continue
          // Docker timestamps format: 2024-01-15T10:00:00.000000000Z <message>
          let timestamp: string | null = null
          let message = line
          if (timestamps) {
            const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s(.*)$/)
            if (tsMatch) {
              timestamp = tsMatch[1]
              message = tsMatch[2]
            }
          }
          lines.push({ stream: streamType === 2 ? 'stderr' : 'stdout', timestamp, message })
        }
      }

      return { lines, total: lines.length, containerId: params.containerId.slice(0, 12) }
    } catch (e) {
      set.status = 500
      return { error: `Logs fetch failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })
