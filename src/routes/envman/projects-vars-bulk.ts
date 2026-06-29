import { Elysia } from 'elysia'
import { getEnvironmentAccess, tokenScopeAllows } from '../../lib/access'
import { requireEnvAuth } from '../../lib/auth-middleware'
import { decryptSecret, encryptSecret } from '../../lib/crypto'
import { prisma } from '../../lib/db'
import { resolveImportedVars } from '../../lib/env-import'
import { parsePagination } from '../../lib/pagination'
import { logTokenActivity } from '../../lib/token-activity'

export const projectsVarsBulkRouter = new Elysia()

  .get('/api/envman/projects/:slug/environments/:envName/vars', async ({ request, params, set, query }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access) {
      set.status = 403
      return { error: 'No access' }
    }
    if (caller.scopes.length > 0 && !tokenScopeAllows(caller.scopes, params.slug, params.envName)) {
      set.status = 403
      return { error: 'Token tidak memiliki akses ke project/env ini' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    const environment = await prisma.environment.findUnique({
      where: { projectId_name: { projectId: project.id, name: params.envName } },
    })
    if (!environment) {
      set.status = 404
      return { error: 'Environment not found' }
    }
    const search = (query.search as string | undefined) ?? ''
    const { limit, offset } = parsePagination(query as Record<string, unknown>, 50, 200)
    const where = {
      environmentId: environment.id,
      ...(search ? { key: { contains: search, mode: 'insensitive' as const } } : {}),
    }
    const [total, rawVars] = await Promise.all([
      prisma.envVar.count({ where }),
      prisma.envVar.findMany({ where, orderBy: { key: 'asc' }, take: limit, skip: offset }),
    ])
    const canReadSecrets = access === 'OWNER' || access === 'EDITOR'
    const vars = rawVars.map((v) => ({
      id: v.id,
      key: v.key,
      isSecret: v.isSecret,
      isDisabled: v.isDisabled,
      updatedAt: v.updatedAt,
      value: v.isSecret ? (canReadSecrets ? decryptSecret(v.value) : '***') : v.value,
    }))

    const { vars: importedRaw, deniedImports } = await resolveImportedVars(caller.userId, caller.role, environment.id)
    const localKeys = new Set(
      (await prisma.envVar.findMany({ where: { environmentId: environment.id }, select: { key: true } })).map(
        (v) => v.key,
      ),
    )
    const importedKeys = [...new Set(importedRaw.map((v) => v.key))]
    const imported = importedRaw.filter((v) => !localKeys.has(v.key))
    return { vars, total, limit, offset, hasMore: offset + limit < total, imported, importedKeys, deniedImports }
  })

  .get('/api/envman/projects/:slug/environments/:envName/vars/export', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access) {
      set.status = 403
      return { error: 'No access' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    if (caller.scopes.length > 0 && !tokenScopeAllows(caller.scopes, params.slug, params.envName)) {
      set.status = 403
      return { error: 'Token tidak memiliki akses ke project/env ini' }
    }
    const environment = await prisma.environment.findUnique({
      where: { projectId_name: { projectId: project.id, name: params.envName } },
      include: { vars: { orderBy: { key: 'asc' } } },
    })
    if (!environment) {
      set.status = 404
      return { error: 'Environment not found' }
    }
    const canReadSecrets = access === 'OWNER' || access === 'EDITOR'
    const { vars: importedVars, deniedImports } = await resolveImportedVars(caller.userId, caller.role, environment.id)
    const vars: Record<string, string> = {}
    for (const v of importedVars) vars[v.key] = v.value
    for (const v of environment.vars) {
      if (v.isDisabled) continue
      vars[v.key] = v.isSecret ? (canReadSecrets ? decryptSecret(v.value) : '***') : v.value
    }
    if (caller.tokenId) {
      logTokenActivity({
        tokenId: caller.tokenId,
        userId: caller.userId,
        tokenName: caller.tokenName,
        action: 'vars_fetch',
        projectSlug: params.slug,
        envName: params.envName,
        ip:
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
          request.headers.get('x-real-ip') ??
          undefined,
      })
    }
    return deniedImports.length > 0 ? { vars, deniedImports } : { vars }
  })

  .put('/api/envman/projects/:slug/environments/:envName/vars', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access || access === 'VIEWER') {
      set.status = 403
      return { error: 'Editor or Owner required' }
    }
    if (!caller.canWrite) {
      set.status = 403
      return { error: 'Token is read-only' }
    }
    const body = await request.json().catch(() => null)
    if (!body?.vars || typeof body.vars !== 'object') {
      set.status = 400
      return { error: 'vars object required' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    if (caller.scopes.length > 0 && !tokenScopeAllows(caller.scopes, params.slug, params.envName)) {
      set.status = 403
      return { error: 'Token tidak memiliki akses ke project/env ini' }
    }
    let environment = await prisma.environment.findUnique({
      where: { projectId_name: { projectId: project.id, name: params.envName } },
    })
    if (!environment) {
      environment = await prisma.environment.create({ data: { name: params.envName, projectId: project.id } })
    }
    const secretKeys: string[] = body.secrets ?? []
    await Promise.all(
      Object.entries(body.vars as Record<string, string>).map(([key, value]) => {
        const secret = secretKeys.includes(key)
        const stored = secret ? encryptSecret(value) : value
        return prisma.envVar.upsert({
          where: { environmentId_key: { environmentId: environment!.id, key } },
          update: { value: stored, isSecret: secret },
          create: { key, value: stored, isSecret: secret, environmentId: environment!.id },
        })
      }),
    )
    return { ok: true, count: Object.keys(body.vars).length }
  })
