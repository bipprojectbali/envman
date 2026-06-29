import { Elysia } from 'elysia'
import { connectionsContainersRouter } from './portainer-connections-containers'
import { connectionsCrudRouter } from './portainer-connections-crud'
import { connectionsOpsRouter } from './portainer-connections-ops'
import { connectionsStacksRouter } from './portainer-connections-stacks'
import { connectionsStacksOpsRouter } from './portainer-connections-stacks-ops'

export const connectionsRouter = new Elysia()
  .use(connectionsCrudRouter)
  .use(connectionsStacksRouter)
  .use(connectionsStacksOpsRouter)
  .use(connectionsOpsRouter)
  .use(connectionsContainersRouter)
