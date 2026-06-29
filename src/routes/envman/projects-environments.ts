import { Elysia } from 'elysia'
import { getEnvironmentAccess, getProjectAccess } from '../../lib/access'
import { requireEnvAuth } from '../../lib/auth-middleware'
import { invalidateProjectCaches } from '../../lib/cache'
import { prisma } from '../../lib/db'

export const projectsEnvironmentsRouter = new Elysia()

  // ─── Environments ─────────────────────────────────────
  .post('/api/envman/projects/:slug/environments', async ({ request, params, set }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const access = await getProjectAccess(auth.userId, auth.role, params.slug)
    if (!access || access === 'VIEWER') {
      set.status = 403
      return { error: 'Editor or Owner required' }
    }
    const body = await request.json().catch(() => null)
    if (!body?.name) {
      set.status = 400
      return { error: 'name required' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    const envName = body.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const existing = await prisma.environment.findUnique({
      where: { projectId_name: { projectId: project.id, name: envName } },
    })
    if (existing) {
      set.status = 400
      return { error: 'Environment name already exists' }
    }
    const tags = Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === 'string') : []
    const environment = await prisma.environment.create({ data: { name: envName, tags, projectId: project.id } })
    const nonOwners = await prisma.projectMember.findMany({
      where: { projectId: project.id, role: { not: 'OWNER' } },
      select: { userId: true },
    })
    if (nonOwners.length > 0) {
      await prisma.environmentMember.createMany({
        data: nonOwners.map((m) => ({
          userId: m.userId,
          environmentId: environment.id,
          role: null,
        })),
        skipDuplicates: true,
      })
    }
    await invalidateProjectCaches(
      params.slug,
      nonOwners.map((m) => m.userId),
    )
    return { environment }
  })

  .delete('/api/envman/projects/:slug/environments/:envName', async ({ request, params, set }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const access = await getEnvironmentAccess(auth.userId, auth.role, params.slug, params.envName)
    if (!access || access !== 'OWNER') {
      set.status = 403
      return { error: 'Owner required' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    await prisma.environment.delete({ where: { projectId_name: { projectId: project.id, name: params.envName } } })
    await invalidateProjectCaches(params.slug)
    return { ok: true }
  })

  .patch('/api/envman/projects/:slug/environments/:envName', async ({ request, params, set }) => {
    const auth = await requireEnvAuth(request)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const access = await getEnvironmentAccess(auth.userId, auth.role, params.slug, params.envName)
    if (!access || !['OWNER', 'EDITOR'].includes(access)) {
      set.status = 403
      return { error: 'Editor or Owner required' }
    }
    const body = await request.json().catch(() => null)
    if (!body || (body.name === undefined && body.tags === undefined)) {
      set.status = 400
      return { error: 'name atau tags diperlukan' }
    }
    if (body.name !== undefined && access !== 'OWNER') {
      set.status = 403
      return { error: 'Owner required to rename environment' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    const updateData: { name?: string; tags?: string[] } = {}
    if (body.name !== undefined) {
      const newName = body.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(newName)) {
        set.status = 400
        return { error: 'Nama hanya boleh huruf kecil, angka, dan strip. Tidak diawali/diakhiri strip.' }
      }
      if (newName !== params.envName) {
        const duplicate = await prisma.environment.findUnique({
          where: { projectId_name: { projectId: project.id, name: newName } },
        })
        if (duplicate) {
          set.status = 400
          return { error: `Environment "${newName}" sudah ada di project ini` }
        }
        updateData.name = newName
      }
    }
    if (body.tags !== undefined) {
      updateData.tags = Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === 'string') : []
    }
    if (Object.keys(updateData).length === 0) return { environment: null, unchanged: true }
    const environment = await prisma.environment.update({
      where: { projectId_name: { projectId: project.id, name: params.envName } },
      data: updateData,
    })
    await invalidateProjectCaches(params.slug)
    return { environment }
  })
