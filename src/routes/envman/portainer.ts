import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { requireEnvAuth, unauthorized, forbidden } from '../../lib/auth-middleware'
import { getProjectAccess } from '../../lib/access'
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

export const portainerRouter = new Elysia()

      // ─── Portainer Connections (global) ──────────────────
  .get('/api/envman/portainer/connections', async ({ request, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const connections = await prisma.portainerConnection.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, portainerUrl: true, createdById: true, createdAt: true, _count: { select: { configs: true } } },
    })
    return { connections }
      })

  .post('/api/envman/portainer/connections', async ({ request, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
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
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Not found' } }
    if (conn.createdById !== caller.userId && caller.role !== 'SUPER_ADMIN') { set.status = 403; return { error: 'Forbidden' } }
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
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Not found' } }
    if (conn.createdById !== caller.userId && caller.role !== 'SUPER_ADMIN') { set.status = 403; return { error: 'Forbidden' } }
    await prisma.portainerConnection.delete({ where: { id: params.id } })
    return { ok: true }
      })

      // Probe stacks via connection ID (or legacy URL+token)
  .post('/api/envman/portainer/connections/:id/probe', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
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
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Connection not found' } }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const stackId = Number(params.stackId)
    try {
      const stackRes = await fetch(`${url}/api/stacks/${stackId}`, { headers: { 'X-API-Key': conn.apiToken } })
      if (!stackRes.ok) { set.status = 400; return { error: `Portainer error ${stackRes.status}` } }
      const stack = await stackRes.json() as any

      const label = encodeURIComponent(JSON.stringify({ 'com.docker.compose.project': [stack.Name] }))
      const cRes = await fetch(`${url}/api/endpoints/${stack.EndpointId}/docker/containers/json?all=1&filters=${label}`, { headers: { 'X-API-Key': conn.apiToken } })
      const containers = cRes.ok ? (await cRes.json() as any[]) : []

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

    try {
      const qs = new URLSearchParams({ stdout: String(stdout), stderr: String(stderr), tail: String(tail), timestamps: String(timestamps) })
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

  // Repull image (by connectionId)
  .post('/api/envman/portainer/connections/:id/stacks/:stackId/repull', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
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
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Connection not found' } }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const endpointId = Number((query as any).endpointId) || 1
    try {
      const filters = encodeURIComponent(JSON.stringify({ dangling: ['true'] }))
      const res = await fetch(`${url}/api/endpoints/${endpointId}/docker/images/json?filters=${filters}`, { headers: { 'X-API-Key': conn.apiToken } })
      if (!res.ok) { set.status = 400; return { error: `Portainer error ${res.status}` } }
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

  // Prune images (by connectionId)
  .post('/api/envman/portainer/connections/:id/prune/images', async ({ request, params, query, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Connection not found' } }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const endpointId = Number((query as any).endpointId) || 1
    try {
      const res = await fetch(`${url}/api/endpoints/${endpointId}/docker/images/prune`, {
        method: 'POST', headers: { 'X-API-Key': conn.apiToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ Filters: { dangling: ['true'] } }),
      })
      if (!res.ok) { set.status = 400; return { error: `Prune failed: ${res.status}` } }
      const result = await res.json() as any
      const reclaimedMB = Math.round((result.SpaceReclaimed ?? 0) / 1024 / 1024)
      appLog('info', `Portainer prune images via connection ${conn.name} — ${reclaimedMB}MB`)
      return { ok: true, deletedCount: result.ImagesDeleted?.length ?? 0, reclaimedMB }
    } catch (e) {
      set.status = 500; return { error: `Prune failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // Prune volumes (by connectionId)
  .post('/api/envman/portainer/connections/:id/prune/volumes', async ({ request, params, query, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
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

      // ─── Portainer Integration ────────────────────────────
  .get('/api/envman/projects/:slug/environments/:envName/portainer', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getProjectAccess(caller.userId, caller.role, params.slug)
    if (!access) { set.status = 403; return { error: 'No access' } }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) { set.status = 404; return { error: 'Project not found' } }
    const cfg = await prisma.portainerConfig.findUnique({ where: { projectId_envName: { projectId: project.id, envName: params.envName } } })
    if (!cfg) return { config: null }
    // Resolve connection details for response
    const conn = cfg.connectionId ? await prisma.portainerConnection.findUnique({ where: { id: cfg.connectionId }, select: { id: true, name: true, portainerUrl: true } }) : null
    return {
      config: {
        id: cfg.id, stackId: cfg.stackId, stackName: cfg.stackName, endpointId: cfg.endpointId,
        lastSyncAt: cfg.lastSyncAt, lastSyncOk: cfg.lastSyncOk,
        // New: connection ref
        connectionId: cfg.connectionId, connectionName: conn?.name, portainerUrl: conn?.portainerUrl ?? cfg.portainerUrl,
        // Legacy fallback
        apiToken: '***',
      }
    }
      })

  .put('/api/envman/projects/:slug/environments/:envName/portainer', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getProjectAccess(caller.userId, caller.role, params.slug)
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

  .delete('/api/envman/projects/:slug/environments/:envName/portainer', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getProjectAccess(caller.userId, caller.role, params.slug)
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
    const access = await getProjectAccess(caller.userId, caller.role, params.slug)
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
      const syncRes = await fetch(`${url}/api/stacks/${cfg.stackId}?endpointId=${cfg.endpointId}`, {
        method: 'PUT',
        headers: { 'X-API-Key': portainerToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ StackFileContent: stackFileContent, Env: portainerEnv, Prune: false }),
      })
      if (!syncRes.ok) {
        const errText = await syncRes.text()
        await prisma.portainerConfig.update({ where: { id: cfg.id }, data: { lastSyncAt: new Date(), lastSyncOk: false } })
        set.status = 400
        return { error: `Portainer sync error ${syncRes.status}: ${errText}` }
      }
      await prisma.portainerConfig.update({ where: { id: cfg.id }, data: { lastSyncAt: new Date(), lastSyncOk: true } })
      appLog('info', `Portainer sync: ${params.slug}:${params.envName} → stack ${cfg.stackName} (${environment.vars.length} vars)`)
      return { ok: true, varsCount: environment.vars.length, stackName: cfg.stackName }
    } catch (e) {
      await prisma.portainerConfig.update({ where: { id: cfg.id }, data: { lastSyncAt: new Date(), lastSyncOk: false } }).catch(() => {})
      set.status = 500
      return { error: `Sync failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  // ─── Stack Status (services + containers) ────────────────────────────────
  .get('/api/envman/projects/:slug/environments/:envName/portainer/status', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getProjectAccess(caller.userId, caller.role, params.slug)
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
    const access = await getProjectAccess(caller.userId, caller.role, params.slug)
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
    const access = await getProjectAccess(caller.userId, caller.role, params.slug)
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
    const access = await getProjectAccess(caller.userId, caller.role, params.slug)
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
    const access = await getProjectAccess(caller.userId, caller.role, params.slug)
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
    const access = await getProjectAccess(caller.userId, caller.role, params.slug)
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
    const access = await getProjectAccess(caller.userId, caller.role, params.slug)
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
    const access = await getProjectAccess(caller.userId, caller.role, params.slug)
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
    const access = await getProjectAccess(caller.userId, caller.role, params.slug)
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
    const access = await getProjectAccess(caller.userId, caller.role, params.slug)
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
    const access = await getProjectAccess(caller.userId, caller.role, params.slug)
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
