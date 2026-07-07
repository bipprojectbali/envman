import { Elysia } from 'elysia'
import type { ProjectRole } from '../../lib/access'
import { getProjectAccess } from '../../lib/access'
import { forbidden, requireEnvAuth, unauthorized } from '../../lib/auth-middleware'
import { cacheKeys, withCache } from '../../lib/cache'
import { prisma } from '../../lib/db'
import { notDeleted } from '../../lib/db-helpers'

type SectionRoleInput = 'inherit' | 'denied' | ProjectRole

const SECTIONS = ['NOTES', 'ALIASES', 'FILES', 'STORAGE'] as const

export const sectionMatrixRouter = new Elysia()

  .get('/api/envman/projects/:slug/section-matrix', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)
    const access = await getProjectAccess(caller.userId, caller.role, params.slug)
    if (!access || access !== 'OWNER') return forbidden(set)

    const data = await withCache(cacheKeys.projectSectionMatrix(params.slug), 60, async () => {
      const project = await prisma.project.findFirst({
        where: { slug: params.slug, ...notDeleted },
        include: {
          sectionMembers: { select: { userId: true, section: true, role: true } },
          members: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      })
      if (!project) return null
      const members = project.members.map((pm) => {
        const sectionAccess: Record<string, { sectionRole: SectionRoleInput; effectiveRole: ProjectRole | null }> = {}
        for (const section of SECTIONS) {
          const override = project.sectionMembers.find((sm) => sm.userId === pm.userId && sm.section === section)
          if (!override) {
            sectionAccess[section] = { sectionRole: 'inherit', effectiveRole: pm.role as ProjectRole }
          } else if (override.role === null) {
            sectionAccess[section] = { sectionRole: 'denied', effectiveRole: null }
          } else {
            sectionAccess[section] = {
              sectionRole: override.role as ProjectRole,
              effectiveRole: override.role as ProjectRole,
            }
          }
        }
        return {
          userId: pm.userId,
          user: pm.user,
          projectRole: pm.role as ProjectRole,
          sectionAccess,
        }
      })
      return {
        project: { slug: project.slug, name: project.name },
        sections: SECTIONS,
        members,
      }
    })

    if (!data) {
      set.status = 404
      return { error: 'Project tidak ditemukan' }
    }
    return data
  })
