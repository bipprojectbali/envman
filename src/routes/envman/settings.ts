import { Elysia } from 'elysia'
import { invalidateSettingCache } from '../../lib/app-settings'
import { forbidden, requireSuperAdmin } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'

const ALLOWED_KEYS = [
  'user_token_creation',
  'user_token_max_days',
  'token_activity_enabled',
  'token_activity_log_vars_fetch',
  'token_activity_retention_days',
  'token_activity_cap_per_token',
  'storage_max_file_mb',
  'storage_default_quota_mb',
  'clipboard_max_kb',
  'clipboard_max_ttl_hours',
] as const

export const settingsRouter = new Elysia()

  .get('/api/envman/settings', async () => {
    const rows = await prisma.appSetting.findMany()
    const settings: Record<string, string> = {}
    for (const r of rows) settings[r.key] = r.value
    return { settings }
  })

  .put('/api/envman/settings', async ({ request, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return forbidden(set)

    const body = await request.json().catch(() => null)
    if (!Array.isArray(body)) {
      set.status = 400
      return { error: 'body must be array of { key, value }' }
    }

    for (const item of body as { key: string; value: string }[]) {
      if (!ALLOWED_KEYS.includes(item.key as any)) {
        set.status = 400
        return { error: `Unknown setting key: ${item.key}` }
      }
      await prisma.appSetting.upsert({
        where: { key: item.key },
        update: { value: String(item.value), updatedById: caller.userId },
        create: { key: item.key, value: String(item.value), updatedById: caller.userId },
      })
      invalidateSettingCache(item.key)
    }

    return { ok: true }
  })
