import { Elysia } from 'elysia'
import { getEnvironmentAccess } from '../../lib/access'
import { requireEnvAuth } from '../../lib/auth-middleware'
import { getPortainerCfg, resolveConn } from './portainer-helpers'
import { streamDockerLogs } from './portainer-logs-stream-demux'

export const portainerLogsStreamRouter = new Elysia()

  // Live logs (SSE). Follow=1 di Docker → stream tak-berujung, di-relay sebagai
  // Server-Sent Events (`data: <line>`). Konsumen: CLI `logs -f` & EventSource FE.
  // De-mux frame Docker incremental di helper agar aman terhadap chunk terpotong.
  .get(
    '/api/envman/projects/:slug/environments/:envName/portainer/logs/:containerId/stream',
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
      const timestamps = (query as any).timestamps !== '0'

      const qs = new URLSearchParams({
        stdout: '1',
        stderr: '1',
        follow: '1',
        tail: String(tail),
        timestamps: timestamps ? '1' : '0',
      })
      const upstreamUrl = `${conn.url}/api/endpoints/${cfg.endpointId}/docker/containers/${params.containerId}/logs?${qs}`

      // AbortController diikat ke request.signal → client putus (CLI Ctrl+C) hentikan
      // fetch ke Docker, tidak menggantung koneksi upstream.
      const upstream = new AbortController()
      const onAbort = () => upstream.abort()
      request.signal.addEventListener('abort', onAbort)

      let res: Response
      try {
        res = await fetch(upstreamUrl, { headers: { 'X-API-Key': conn.token }, signal: upstream.signal })
      } catch (e) {
        request.signal.removeEventListener('abort', onAbort)
        set.status = 502
        return { error: `Log stream failed: ${e instanceof Error ? e.message : String(e)}` }
      }
      if (!res.ok || !res.body) {
        request.signal.removeEventListener('abort', onAbort)
        set.status = 400
        return { error: `Portainer logs error ${res.status}` }
      }

      const stream = streamDockerLogs(res.body, {
        withTimestamps: timestamps,
        onClose: () => request.signal.removeEventListener('abort', onAbort),
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          // Cegah buffering proxy (nginx/Cloudflare) agar baris tiba real-time.
          'X-Accel-Buffering': 'no',
        },
      })
    },
  )
