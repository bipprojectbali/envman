import { Elysia } from 'elysia'
import { getEnvironmentAccess } from '../../lib/access'
import { requireEnvAuth } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'

export const configRouter = new Elysia()

  .get('/api/envman/projects/:slug/environments/:envName/portainer', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access) {
      set.status = 403
      return { error: 'No access' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    const cfg = await prisma.portainerConfig.findUnique({
      where: { projectId_envName: { projectId: project.id, envName: params.envName } },
      include: { additionalTargets: true },
    })
    if (!cfg) return { config: null, unsyncedCount: 0 }
    const conn = cfg.connectionId
      ? await prisma.portainerConnection.findUnique({
          where: { id: cfg.connectionId },
          select: { id: true, name: true, portainerUrl: true },
        })
      : null
    const env = await prisma.environment.findUnique({
      where: { projectId_name: { projectId: project.id, name: params.envName } },
    })
    const unsyncedCount = env
      ? await prisma.envVar.count({
          where: {
            environmentId: env.id,
            isDisabled: false,
            ...(cfg.lastSyncAt ? { updatedAt: { gt: cfg.lastSyncAt } } : {}),
          },
        })
      : 0
    return {
      config: {
        id: cfg.id,
        stackId: cfg.stackId,
        stackName: cfg.stackName,
        endpointId: cfg.endpointId,
        lastSyncAt: cfg.lastSyncAt,
        lastSyncOk: cfg.lastSyncOk,
        connectionId: cfg.connectionId,
        connectionName: conn?.name,
        portainerUrl: conn?.portainerUrl ?? cfg.portainerUrl,
        apiToken: '***',
        autoSync: cfg.autoSync,
        additionalTargets: cfg.additionalTargets.map((t) => ({
          id: t.id,
          stackId: t.stackId,
          stackName: t.stackName,
          endpointId: t.endpointId,
          label: t.label,
        })),
      },
      unsyncedCount,
    }
  })

  .put('/api/envman/projects/:slug/environments/:envName/portainer', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access || access === 'VIEWER') {
      set.status = 403
      return { error: 'Editor or Owner required' }
    }
    const body = await request.json().catch(() => null)
    if (!body?.stackId || !body?.stackName) {
      set.status = 400
      return { error: 'stackId and stackName required' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    const existing = await prisma.portainerConfig.findUnique({
      where: { projectId_envName: { projectId: project.id, envName: params.envName } },
    })

    if (body.connectionId) {
      const conn = await prisma.portainerConnection.findUnique({ where: { id: body.connectionId } })
      if (!conn) {
        set.status = 404
        return { error: 'Connection not found' }
      }
      const cfg = await prisma.portainerConfig.upsert({
        where: { projectId_envName: { projectId: project.id, envName: params.envName } },
        update: {
          connectionId: body.connectionId,
          stackId: body.stackId,
          stackName: body.stackName,
          endpointId: body.endpointId ?? 1,
          portainerUrl: null,
          apiToken: null,
        },
        create: {
          projectId: project.id,
          envName: params.envName,
          connectionId: body.connectionId,
          stackId: body.stackId,
          stackName: body.stackName,
          endpointId: body.endpointId ?? 1,
        },
      })
      return {
        config: {
          id: cfg.id,
          connectionId: conn.id,
          connectionName: conn.name,
          portainerUrl: conn.portainerUrl,
          stackId: cfg.stackId,
          stackName: cfg.stackName,
          endpointId: cfg.endpointId,
        },
      }
    }

    if (!body.portainerUrl) {
      set.status = 400
      return { error: 'connectionId or portainerUrl required' }
    }
    const apiToken = body.apiToken || existing?.apiToken
    if (!apiToken) {
      set.status = 400
      return { error: 'apiToken required for new configuration' }
    }
    const cfg = await prisma.portainerConfig.upsert({
      where: { projectId_envName: { projectId: project.id, envName: params.envName } },
      update: {
        portainerUrl: body.portainerUrl,
        apiToken,
        stackId: body.stackId,
        stackName: body.stackName,
        endpointId: body.endpointId ?? 1,
        connectionId: null,
      },
      create: {
        projectId: project.id,
        envName: params.envName,
        portainerUrl: body.portainerUrl,
        apiToken,
        stackId: body.stackId,
        stackName: body.stackName,
        endpointId: body.endpointId ?? 1,
      },
    })
    return {
      config: {
        id: cfg.id,
        portainerUrl: cfg.portainerUrl,
        stackId: cfg.stackId,
        stackName: cfg.stackName,
        endpointId: cfg.endpointId,
      },
    }
  })

  .patch('/api/envman/projects/:slug/environments/:envName/portainer', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access || access === 'VIEWER') {
      set.status = 403
      return { error: 'Editor or Owner required' }
    }
    const body = (await request.json().catch(() => null)) as any
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    const cfg = await prisma.portainerConfig.findUnique({
      where: { projectId_envName: { projectId: project.id, envName: params.envName } },
    })
    if (!cfg) {
      set.status = 404
      return { error: 'Portainer not configured' }
    }
    if (typeof body?.autoSync === 'boolean') {
      await prisma.portainerConfig.update({ where: { id: cfg.id }, data: { autoSync: body.autoSync } })
    }
    if (body?.addTarget) {
      const t = body.addTarget
      await prisma.portainerStackTarget.create({
        data: {
          configId: cfg.id,
          connectionId: t.connectionId ?? cfg.connectionId,
          stackId: t.stackId,
          stackName: t.stackName,
          endpointId: t.endpointId ?? 1,
          label: t.label ?? null,
        },
      })
    }
    if (body?.removeTargetId) {
      await prisma.portainerStackTarget.deleteMany({ where: { id: body.removeTargetId, configId: cfg.id } })
    }
    const updatedCfg = await prisma.portainerConfig.findUnique({
      where: { id: cfg.id },
      include: { additionalTargets: true },
    })
    return { ok: true, autoSync: updatedCfg?.autoSync, additionalTargets: updatedCfg?.additionalTargets }
  })

  .delete('/api/envman/projects/:slug/environments/:envName/portainer', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access || access !== 'OWNER') {
      set.status = 403
      return { error: 'Owner required' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    await prisma.portainerConfig
      .delete({ where: { projectId_envName: { projectId: project.id, envName: params.envName } } })
      .catch(() => {})
    return { ok: true }
  })

  // Legacy probe endpoint (list stacks untuk setup wizard)
  .post('/api/envman/portainer/probe', async ({ request, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const body = await request.json().catch(() => null)
    if (!body?.portainerUrl) {
      set.status = 400
      return { error: 'portainerUrl required' }
    }
    let apiToken = body.apiToken
    if (!apiToken && body.slug && body.envName) {
      const proj = await prisma.project.findUnique({ where: { slug: body.slug } })
      if (proj) {
        const stored = await prisma.portainerConfig.findUnique({
          where: { projectId_envName: { projectId: proj.id, envName: body.envName } },
        })
        apiToken = stored?.apiToken
      }
    }
    if (!apiToken) {
      set.status = 400
      return { error: 'apiToken required' }
    }
    const url = body.portainerUrl.replace(/\/$/, '')
    try {
      const res = await fetch(`${url}/api/stacks`, { headers: { 'X-API-Key': apiToken } })
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
