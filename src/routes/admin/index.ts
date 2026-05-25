import { Elysia } from 'elysia'
import { adminUsersRouter } from './users'
import { adminLogsRouter } from './logs'
import { adminAnalyticsRouter } from './analytics'
import { adminExtensionsRouter } from './extensions'

export const adminRouter = new Elysia()
  .use(adminUsersRouter)
  .use(adminLogsRouter)
  .use(adminAnalyticsRouter)
  .use(adminExtensionsRouter)
