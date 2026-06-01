import { Elysia } from 'elysia'
import { forbidden, requireAuth, requireSuperAdmin, unauthorized } from '../../lib/auth-middleware'
import { redis } from '../../lib/redis'

const REDIS_KEY = 'app:extensions'

export interface ExtensionsConfig {
  portainer: boolean
}

const DEFAULT_CONFIG: ExtensionsConfig = {
  portainer: true,
}

async function getExtensions(): Promise<ExtensionsConfig> {
  try {
    const raw = await redis.get(REDIS_KEY)
    if (!raw) return DEFAULT_CONFIG
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_CONFIG
  }
}

export const adminExtensionsRouter = new Elysia()

  .get('/api/admin/extensions', async ({ request, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return caller === null ? forbidden(set) : unauthorized(set)
    return getExtensions()
  })

  .put('/api/admin/extensions', async ({ request, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return caller === null ? forbidden(set) : unauthorized(set)

    const body = (await request.json()) as Partial<ExtensionsConfig>
    const current = await getExtensions()
    const updated: ExtensionsConfig = {
      portainer: typeof body.portainer === 'boolean' ? body.portainer : current.portainer,
    }
    await redis.set(REDIS_KEY, JSON.stringify(updated))
    return updated
  })

  // Any authenticated user — untuk frontend cek apakah extension aktif
  .get('/api/envman/extensions', async ({ request, set }) => {
    const caller = await requireAuth(request)
    if (!caller) return unauthorized(set)
    return getExtensions()
  })
