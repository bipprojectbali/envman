import { Elysia } from 'elysia'
import { getEnvironmentAccess } from '../../lib/access'
import { appLog } from '../../lib/applog'
import { requireEnvAuth } from '../../lib/auth-middleware'
import { decryptSecret } from '../../lib/crypto'
import { prisma } from '../../lib/db'
import { escapeEnvValue } from './portainer-helpers'
import { syncToStack } from './portainer-sync-preview'

export const syncCoreRouter = new Elysia()

  .post('/api/envman/projects/:slug/environments/:envName/portainer/sync', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access || access === 'VIEWER') { set.status = 403; return { error: 'Editor or Owner required' } }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) { set.status = 404; return { error: 'Project not found' } }
    const cfg = await prisma.portainerConfig.findUnique({
      where: { projectId_envName: { projectId: project.id, envName: params.envName } },
    })
    if (!cfg) { set.status = 404; return { error: 'Portainer not configured for this environment' } }
    const environment = await prisma.environment.findUnique({
      where: { projectId_name: { projectId: project.id, name: params.envName } },
      include: { vars: true },
    })
    if (!environment) { set.status = 404; return { error: 'Environment not found' } }

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

    const portainerEnv = environment.vars
      .filter((v) => !v.isDisabled)
      .map((v) => ({
        name: v.key,
        value: escapeEnvValue(v.isSecret ? decryptSecret(v.value) : v.value),
      }))

    try {
      const startMs = Date.now()
      await syncToStack(cfg.stackId, cfg.endpointId, url, portainerToken, portainerEnv)

      const additionalTargets = await prisma.portainerStackTarget.findMany({ where: { configId: cfg.id } })
      const targetResults: { stackName: string; ok: boolean; error?: string }[] = []
      for (const target of additionalTargets) {
        try {
          let tUrl = url
          let tToken = portainerToken
          if (target.connectionId && target.connectionId !== cfg.connectionId) {
            const tConn = await prisma.portainerConnection.findUnique({ where: { id: target.connectionId } })
            if (tConn) { tUrl = tConn.portainerUrl.replace(/\/$/, ''); tToken = tConn.apiToken }
          }
          await syncToStack(target.stackId, target.endpointId, tUrl, tToken, portainerEnv)
          targetResults.push({ stackName: target.stackName, ok: true })
        } catch (e) {
          targetResults.push({ stackName: target.stackName, ok: false, error: e instanceof Error ? e.message : String(e) })
        }
      }

      const durationMs = Date.now() - startMs
      const secretCount = environment.vars.filter((v) => v.isSecret && !v.isDisabled).length
      const varsCount = environment.vars.filter((v) => !v.isDisabled).length
      const body = (await request.json().catch(() => ({}))) as any
      const triggeredBy = (body as any)?.triggeredBy ?? 'manual'

      await prisma.portainerConfig.update({ where: { id: cfg.id }, data: { lastSyncAt: new Date(), lastSyncOk: true } })
      await prisma.portainerSyncLog.create({
        data: { configId: cfg.id, userId: caller.userId, triggeredBy, varsCount, secretCount, ok: true, durationMs },
      })
      appLog('info', `Portainer sync: ${params.slug}:${params.envName} → stack ${cfg.stackName} (${varsCount} vars, ${durationMs}ms)`)
      return { ok: true, varsCount, stackName: cfg.stackName, durationMs, additionalTargets: targetResults }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      await prisma.portainerConfig.update({ where: { id: cfg.id }, data: { lastSyncAt: new Date(), lastSyncOk: false } }).catch(() => {})
      await prisma.portainerSyncLog.create({
        data: { configId: cfg.id, userId: caller.userId, triggeredBy: 'manual', varsCount: 0, ok: false, error: errMsg, durationMs: 0 },
      }).catch(() => {})
      set.status = 500
      return { error: `Sync failed: ${errMsg}` }
    }
  })
