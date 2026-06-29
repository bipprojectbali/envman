import { Elysia } from 'elysia'
import { getEnvironmentAccess } from '../../lib/access'
import { requireEnvAuth } from '../../lib/auth-middleware'
import { getPortainerCfg, parseDockerLogStream, resolveConn } from './portainer-helpers'

export const syncContainersRouter = new Elysia()

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
      const res = await fetch(
        `${conn.url}/api/endpoints/${cfg.endpointId}/docker/containers/json?all=1&filters=${label}`,
        { headers: { 'X-API-Key': conn.token } },
      )
      if (!res.ok) { set.status = 400; return { error: `Portainer error ${res.status}` } }
      const containers = (await res.json()) as any[]
      return {
        containers: containers.map((c) => ({
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
      const buf = Buffer.from(await res.arrayBuffer())
      const lines = parseDockerLogStream(buf, timestamps === 1)
      return { lines, total: lines.length, containerId: params.containerId.slice(0, 12) }
    } catch (e) {
      set.status = 500
      return { error: `Logs fetch failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })
