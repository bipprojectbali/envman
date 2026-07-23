import { cors } from '@elysiajs/cors'
import { html } from '@elysiajs/html'
import { Elysia } from 'elysia'
import { appLog } from './lib/applog'
import { auth } from './lib/auth'
import { buildDocsMd } from './lib/docs-builder'
import { buildCliDocsMd } from './lib/cli-docs-builder'
import { conditional, notModifiedResponse, strongEtag } from './lib/http-cache'
import { broadcastToAdmins } from './lib/presence'
import { getPublicOrigin } from './lib/request'
import { adminRouter } from './routes/admin/index'
import { authCompatRouter } from './routes/auth-compat'
import { cliDownloadRouter } from './routes/cli-download'
import { envmanRouter } from './routes/envman/index'
import { infraRouter } from './routes/infra'
import { publicStorageRouter } from './routes/public-storage'
import { v1Router } from './routes/v1/index'

export function createApp() {
  appLog('info', 'Server starting')

  return (
    new Elysia()
      .use(cors())
      .use(html())

      .onError(({ code, error, request }) => {
        if (code === 'NOT_FOUND') {
          return new Response(JSON.stringify({ error: 'Not Found', status: 404 }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const url = new URL(request.url)
        const message = error instanceof Error ? error.message : String(error)
        appLog('error', `${request.method} ${url.pathname} — ${message}`)
        console.error('[Server Error]', error)
        return new Response(JSON.stringify({ error: 'Internal Server Error', status: 500 }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      .onRequest(({ request }) => {
        ;(request as any).__startTime = performance.now()
      })
      .onAfterResponse(({ request, set }) => {
        const url = new URL(request.url)
        if (url.pathname.startsWith('/api/')) {
          const status = typeof set.status === 'number' ? set.status : 200
          const level = status >= 500 ? ('error' as const) : status >= 400 ? ('warn' as const) : ('info' as const)
          appLog(level, `${request.method} ${url.pathname} ${status}`)
          const duration = Math.round(performance.now() - ((request as any).__startTime || 0))
          broadcastToAdmins({
            type: 'request',
            method: request.method,
            path: url.pathname,
            status,
            duration,
            timestamp: new Date().toISOString(),
          })
        }
      })

      .get('/health', () => ({ status: 'ok' }))

      // Better-Auth handles /api/auth/* internally
      .mount(auth.handler)

      // Domain and infra routers
      .use(authCompatRouter)
      .use(adminRouter)
      .use(envmanRouter)
      .use(v1Router)
      .use(infraRouter)
      .use(cliDownloadRouter)
      .use(publicStorageRouter)

      // Public docs — raw markdown for AI crawlers and CLI
      .get('/api/docs.md', ({ request }) => {
        const origin = getPublicOrigin(request)
        const md = buildDocsMd(origin)
        const { notModified, headers } = conditional(request, {
          etag: strongEtag(md),
          cacheControl: 'public, max-age=300',
        })
        if (notModified) return notModifiedResponse(headers)
        return new Response(md, {
          headers: {
            ...headers,
            'Content-Type': 'text/markdown; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
          },
        })
      })

      // CLI-focused docs — fetched by `envman docs`
      .get('/api/cli-docs.md', ({ request }) => {
        const origin = getPublicOrigin(request)
        const md = buildCliDocsMd(origin)
        const { notModified, headers } = conditional(request, {
          etag: strongEtag(md),
          cacheControl: 'public, max-age=300',
        })
        if (notModified) return notModifiedResponse(headers)
        return new Response(md, {
          headers: {
            ...headers,
            'Content-Type': 'text/markdown; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
          },
        })
      })

      // Example API
      .get('/api/hello', () => ({ message: 'Hello, world!', method: 'GET' }))
      .put('/api/hello', () => ({ message: 'Hello, world!', method: 'PUT' }))
      .get('/api/hello/:name', ({ params }) => ({ message: `Hello, ${params.name}!` }))
  )
}
