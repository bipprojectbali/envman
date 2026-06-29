import { Elysia } from 'elysia'
import { forbidden, requireSuperAdmin } from '../../lib/auth-middleware'
import { getOnlineUserIds } from '../../lib/presence'
import { analyticsDataRouter } from './analytics-data'
import { analyticsInspectRouter } from './analytics-inspect'
import { analyticsStructureRouter } from './analytics-structure'

export const adminAnalyticsRouter = new Elysia()

  .get('/api/admin/presence', async ({ request, set }) => {
    const caller = await requireSuperAdmin(request)
    if (!caller) return forbidden(set)
    return { online: getOnlineUserIds() }
  })

  .use(analyticsStructureRouter)
  .use(analyticsInspectRouter)
  .use(analyticsDataRouter)
