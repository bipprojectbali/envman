import { Elysia } from 'elysia'
import type { ProjectRole } from '../../lib/access'
import { getProjectAccess } from '../../lib/access'
import { forbidden, requireEnvAuth, unauthorized } from '../../lib/auth-middleware'
import { cacheKeys, withCache } from '../../lib/cache'
import { prisma } from '../../lib/db'
import { notDeleted } from '../../lib/db-helpers'

type EnvRoleInput = 'inherit' | 'denied' | ProjectRole

export const accessMatrixRouter = new Elysia()

  .get('/api/envman/projects/:slug/access-matrix', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)
    const access = await getProjectAccess(caller.userId, caller.role, params.slug)
    if (!access || access !== 'OWNER') return forbidden(set)

    const data = await withCache(cacheKeys.projectAccessMatrix(params.slug), 60, async () => {
      const project = await prisma.project.findFirst({
        where: { slug: params.slug, ...notDeleted },
        include: {
          environments: {
            select: {
              id: true,
              name: true,
              tags: true,
              members: { select: { userId: true, role: true } },
            },
            orderBy: { name: 'asc' },
          },
          members: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      })
      if (!project) return null
      const environments = project.environments.map((e) => ({ name: e.name, tags: e.tags }))
      const members = project.members.map((pm) => {
        const envAccess: Record<string, { envRole: EnvRoleInput; effectiveRole: ProjectRole | null }> = {}
        for (const env of project.environments) {
          const override = env.members.find((em) => em.userId === pm.userId)
          if (!override) {
            envAccess[env.name] = { envRole: 'inherit', effectiveRole: pm.role as ProjectRole }
          } else if (override.role === null) {
            envAccess[env.name] = { envRole: 'denied', effectiveRole: null }
          } else {
            envAccess[env.name] = { envRole: override.role as ProjectRole, effectiveRole: override.role as ProjectRole }
          }
        }
        return {
          userId: pm.userId,
          user: pm.user,
          projectRole: pm.role as ProjectRole,
          envAccess,
        }
      })
      return {
        project: { slug: project.slug, name: project.name },
        environments,
        members,
      }
    })

    if (!data) {
      set.status = 404
      return { error: 'Project tidak ditemukan' }
    }
    return data
  })
