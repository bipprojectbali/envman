import { Elysia } from 'elysia'
import { portainerInspectRouter } from './portainer-inspect'
import { portainerLogsStreamRouter } from './portainer-logs-stream'
import { portainerRestartRouter } from './portainer-restart'
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
  .use(portainerRestartRouter)
  .use(portainerLogsStreamRouter)
  .use(portainerInspectRouter)
