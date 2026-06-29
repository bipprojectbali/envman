import { Elysia } from 'elysia'
import { syncContainersRouter } from './portainer-sync-containers'
import { syncCoreRouter } from './portainer-sync-core'
import { syncLifecycleRouter } from './portainer-sync-lifecycle'
import { syncOpsRouter } from './portainer-sync-ops'
import { syncPreviewRouter } from './portainer-sync-preview'

export const syncRouter = new Elysia()
  .use(syncCoreRouter)
  .use(syncPreviewRouter)
  .use(syncLifecycleRouter)
  .use(syncOpsRouter)
  .use(syncContainersRouter)
