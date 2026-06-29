import { Elysia } from 'elysia'
import { syncCoreRouter } from './portainer-sync-core'
import { syncLifecycleRouter } from './portainer-sync-lifecycle'
import { syncOpsRouter } from './portainer-sync-ops'

export const syncRouter = new Elysia()
  .use(syncCoreRouter)
  .use(syncLifecycleRouter)
  .use(syncOpsRouter)
