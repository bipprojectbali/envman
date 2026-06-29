import { Elysia } from 'elysia'
import { connectionsCrudRouter } from './portainer-connections-crud'
import { connectionsOpsRouter } from './portainer-connections-ops'
import { connectionsStacksRouter } from './portainer-connections-stacks'

export const connectionsRouter = new Elysia()
  .use(connectionsCrudRouter)
  .use(connectionsStacksRouter)
  .use(connectionsOpsRouter)
