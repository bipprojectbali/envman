import { Elysia } from 'elysia'
import { getProjectAccess } from '../../lib/access'
import { audit } from '../../lib/audit'
import { requireEnvAuth } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'
import { hasCapability } from '../../lib/permissions'

function getIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown'
}

export const tokensRouter = new Elysia()
  // ─── API Tokens ───────────────────────────────────────
  .get('/api/envman/tokens', async ({ request, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const tokens = await prisma.apiToken.findMany({
      where: { userId: caller.userId },
      select: {
        id: true,
        name: true,
        scopes: true,
        tags: true,
        canWrite: true,
        isDisabled: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    return { tokens }
  })

  .post('/api/envman/tokens', async ({ request, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!hasCapability(caller, 'token:create')) {
      set.status = 403
      return { error: 'Tidak punya izin create API token. Hubungi SUPER_ADMIN.' }
    }
    const body = await request.json().catch(() => null)
    if (!body?.name) {
      set.status = 400
      return { error: 'name required' }
    }
    const { name, scopes = [], tags, canWrite = false, expiresAt } = body
    // Validate each scope — user must have access to every project in scopes
    for (const scope of scopes as string[]) {
      const projectSlug = scope.split(':')[0]
      const access = await getProjectAccess(caller.userId, caller.role, projectSlug)
      if (!access) {
        set.status = 403
        return { error: `No access to project: ${projectSlug}` }
      }
      if (canWrite && access === 'VIEWER') {
        set.status = 403
        return { error: `VIEWER cannot create write tokens for: ${projectSlug}` }
      }
    }
    const token = `em_${crypto.randomUUID().replace(/-/g, '')}`
    const created = await prisma.apiToken.create({
      data: {
        userId: caller.userId,
        name,
        token,
        scopes,
        tags: tags ?? [],
        canWrite,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    })
    return { id: created.id, name: created.name, token, canWrite, expiresAt: created.expiresAt }
  })

  .patch('/api/envman/tokens/:id', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const existing = await prisma.apiToken.findUnique({ where: { id: params.id } })
    if (!existing || existing.userId !== caller.userId) {
      set.status = 404
      return { error: 'Not found' }
    }
    const body = await request.json().catch(() => null)
    const { name, scopes, tags, canWrite, expiresAt } = body ?? {}
    // Validate scopes if provided
    if (scopes) {
      for (const scope of scopes as string[]) {
        const projectSlug = scope.split(':')[0]
        const access = await getProjectAccess(caller.userId, caller.role, projectSlug)
        if (!access) {
          set.status = 403
          return { error: `No access to project: ${projectSlug}` }
        }
        const effectiveWrite = canWrite ?? existing.canWrite
        if (effectiveWrite && access === 'VIEWER') {
          set.status = 403
          return { error: `VIEWER cannot have write access to: ${projectSlug}` }
        }
      }
    }
    const updated = await prisma.apiToken.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(scopes !== undefined && { scopes }),
        ...(tags !== undefined && { tags }),
        ...(canWrite !== undefined && { canWrite }),
        ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
      },
    })
    return {
      id: updated.id,
      name: updated.name,
      scopes: updated.scopes,
      tags: updated.tags,
      canWrite: updated.canWrite,
      expiresAt: updated.expiresAt,
    }
  })

  .patch('/api/envman/tokens/:id/toggle', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const existing = await prisma.apiToken.findUnique({ where: { id: params.id } })
    if (!existing || existing.userId !== caller.userId) {
      set.status = 404
      return { error: 'Not found' }
    }
    const updated = await prisma.apiToken.update({
      where: { id: params.id },
      data: { isDisabled: !existing.isDisabled },
    })
    return { id: updated.id, isDisabled: updated.isDisabled }
  })

  .get('/api/envman/tokens/:id/reveal', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const existing = await prisma.apiToken.findUnique({ where: { id: params.id } })
    if (!existing || existing.userId !== caller.userId) {
      set.status = 404
      return { error: 'Not found' }
    }
    audit(caller.userId, 'TOKEN_REVEALED', `name=${existing.name}`, getIp(request))
    return { token: existing.token }
  })

  .post('/api/envman/tokens/:id/rotate', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const existing = await prisma.apiToken.findUnique({ where: { id: params.id } })
    if (!existing || existing.userId !== caller.userId) {
      set.status = 404
      return { error: 'Not found' }
    }
    const token = `em_${crypto.randomUUID().replace(/-/g, '')}`
    const updated = await prisma.apiToken.update({
      where: { id: params.id },
      data: { token, lastUsedAt: null },
    })
    audit(caller.userId, 'TOKEN_ROTATED', `name=${existing.name}`, getIp(request))
    return { id: updated.id, token }
  })

  .delete('/api/envman/tokens/:id', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const existing = await prisma.apiToken.findUnique({ where: { id: params.id } })
    if (!existing || existing.userId !== caller.userId) {
      set.status = 404
      return { error: 'Not found' }
    }
    await prisma.apiToken.delete({ where: { id: params.id } })
    return { ok: true }
  })
