import { Elysia } from 'elysia'
import type { ProjectRole } from '../../lib/access'
import { getProjectAccess } from '../../lib/access'
import { audit } from '../../lib/audit'
import { forbidden, requireEnvAuth, unauthorized } from '../../lib/auth-middleware'
import { cacheKeys, invalidateCache, invalidateProjectCaches } from '../../lib/cache'
import { prisma } from '../../lib/db'
import { notDeleted } from '../../lib/db-helpers'
import type { ProjectSection } from '../../../generated/prisma/enums'

type SectionRoleInput = 'inherit' | 'denied' | ProjectRole

const SECTIONS = ['NOTES', 'ALIASES', 'FILES', 'STORAGE'] as const

function isValidSection(value: string): value is ProjectSection {
  return (SECTIONS as readonly string[]).includes(value)
}

function isValidSectionRole(value: unknown): value is SectionRoleInput {
  return value === 'inherit' || value === 'denied' || value === 'OWNER' || value === 'EDITOR' || value === 'VIEWER'
}

function getIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown'
}

export const sectionMembersRouter = new Elysia()

  // GET /api/envman/projects/:slug/sections/:section/members — list section overrides (OWNER)
  .get('/api/envman/projects/:slug/sections/:section/members', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)
    if (!isValidSection(params.section)) {
      set.status = 400
      return { error: 'Section tidak valid' }
    }
    const access = await getProjectAccess(caller.userId, caller.role, params.slug)
    if (!access || access !== 'OWNER') return forbidden(set)

    const project = await prisma.project.findFirst({ where: { slug: params.slug, ...notDeleted } })
    if (!project) {
      set.status = 404
      return { error: 'Project tidak ditemukan' }
    }

    const projectMembers = await prisma.projectMember.findMany({
      where: { projectId: project.id },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
    })
    const sectionMembers = await prisma.projectSectionMember.findMany({
      where: { projectId: project.id, section: params.section },
    })
    const overrideByUser = new Map(sectionMembers.map((m) => [m.userId, m]))

    const members = projectMembers.map((pm) => {
      const override = overrideByUser.get(pm.userId)
      let sectionRole: SectionRoleInput = 'inherit'
      let effectiveRole: ProjectRole | null = pm.role as ProjectRole
      if (override) {
        if (override.role === null) {
          sectionRole = 'denied'
          effectiveRole = null
        } else {
          sectionRole = override.role as ProjectRole
          effectiveRole = override.role as ProjectRole
        }
      }
      return {
        userId: pm.userId,
        user: pm.user,
        projectRole: pm.role as ProjectRole,
        sectionRole,
        effectiveRole,
      }
    })

    return { members }
  })

  // PUT /api/envman/projects/:slug/sections/:section/members/:userId — set override (OWNER)
  .put('/api/envman/projects/:slug/sections/:section/members/:userId', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)
    if (!isValidSection(params.section)) {
      set.status = 400
      return { error: 'Section tidak valid' }
    }
    const access = await getProjectAccess(caller.userId, caller.role, params.slug)
    if (!access || access !== 'OWNER') return forbidden(set)

    const body = (await request.json().catch(() => null)) as { role?: unknown } | null
    if (!body || !isValidSectionRole(body.role)) {
      set.status = 400
      return { error: "role harus 'inherit', 'denied', 'OWNER', 'EDITOR', atau 'VIEWER'" }
    }

    const project = await prisma.project.findFirst({ where: { slug: params.slug, ...notDeleted } })
    if (!project) {
      set.status = 404
      return { error: 'Project tidak ditemukan' }
    }

    // Target user wajib project member — override section hanya bermakna untuk member existing.
    const targetMember = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: params.userId, projectId: project.id } },
    })
    if (!targetMember) {
      set.status = 400
      return { error: 'User belum jadi member project. Tambah ke project dulu sebelum atur akses section.' }
    }

    // Tanpa last-owner-protection: OWNER project selalu bypass via inherit (section bukan resource kritikal
    // seperti env). Deny section pada satu-satunya OWNER pun tak mengunci project — role project tetap OWNER.
    const existing = await prisma.projectSectionMember.findUnique({
      where: { userId_projectId_section: { userId: params.userId, projectId: project.id, section: params.section } },
    })

    if (body.role === 'inherit') {
      if (existing) await prisma.projectSectionMember.delete({ where: { id: existing.id } })
    } else if (body.role === 'denied') {
      await prisma.projectSectionMember.upsert({
        where: { userId_projectId_section: { userId: params.userId, projectId: project.id, section: params.section } },
        update: { role: null },
        create: { userId: params.userId, projectId: project.id, section: params.section, role: null },
      })
    } else {
      await prisma.projectSectionMember.upsert({
        where: { userId_projectId_section: { userId: params.userId, projectId: project.id, section: params.section } },
        update: { role: body.role },
        create: { userId: params.userId, projectId: project.id, section: params.section, role: body.role },
      })
    }

    audit(
      caller.userId,
      'SECTION_MEMBER_SET',
      `${params.slug}/${params.section} user=${params.userId} role=${body.role}`,
      getIp(request),
    )
    await invalidateCache(cacheKeys.projectDetail(params.slug))
    await invalidateProjectCaches(params.slug, [params.userId])
    return { ok: true, role: body.role }
  })

  // DELETE /api/envman/projects/:slug/sections/:section/members/:userId — reset to inherit (OWNER)
  .delete('/api/envman/projects/:slug/sections/:section/members/:userId', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)
    if (!isValidSection(params.section)) {
      set.status = 400
      return { error: 'Section tidak valid' }
    }
    const access = await getProjectAccess(caller.userId, caller.role, params.slug)
    if (!access || access !== 'OWNER') return forbidden(set)

    const project = await prisma.project.findFirst({ where: { slug: params.slug, ...notDeleted } })
    if (!project) {
      set.status = 404
      return { error: 'Project tidak ditemukan' }
    }

    const existing = await prisma.projectSectionMember.findUnique({
      where: { userId_projectId_section: { userId: params.userId, projectId: project.id, section: params.section } },
    })
    if (existing) {
      await prisma.projectSectionMember.delete({ where: { id: existing.id } })
    }
    audit(caller.userId, 'SECTION_MEMBER_CLEARED', `${params.slug}/${params.section} user=${params.userId}`, getIp(request))
    await invalidateCache(cacheKeys.projectDetail(params.slug))
    await invalidateProjectCaches(params.slug, [params.userId])
    return { ok: true }
  })
