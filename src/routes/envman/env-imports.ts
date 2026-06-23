import { Elysia } from 'elysia'
import { getEnvironmentAccess } from '../../lib/access'
import { audit } from '../../lib/audit'
import { forbidden, requireEnvAuth, unauthorized } from '../../lib/auth-middleware'
import { invalidateProjectCaches } from '../../lib/cache'
import { prisma } from '../../lib/db'
import { notDeleted } from '../../lib/db-helpers'
import { wouldCreateCycle } from '../../lib/env-import'

function getIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown'
}

// Cari environment by slug + name (notDeleted project). Null = salah satu tidak ada.
async function findEnv(slug: string, envName: string) {
  const project = await prisma.project.findFirst({ where: { slug, ...notDeleted } })
  if (!project) return null
  const env = await prisma.environment.findUnique({
    where: { projectId_name: { projectId: project.id, name: envName } },
  })
  if (!env) return null
  return { project, env }
}

export const envImportsRouter = new Elysia()

  // GET .../imports — list link import env target (OWNER target)
  .get('/api/envman/projects/:slug/environments/:envName/imports', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (access !== 'OWNER') return forbidden(set)

    const found = await findEnv(params.slug, params.envName)
    if (!found) {
      set.status = 404
      return { error: 'Environment tidak ditemukan' }
    }

    const imports = await prisma.envImport.findMany({
      where: { targetEnvId: found.env.id },
      orderBy: { order: 'asc' },
      include: {
        sourceEnv: { select: { name: true, project: { select: { slug: true, name: true } } } },
      },
    })
    return {
      imports: imports.map((i) => ({
        id: i.id,
        order: i.order,
        sourceProject: i.sourceEnv.project.slug,
        sourceProjectName: i.sourceEnv.project.name,
        sourceEnv: i.sourceEnv.name,
        createdAt: i.createdAt,
      })),
    }
  })

  // POST .../imports — tambah link (OWNER target + caller punya akses ≥VIEWER ke source)
  .post('/api/envman/projects/:slug/environments/:envName/imports', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (access !== 'OWNER') return forbidden(set)

    const body = (await request.json().catch(() => null)) as { sourceProject?: unknown; sourceEnv?: unknown } | null
    if (!body || typeof body.sourceProject !== 'string' || typeof body.sourceEnv !== 'string') {
      set.status = 400
      return { error: 'sourceProject dan sourceEnv wajib diisi' }
    }
    const sourceProject = body.sourceProject
    const sourceEnvName = body.sourceEnv

    const target = await findEnv(params.slug, params.envName)
    if (!target) {
      set.status = 404
      return { error: 'Environment target tidak ditemukan' }
    }
    const source = await findEnv(sourceProject, sourceEnvName)
    if (!source) {
      set.status = 404
      return { error: 'Environment source tidak ditemukan' }
    }

    // Caller wajib punya akses (≥VIEWER) ke source env saat membuat link.
    const sourceAccess = await getEnvironmentAccess(caller.userId, caller.role, sourceProject, sourceEnvName)
    if (!sourceAccess) {
      set.status = 403
      return { error: 'Kamu tidak punya akses ke environment source' }
    }

    if (await wouldCreateCycle(target.env.id, source.env.id)) {
      set.status = 400
      return { error: 'Import ditolak: akan membuat siklus (A → B → A)' }
    }

    const existing = await prisma.envImport.findUnique({
      where: { targetEnvId_sourceEnvId: { targetEnvId: target.env.id, sourceEnvId: source.env.id } },
    })
    if (existing) {
      set.status = 409
      return { error: 'Import dari source ini sudah ada' }
    }

    const max = await prisma.envImport.aggregate({
      where: { targetEnvId: target.env.id },
      _max: { order: true },
    })
    const created = await prisma.envImport.create({
      data: {
        targetEnvId: target.env.id,
        sourceEnvId: source.env.id,
        order: (max._max.order ?? -1) + 1,
        createdById: caller.userId,
      },
    })

    audit(
      caller.userId,
      'ENV_IMPORT_ADDED',
      `${params.slug}/${params.envName} <- ${sourceProject}/${sourceEnvName}`,
      getIp(request),
    )
    await invalidateProjectCaches(params.slug, [caller.userId])
    return { ok: true, id: created.id, order: created.order }
  })

  // DELETE .../imports/:id — hapus link (OWNER target)
  .delete('/api/envman/projects/:slug/environments/:envName/imports/:id', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (access !== 'OWNER') return forbidden(set)

    const target = await findEnv(params.slug, params.envName)
    if (!target) {
      set.status = 404
      return { error: 'Environment tidak ditemukan' }
    }
    const link = await prisma.envImport.findUnique({
      where: { id: params.id },
      include: { sourceEnv: { select: { name: true, project: { select: { slug: true } } } } },
    })
    if (!link || link.targetEnvId !== target.env.id) {
      set.status = 404
      return { error: 'Import tidak ditemukan' }
    }

    await prisma.envImport.delete({ where: { id: params.id } })
    audit(
      caller.userId,
      'ENV_IMPORT_REMOVED',
      `${params.slug}/${params.envName} <- ${link.sourceEnv.project.slug}/${link.sourceEnv.name}`,
      getIp(request),
    )
    await invalidateProjectCaches(params.slug, [caller.userId])
    return { ok: true }
  })
