import { Elysia } from 'elysia'
import { getEnvironmentAccess } from '../../lib/access'
import { appLog } from '../../lib/applog'
import { requireEnvAuth } from '../../lib/auth-middleware'
import { getPortainerCfg, parseDockerLogStream, resolveConn } from './portainer-helpers'

export const syncOpsRouter = new Elysia()

  .get(
    '/api/envman/projects/:slug/environments/:envName/portainer/images/dangling',
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
        const filters = encodeURIComponent(JSON.stringify({ dangling: ['true'] }))
        const res = await fetch(`${conn.url}/api/endpoints/${cfg.endpointId}/docker/images/json?filters=${filters}`, {
          headers: { 'X-API-Key': conn.token },
        })
        if (!res.ok) {
          set.status = 400
          return { error: `Portainer error ${res.status}` }
        }
        const images = (await res.json()) as any[]
        const totalSize = images.reduce((acc, img) => acc + (img.Size ?? 0), 0)
        return {
          images: images.map((img) => ({
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
    },
  )

  .post(
    '/api/envman/projects/:slug/environments/:envName/portainer/prune/images',
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
      try {
        const res = await fetch(`${conn.url}/api/endpoints/${cfg.endpointId}/docker/images/prune`, {
          method: 'POST',
          headers: { 'X-API-Key': conn.token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ Filters: { dangling: ['true'] } }),
        })
        if (!res.ok) {
          set.status = 400
          return { error: `Prune failed: ${res.status} ${await res.text()}` }
        }
        const result = (await res.json()) as any
        const reclaimedMB = Math.round((result.SpaceReclaimed ?? 0) / 1024 / 1024)
        appLog('info', `Portainer prune images: ${params.slug}:${params.envName} — ${reclaimedMB}MB reclaimed`)
        return { ok: true, deletedCount: result.ImagesDeleted?.length ?? 0, reclaimedMB }
      } catch (e) {
        set.status = 500
        return { error: `Prune failed: ${e instanceof Error ? e.message : String(e)}` }
      }
    },
  )

  .post(
    '/api/envman/projects/:slug/environments/:envName/portainer/prune/volumes',
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
      try {
        const res = await fetch(`${conn.url}/api/endpoints/${cfg.endpointId}/docker/volumes/prune`, {
          method: 'POST',
          headers: { 'X-API-Key': conn.token, 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        if (!res.ok) {
          set.status = 400
          return { error: `Prune volumes failed: ${res.status}` }
        }
        const result = (await res.json()) as any
        const reclaimedMB = Math.round((result.SpaceReclaimed ?? 0) / 1024 / 1024)
        appLog('info', `Portainer prune volumes: ${params.slug}:${params.envName} — ${reclaimedMB}MB`)
        return { ok: true, deletedVolumes: result.VolumesDeleted ?? [], reclaimedMB }
      } catch (e) {
        set.status = 500
        return { error: `Prune volumes failed: ${e instanceof Error ? e.message : String(e)}` }
      }
    },
  )

  .post(
    '/api/envman/projects/:slug/environments/:envName/portainer/prune/networks',
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
      try {
        const res = await fetch(`${conn.url}/api/endpoints/${cfg.endpointId}/docker/networks/prune`, {
          method: 'POST',
          headers: { 'X-API-Key': conn.token, 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        if (!res.ok) {
          set.status = 400
          return { error: `Prune networks failed: ${res.status}` }
        }
        const result = (await res.json()) as any
        appLog('info', `Portainer prune networks: ${params.slug}:${params.envName}`)
        return { ok: true, deletedNetworks: result.NetworksDeleted ?? [] }
      } catch (e) {
        set.status = 500
        return { error: `Prune networks failed: ${e instanceof Error ? e.message : String(e)}` }
      }
    },
  )

  .get(
    '/api/envman/projects/:slug/environments/:envName/portainer/containers',
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
        const label = encodeURIComponent(JSON.stringify({ 'com.docker.compose.project': [cfg.stackName] }))
        const res = await fetch(
          `${conn.url}/api/endpoints/${cfg.endpointId}/docker/containers/json?all=1&filters=${label}`,
          { headers: { 'X-API-Key': conn.token } },
        )
        if (!res.ok) {
          set.status = 400
          return { error: `Portainer error ${res.status}` }
        }
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
    },
  )

  .get(
    '/api/envman/projects/:slug/environments/:envName/portainer/logs/:containerId',
    async ({ request, params, set, query }) => {
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
      const tail = Math.min(Number((query as any).tail) || 200, 1000)
      const stdout = (query as any).stdout !== '0' ? 1 : 0
      const stderr = (query as any).stderr !== '0' ? 1 : 0
      const timestamps = (query as any).timestamps !== '0' ? 1 : 0
      try {
        const qs = new URLSearchParams({
          stdout: String(stdout),
          stderr: String(stderr),
          tail: String(tail),
          timestamps: String(timestamps),
        })
        const res = await fetch(
          `${conn.url}/api/endpoints/${cfg.endpointId}/docker/containers/${params.containerId}/logs?${qs}`,
          { headers: { 'X-API-Key': conn.token } },
        )
        if (!res.ok) {
          set.status = 400
          return { error: `Portainer logs error ${res.status}: ${await res.text()}` }
        }
        const buf = Buffer.from(await res.arrayBuffer())
        const lines = parseDockerLogStream(buf, timestamps === 1)
        return { lines, total: lines.length, containerId: params.containerId.slice(0, 12) }
      } catch (e) {
        set.status = 500
        return { error: `Logs fetch failed: ${e instanceof Error ? e.message : String(e)}` }
      }
    },
  )
