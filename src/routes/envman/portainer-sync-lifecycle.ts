import { Elysia } from 'elysia'
import { getEnvironmentAccess } from '../../lib/access'
import { appLog } from '../../lib/applog'
import { requireEnvAuth } from '../../lib/auth-middleware'
import { decryptSecret } from '../../lib/crypto'
import { prisma } from '../../lib/db'
import { injectEnvFileIntoCompose } from '../../lib/portainer'
import { escapeEnvValue, getPortainerCfg, resolveConn } from './portainer-helpers'

export const syncLifecycleRouter = new Elysia()

  .post('/api/envman/projects/:slug/environments/:envName/portainer/repull', async ({ request, params, set }) => {
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
    const cfg = await getPortainerCfg(params.slug, params.envName)
    if (!cfg) {
      set.status = 404
      return { error: 'Portainer not configured' }
    }
    const conn = await resolveConn(cfg)
    if (!conn) {
      set.status = 400
      return { error: 'Connection not found' }
    }
    try {
      const fileRes = await fetch(`${conn.url}/api/stacks/${cfg.stackId}/file`, {
        headers: { 'X-API-Key': conn.token },
      })
      if (!fileRes.ok) {
        set.status = 400
        return { error: `Portainer stack file error: ${fileRes.status}` }
      }
      const { StackFileContent } = (await fileRes.json()) as { StackFileContent: string }
      const stackRes = await fetch(`${conn.url}/api/stacks/${cfg.stackId}`, { headers: { 'X-API-Key': conn.token } })
      const stackData = stackRes.ok ? ((await stackRes.json()) as any) : { Env: [] }
      const res = await fetch(`${conn.url}/api/stacks/${cfg.stackId}?endpointId=${cfg.endpointId}`, {
        method: 'PUT',
        headers: { 'X-API-Key': conn.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ StackFileContent, Env: stackData.Env ?? [], Prune: false, PullImage: true }),
      })
      if (!res.ok) {
        set.status = 400
        return { error: `Repull failed: ${res.status} ${await res.text()}` }
      }
      appLog('info', `Portainer repull: ${params.slug}:${params.envName} → stack ${cfg.stackName}`)
      return { ok: true, stackName: cfg.stackName }
    } catch (e) {
      set.status = 500
      return { error: `Repull failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  .post('/api/envman/projects/:slug/environments/:envName/portainer/recreate', async ({ request, params, set }) => {
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
    const cfg = await getPortainerCfg(params.slug, params.envName)
    if (!cfg) {
      set.status = 404
      return { error: 'Portainer not configured' }
    }
    const conn = await resolveConn(cfg)
    if (!conn) {
      set.status = 400
      return { error: 'Connection not found' }
    }
    try {
      const stopRes = await fetch(`${conn.url}/api/stacks/${cfg.stackId}/stop?endpointId=${cfg.endpointId}`, {
        method: 'POST',
        headers: { 'X-API-Key': conn.token },
      })
      if (!stopRes.ok) {
        set.status = 400
        return { error: `Stop failed: ${stopRes.status} ${await stopRes.text()}` }
      }
      const startRes = await fetch(`${conn.url}/api/stacks/${cfg.stackId}/start?endpointId=${cfg.endpointId}`, {
        method: 'POST',
        headers: { 'X-API-Key': conn.token },
      })
      if (!startRes.ok) {
        set.status = 400
        return { error: `Start failed: ${startRes.status} ${await startRes.text()}` }
      }
      appLog('info', `Portainer recreate: ${params.slug}:${params.envName} → stack ${cfg.stackName}`)
      return { ok: true, stackName: cfg.stackName }
    } catch (e) {
      set.status = 500
      return { error: `Recreate failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  .post(
    '/api/envman/projects/:slug/environments/:envName/portainer/sync-repull',
    async ({ request, params, set }) => {
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
      const cfg = await getPortainerCfg(params.slug, params.envName)
      if (!cfg) {
        set.status = 404
        return { error: 'Portainer not configured' }
      }
      const conn = await resolveConn(cfg)
      if (!conn) {
        set.status = 400
        return { error: 'Connection not found' }
      }
      const project = await prisma.project.findUnique({ where: { slug: params.slug } })
      if (!project) {
        set.status = 404
        return { error: 'Project not found' }
      }
      const environment = await prisma.environment.findUnique({
        where: { projectId_name: { projectId: project.id, name: params.envName } },
        include: { vars: true },
      })
      if (!environment) {
        set.status = 404
        return { error: 'Environment not found' }
      }
      try {
        const fileRes = await fetch(`${conn.url}/api/stacks/${cfg.stackId}/file`, {
          headers: { 'X-API-Key': conn.token },
        })
        if (!fileRes.ok) {
          set.status = 400
          return { error: `Stack file error: ${fileRes.status}` }
        }
        const { StackFileContent: rawStackFile } = (await fileRes.json()) as { StackFileContent: string }
        const stackFileContent = injectEnvFileIntoCompose(rawStackFile)
        const portainerEnv = environment.vars
          .filter((v) => !v.isDisabled)
          .map((v) => ({
            name: v.key,
            value: escapeEnvValue(v.isSecret ? decryptSecret(v.value) : v.value),
          }))
        const res = await fetch(`${conn.url}/api/stacks/${cfg.stackId}?endpointId=${cfg.endpointId}`, {
          method: 'PUT',
          headers: { 'X-API-Key': conn.token, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            StackFileContent: stackFileContent,
            Env: portainerEnv,
            Prune: false,
            PullImage: true,
          }),
        })
        if (!res.ok) {
          await prisma.portainerConfig.update({
            where: { id: cfg.id },
            data: { lastSyncAt: new Date(), lastSyncOk: false },
          })
          set.status = 400
          return { error: `Sync+Repull failed: ${res.status} ${await res.text()}` }
        }
        await prisma.portainerConfig.update({
          where: { id: cfg.id },
          data: { lastSyncAt: new Date(), lastSyncOk: true },
        })
        appLog('info', `Portainer sync+repull: ${params.slug}:${params.envName} → stack ${cfg.stackName}`)
        return { ok: true, varsCount: environment.vars.length, stackName: cfg.stackName }
      } catch (e) {
        await prisma.portainerConfig
          .update({ where: { id: cfg.id }, data: { lastSyncAt: new Date(), lastSyncOk: false } })
          .catch(() => {})
        set.status = 500
        return { error: `Sync+Repull failed: ${e instanceof Error ? e.message : String(e)}` }
      }
    },
  )
