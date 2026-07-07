import { Elysia } from 'elysia'
import { getProjectAccess } from '../../lib/access'
import { requireEnvAuth } from '../../lib/auth-middleware'
import { invalidateProjectCaches } from '../../lib/cache'
import { prisma } from '../../lib/db'

export const projectsMembersRouter = new Elysia()

  // ─── Project Members ──────────────────────────────────
  .post('/api/envman/projects/:slug/members', async ({ request, params, set }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const access = await getProjectAccess(auth.userId, auth.role, params.slug)
    if (!access || access === 'VIEWER' || access === 'EDITOR') {
      set.status = 403
      return { error: 'Owner required' }
    }
    const body = await request.json().catch(() => null)
    if ((!body?.email && !body?.userId) || !body?.role) {
      set.status = 400
      return { error: 'userId (or email) and role required' }
    }
    if (!['OWNER', 'EDITOR', 'VIEWER'].includes(body.role)) {
      set.status = 400
      return { error: 'Invalid role' }
    }
    const user = body.userId
      ? await prisma.user.findUnique({ where: { id: body.userId } })
      : await prisma.user.findUnique({ where: { email: body.email } })
    if (!user) {
      set.status = 404
      return { error: 'User not found' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    const existing = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: user.id, projectId: project.id } },
    })
    const member = existing
      ? await prisma.projectMember.update({
          where: { userId_projectId: { userId: user.id, projectId: project.id } },
          data: { role: body.role },
        })
      : await prisma.projectMember.create({
          data: { userId: user.id, projectId: project.id, role: body.role },
        })

    const shouldDefaultDeny = !existing && body.role !== 'OWNER'
    if (shouldDefaultDeny) {
      const envs = await prisma.environment.findMany({
        where: { projectId: project.id },
        select: { id: true },
      })
      if (envs.length > 0) {
        await prisma.environmentMember.createMany({
          data: envs.map((e) => ({
            userId: user.id,
            environmentId: e.id,
            role: null,
          })),
          skipDuplicates: true,
        })
      }
      // Secure-by-default juga untuk section non-env: member baru non-OWNER default-deny
      // di Notes/Aliases/Files/Storage sampai OWNER grant manual.
      await prisma.projectSectionMember.createMany({
        data: (['NOTES', 'ALIASES', 'FILES', 'STORAGE'] as const).map((section) => ({
          userId: user.id,
          projectId: project.id,
          section,
          role: null,
        })),
        skipDuplicates: true,
      })
    }
    await invalidateProjectCaches(params.slug, [user.id])
    return { member, defaultDenied: shouldDefaultDeny }
  })

  .patch('/api/envman/projects/:slug/members/:userId', async ({ request, params, set }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const access = await getProjectAccess(auth.userId, auth.role, params.slug)
    if (!access || access !== 'OWNER') {
      set.status = 403
      return { error: 'Owner required' }
    }
    const body = await request.json().catch(() => null)
    if (!body?.role || !['OWNER', 'EDITOR', 'VIEWER'].includes(body.role)) {
      set.status = 400
      return { error: 'Invalid role' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    if (body.role !== 'OWNER') {
      const ownerCount = await prisma.projectMember.count({ where: { projectId: project.id, role: 'OWNER' } })
      const targetMember = await prisma.projectMember.findUnique({
        where: { userId_projectId: { userId: params.userId, projectId: project.id } },
      })
      if (ownerCount === 1 && targetMember?.role === 'OWNER') {
        set.status = 400
        return { error: 'Tidak bisa menurunkan owner terakhir. Angkat owner lain terlebih dahulu.' }
      }
    }
    const member = await prisma.projectMember.update({
      where: { userId_projectId: { userId: params.userId, projectId: project.id } },
      data: { role: body.role },
    })
    await invalidateProjectCaches(params.slug)
    return { member }
  })

  .delete('/api/envman/projects/:slug/members/:userId', async ({ request, params, set }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const access = await getProjectAccess(auth.userId, auth.role, params.slug)
    if (!access || access !== 'OWNER') {
      set.status = 403
      return { error: 'Owner required' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    const targetMember = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: params.userId, projectId: project.id } },
    })
    if (targetMember?.role === 'OWNER') {
      const ownerCount = await prisma.projectMember.count({ where: { projectId: project.id, role: 'OWNER' } })
      if (ownerCount === 1) {
        set.status = 400
        return { error: 'Tidak bisa menghapus owner terakhir.' }
      }
    }
    await prisma.projectMember.delete({ where: { userId_projectId: { userId: params.userId, projectId: project.id } } })
    await invalidateProjectCaches(params.slug, [params.userId])
    return { ok: true }
  })

  // ─── Available users for member add (OWNER only) ──────
  .get('/api/envman/projects/:slug/available-users', async ({ request, params, set, query }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const access = await getProjectAccess(auth.userId, auth.role, params.slug)
    if (!access || access !== 'OWNER') {
      set.status = 403
      return { error: 'Owner required' }
    }
    const search = ((query as Record<string, unknown>).search as string | undefined)?.trim() ?? ''
    const project = await prisma.project.findUnique({ where: { slug: params.slug }, select: { id: true } })
    if (!project) {
      set.status = 404
      return { error: 'Not found' }
    }
    const existingIds = (
      await prisma.projectMember.findMany({ where: { projectId: project.id }, select: { userId: true } })
    ).map((m) => m.userId)
    const users = await prisma.user.findMany({
      where: {
        id: { notIn: existingIds },
        blocked: false,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: { id: true, name: true, email: true, image: true },
      take: 200,
      orderBy: { name: 'asc' },
    })
    return { users }
  })
