import { Elysia } from 'elysia'
import { adminUsersRouter } from './users'
import { adminLogsRouter } from './logs'
import { adminAnalyticsRouter } from './analytics'

export const adminRouter = new Elysia()
  .use(adminUsersRouter)
  .use(adminLogsRouter)
  .use(adminAnalyticsRouter)
