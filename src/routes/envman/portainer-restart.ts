import { Elysia } from 'elysia'
import { appLog } from '../../lib/applog'
import { requireEnvAuth } from '../../lib/auth-middleware'
import { editorOrCap } from './portainer-auth'
import { getPortainerCfg, resolveConn } from './portainer-helpers'

export const portainerRestartRouter = new Elysia()

  // Restart ringan: stop→start stack TANPA pull image / recreate compose.
  // Beda dari /recreate (gate stack:deploy) — endpoint ini di-gate stack:power
  // agar operator dengan izin restart saja bisa memulai ulang tanpa deploy.
  .post('/api/envman/projects/:slug/environments/:envName/portainer/restart', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const denied = await editorOrCap(caller, params.slug, params.envName, 'stack:power', set)
    if (denied) return denied
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
      // Portainer 409 saat stack sudah berhenti — bukan kegagalan restart, lanjut start.
      if (!stopRes.ok && stopRes.status !== 409) {
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
      appLog('info', `Portainer restart: ${params.slug}:${params.envName} → stack ${cfg.stackName}`)
      return { ok: true, stackName: cfg.stackName }
    } catch (e) {
      set.status = 500
      return { error: `Restart failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })
