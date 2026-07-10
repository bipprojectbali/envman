import { Elysia } from 'elysia'
import { getEnvironmentAccess } from '../../lib/access'
import { requireEnvAuth } from '../../lib/auth-middleware'
import { computeContainerStats, getPortainerCfg, resolveConn } from './portainer-helpers'

// Detail satu container: Docker inspect (health, restart count, state, ports,
// mounts) + one-shot stats (CPU/mem, best-effort). Env-scoped, gate akses env.
export const portainerInspectRouter = new Elysia().get(
  '/api/envman/projects/:slug/environments/:envName/portainer/inspect/:containerId',
  async ({ request, params, set }) => {
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
      const res = await fetch(
        `${conn.url}/api/endpoints/${cfg.endpointId}/docker/containers/${params.containerId}/json`,
        { headers: { 'X-API-Key': conn.token } },
      )
      if (!res.ok) {
        set.status = res.status === 404 ? 404 : 400
        return { error: `Inspect error ${res.status}: ${await res.text()}` }
      }
      const c = (await res.json()) as any
      // Stats best-effort: container mati / endpoint lambat → jangan gagalkan inspect.
      let stats: ReturnType<typeof computeContainerStats> | null = null
      if (c.State?.Running) {
        try {
          const sRes = await fetch(
            `${conn.url}/api/endpoints/${cfg.endpointId}/docker/containers/${params.containerId}/stats?stream=false`,
            { headers: { 'X-API-Key': conn.token } },
          )
          if (sRes.ok) stats = computeContainerStats(await sRes.json())
        } catch {
          /* biarkan stats null */
        }
      }
      const ports = Object.entries(c.NetworkSettings?.Ports ?? {})
        .flatMap(([priv, binds]) =>
          Array.isArray(binds) && binds.length
            ? binds.map((b: any) => `${b.HostPort}:${priv}`)
            : [priv],
        )
      const mounts = (c.Mounts ?? []).map((m: any) => ({
        source: m.Source ?? m.Name ?? '',
        destination: m.Destination ?? '',
        mode: m.RW === false ? 'ro' : 'rw',
      }))
      return {
        id: (c.Id ?? '').slice(0, 12),
        name: (c.Name ?? '').replace(/^\//, ''),
        image: c.Config?.Image ?? '',
        state: c.State?.Status ?? 'unknown',
        running: !!c.State?.Running,
        startedAt: c.State?.StartedAt ?? null,
        restartCount: c.RestartCount ?? 0,
        health: c.State?.Health?.Status ?? null,
        exitCode: c.State?.ExitCode ?? null,
        ports,
        mounts,
        stats,
      }
    } catch (e) {
      set.status = 500
      return { error: `Inspect failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  },
)
