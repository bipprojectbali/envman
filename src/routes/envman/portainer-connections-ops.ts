import { Elysia } from 'elysia'
import { appLog } from '../../lib/applog'
import { requireEnvAuth } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'
import { hasCapability } from '../../lib/permissions'

export const connectionsOpsRouter = new Elysia()

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
      const res = await fetch(`${url}/api/endpoints/${endpointId}/docker/images/json?filters=${filters}`, {
        headers: { 'X-API-Key': conn.apiToken },
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        appLog('warn', `[portainer:dangling] endpointId=${endpointId} status=${res.status} body=${errText}`)
        set.status = 400
        return { error: `Portainer error ${res.status}: ${errText}` }
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
        endpointId,
      }
    } catch (e) {
      set.status = 500
      return { error: `Failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

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
        method: 'POST',
        headers: { 'X-API-Key': conn.apiToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ Filters: { dangling: ['true'] } }),
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        appLog('warn', `[portainer:prune-images] failed ${res.status}: ${errText}`)
        set.status = 400
        return { error: `Prune failed: ${res.status}: ${errText}` }
      }
      const result = (await res.json()) as any
      const reclaimedMB = Math.round((result.SpaceReclaimed ?? 0) / 1024 / 1024)
      appLog('info', `[portainer:prune-images] deleted=${result.ImagesDeleted?.length ?? 0} reclaimed=${reclaimedMB}MB`)
      const filters2 = encodeURIComponent(JSON.stringify({ dangling: ['true'] }))
      const remainRes = await fetch(`${url}/api/endpoints/${endpointId}/docker/images/json?filters=${filters2}`, {
        headers: { 'X-API-Key': conn.apiToken },
      })
      let remaining: any[] = []
      if (remainRes.ok) remaining = (await remainRes.json()) as any[]
      if (remaining.length > 0) {
        const allContainersRes = await fetch(`${url}/api/endpoints/${endpointId}/docker/containers/json?all=1`, {
          headers: { 'X-API-Key': conn.apiToken },
        })
        const allContainers = allContainersRes.ok ? ((await allContainersRes.json()) as any[]) : []
        const usedImageIds = new Set(allContainers.map((c: any) => c.ImageID))
        const stuck = remaining.filter((img: any) => usedImageIds.has(img.Id))
        appLog(
          'info',
          `[portainer:prune-images] remaining=${remaining.length} stuck_by_stopped_containers=${stuck.length}`,
        )
        return {
          ok: true,
          deletedCount: result.ImagesDeleted?.length ?? 0,
          reclaimedMB,
          remaining: remaining.length,
          stuckByContainers: stuck.length,
          stuckImages: stuck.map((img: any) => ({
            id: img.Id.replace('sha256:', '').slice(0, 12),
            tags: img.RepoTags ?? [],
          })),
        }
      }
      return { ok: true, deletedCount: result.ImagesDeleted?.length ?? 0, reclaimedMB, remaining: 0, stuckByContainers: 0 }
    } catch (e) {
      set.status = 500
      return { error: `Prune failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  .post('/api/envman/portainer/connections/:id/prune/volumes', async ({ request, params, query, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    if (!hasCapability(caller, 'stack:prune')) { set.status = 403; return { error: 'Tidak punya izin prune volumes.' } }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Connection not found' } }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const endpointId = Number((query as any).endpointId) || 1
    try {
      const res = await fetch(`${url}/api/endpoints/${endpointId}/docker/volumes/prune`, {
        method: 'POST',
        headers: { 'X-API-Key': conn.apiToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) { set.status = 400; return { error: `Prune volumes failed: ${res.status}` } }
      const result = (await res.json()) as any
      const reclaimedMB = Math.round((result.SpaceReclaimed ?? 0) / 1024 / 1024)
      appLog('info', `Portainer prune volumes via connection ${conn.name}`)
      return { ok: true, deletedVolumes: result.VolumesDeleted ?? [], reclaimedMB }
    } catch (e) {
      set.status = 500
      return { error: `Prune volumes failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  .post('/api/envman/portainer/connections/:id/prune/networks', async ({ request, params, query, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    if (!hasCapability(caller, 'stack:prune')) { set.status = 403; return { error: 'Tidak punya izin prune networks.' } }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Connection not found' } }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const endpointId = Number((query as any).endpointId) || 1
    try {
      const res = await fetch(`${url}/api/endpoints/${endpointId}/docker/networks/prune`, {
        method: 'POST',
        headers: { 'X-API-Key': conn.apiToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) { set.status = 400; return { error: `Prune networks failed: ${res.status}` } }
      const result = (await res.json()) as any
      appLog('info', `Portainer prune networks via connection ${conn.name}`)
      return { ok: true, deletedNetworks: result.NetworksDeleted ?? [] }
    } catch (e) {
      set.status = 500
      return { error: `Prune networks failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  .post('/api/envman/portainer/connections/:id/prune/containers', async ({ request, params, query, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    if (!hasCapability(caller, 'stack:prune')) { set.status = 403; return { error: 'Tidak punya izin prune containers.' } }
    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) { set.status = 404; return { error: 'Connection not found' } }
    const url = conn.portainerUrl.replace(/\/$/, '')
    const endpointId = Number((query as any).endpointId) || 1
    try {
      const res = await fetch(`${url}/api/endpoints/${endpointId}/docker/containers/prune`, {
        method: 'POST',
        headers: { 'X-API-Key': conn.apiToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        set.status = 400
        return { error: `Prune containers failed: ${res.status}: ${t}` }
      }
      const result = (await res.json()) as any
      const reclaimedMB = Math.round((result.SpaceReclaimed ?? 0) / 1024 / 1024)
      appLog('info', `Portainer prune containers via connection ${conn.name}`)
      return { ok: true, deletedContainers: result.ContainersDeleted ?? [], reclaimedMB }
    } catch (e) {
      set.status = 500
      return { error: `Prune containers failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })
