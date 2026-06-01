import { Elysia } from 'elysia'
import { adminAnalyticsRouter } from './analytics'
import { adminExtensionsRouter } from './extensions'
import { adminLogsRouter } from './logs'
import { adminMigrateRouter } from './migrate'
import { adminUsersRouter } from './users'

export const adminRouter = new Elysia()
  .use(adminUsersRouter)
  .use(adminLogsRouter)
  .use(adminAnalyticsRouter)
  .use(adminExtensionsRouter)
  .use(adminMigrateRouter)
