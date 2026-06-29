import { Elysia } from 'elysia'
import { connectionsRouter } from './portainer-connections'
import { configRouter } from './portainer-config'
import { syncRouter } from './portainer-sync'

export { triggerAutoSync } from './portainer-helpers'

export const portainerRouter = new Elysia().use(connectionsRouter).use(configRouter).use(syncRouter)
