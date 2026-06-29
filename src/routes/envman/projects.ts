import { Elysia } from 'elysia'
import { projectsCoreRouter } from './projects-core'
import { projectsEnvironmentsRouter } from './projects-environments'
import { projectsVarsRouter } from './projects-vars'

export const projectsRouter = new Elysia()
  .use(projectsCoreRouter)
  .use(projectsEnvironmentsRouter)
  .use(projectsVarsRouter)
