import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { requireEnvAuth, unauthorized, forbidden } from '../../lib/auth-middleware'
import { getProjectAccess } from '../../lib/access'
import { decryptSecret } from '../../lib/crypto'
import { injectEnvFileIntoCompose } from '../../lib/portainer'
import { appLog } from '../../lib/applog'

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
