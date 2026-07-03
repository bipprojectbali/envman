import { Elysia } from 'elysia'
import { adminAnalyticsRouter } from './analytics'
import { adminExtensionsRouter } from './extensions'
import { adminFileHealthRouter } from './file-health'
import { adminLogsRouter } from './logs'
import { adminMigrateRouter } from './migrate'
import { adminStorageRouter } from './storage-admin'
import { adminTokenActivityRouter } from './token-activity'
import { adminTokensRouter } from './tokens'
import { adminUsersRouter } from './users'

export const adminRouter = new Elysia()
  .use(adminUsersRouter)
  .use(adminLogsRouter)
  .use(adminAnalyticsRouter)
  .use(adminFileHealthRouter)
  .use(adminTokensRouter)
  .use(adminTokenActivityRouter)
  .use(adminExtensionsRouter)
  .use(adminMigrateRouter)
  .use(adminStorageRouter)
