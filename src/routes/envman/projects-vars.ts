import { Elysia } from 'elysia'
import { getEnvironmentAccess, tokenScopeAllows } from '../../lib/access'
import { requireEnvAuth } from '../../lib/auth-middleware'
import { decryptSecret, encryptSecret } from '../../lib/crypto'
import { prisma } from '../../lib/db'
import { resolveImportedVars } from '../../lib/env-import'
import { parsePagination } from '../../lib/pagination'
import { logTokenActivity } from '../../lib/token-activity'
import { triggerAutoSync } from './portainer'

export const projectsVarsRouter = new Elysia()

  // ─── Env Vars ─────────────────────────────────────────
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

  .post('/api/envman/projects/:slug/environments/:envName/vars', async ({ request, params, set }) => {
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
    if (!body?.key || body.value === undefined) {
      set.status = 400
      return { error: 'key and value required' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    let environment = await prisma.environment.findUnique({
      where: { projectId_name: { projectId: project.id, name: params.envName } },
    })
    if (!environment) {
      environment = await prisma.environment.create({ data: { name: params.envName, projectId: project.id } })
    }
    const envVar = await prisma.envVar.upsert({
      where: { environmentId_key: { environmentId: environment.id, key: body.key } },
      update: { value: body.isSecret ? encryptSecret(body.value) : body.value, isSecret: body.isSecret ?? false },
      create: {
        key: body.key,
        value: body.isSecret ? encryptSecret(body.value) : body.value,
        isSecret: body.isSecret ?? false,
        environmentId: environment.id,
      },
    })
    triggerAutoSync(params.slug, params.envName, caller.userId).catch(() => {})
    if (caller.tokenId) {
      logTokenActivity({
        tokenId: caller.tokenId,
        userId: caller.userId,
        tokenName: caller.tokenName,
        action: 'var_set',
        projectSlug: params.slug,
        envName: params.envName,
        detail: body.key,
        ip:
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
          request.headers.get('x-real-ip') ??
          undefined,
      })
    }
    return { var: { id: envVar.id, key: envVar.key, isSecret: envVar.isSecret } }
  })

  .delete('/api/envman/projects/:slug/environments/:envName/vars/:key', async ({ request, params, set }) => {
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
    const envVar = await prisma.envVar.findUnique({
      where: { environmentId_key: { environmentId: environment.id, key: params.key } },
    })
    if (!envVar) {
      set.status = 404
      return { error: 'Variable not found' }
    }
    await prisma.envVar.delete({ where: { id: envVar.id } })
    if (caller.tokenId) {
      logTokenActivity({
        tokenId: caller.tokenId,
        userId: caller.userId,
        tokenName: caller.tokenName,
        action: 'var_delete',
        projectSlug: params.slug,
        envName: params.envName,
        detail: params.key,
        ip:
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
          request.headers.get('x-real-ip') ??
          undefined,
      })
    }
    return { ok: true }
  })

  .patch('/api/envman/projects/:slug/environments/:envName/vars/:key/toggle', async ({ request, params, set }) => {
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
    const existing = await prisma.envVar.findUnique({
      where: { environmentId_key: { environmentId: environment.id, key: params.key } },
    })
    if (!existing) {
      set.status = 404
      return { error: 'Var not found' }
    }
    const updated = await prisma.envVar.update({
      where: { environmentId_key: { environmentId: environment.id, key: params.key } },
      data: { isDisabled: !existing.isDisabled },
    })
    return { key: updated.key, isDisabled: updated.isDisabled }
  })

  .get('/api/envman/projects/:slug/diff/:env1/:env2', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const [access1, access2] = await Promise.all([
      getEnvironmentAccess(caller.userId, caller.role, params.slug, params.env1),
      getEnvironmentAccess(caller.userId, caller.role, params.slug, params.env2),
    ])
    if (!access1 || !access2) {
      set.status = 403
      return { error: 'No access' }
    }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) {
      set.status = 404
      return { error: 'Project not found' }
    }
    const [e1, e2] = await Promise.all([
      prisma.environment.findUnique({
        where: { projectId_name: { projectId: project.id, name: params.env1 } },
        include: { vars: true },
      }),
      prisma.environment.findUnique({
        where: { projectId_name: { projectId: project.id, name: params.env2 } },
        include: { vars: true },
      }),
    ])
    if (!e1) {
      set.status = 404
      return { error: `Environment '${params.env1}' not found` }
    }
    if (!e2) {
      set.status = 404
      return { error: `Environment '${params.env2}' not found` }
    }
    const map1 = Object.fromEntries(e1.vars.map((v) => [v.key, v]))
    const map2 = Object.fromEntries(e2.vars.map((v) => [v.key, v]))
    const allKeys = new Set([...Object.keys(map1), ...Object.keys(map2)])
    const diff = [...allKeys].sort().map((key) => {
      if (!map1[key]) return { key, status: 'added' }
      if (!map2[key]) return { key, status: 'removed' }
      if (map1[key].value !== map2[key].value) return { key, status: 'changed' }
      return { key, status: 'same' }
    })
    return { env1: params.env1, env2: params.env2, diff }
  })
