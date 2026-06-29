import { Elysia } from 'elysia'
import { projectsCoreRouter } from './projects-core'
import { projectsEnvironmentsRouter } from './projects-environments'
import { projectsMembersRouter } from './projects-members'
import { projectsVarsBulkRouter } from './projects-vars-bulk'
import { projectsVarsRouter } from './projects-vars'

export const projectsRouter = new Elysia()
  .use(projectsCoreRouter)
  .use(projectsMembersRouter)
  .use(projectsEnvironmentsRouter)
  .use(projectsVarsBulkRouter)
  .use(projectsVarsRouter)
