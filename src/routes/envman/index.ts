import { Elysia } from 'elysia'
import { requireEnvAuth, unauthorized } from '../../lib/auth-middleware'
import { hasMasterKey } from '../../lib/crypto'
// Misc envman routes (status, whoami, user lookup)
import { prisma } from '../../lib/db'
import { accessMatrixRouter } from './access-matrix'
import { adminUsersQueryRouter } from './admin-users-query'
import { adminUsersRouter } from './admin-users'
import { aliasesRouter } from './aliases'
import { clipboardRouter } from './clipboard'
import { databaseRouter } from './database'
import { envImportsRouter } from './env-imports'
import { envMembersRouter } from './env-members'
import { filesResolveRouter } from './files-resolve'
import { filesRouter } from './files'
import { gistsRouter } from './gists'
import { notesRouter } from './notes'
import { portainerRouter } from './portainer'
import { sectionMatrixRouter } from './section-matrix'
import { sectionMembersRouter } from './section-members'
import { portainerBackupRouter } from './portainer-backup'
import { portainerProbeRouter } from './portainer-probe'
import { projectsRouter } from './projects'
import { settingsRouter } from './settings'
import { storageRouter } from './storage'
import { transfersRouter } from './transfers'
import { tokensRouter } from './tokens'

const envmanMiscRouter = new Elysia()

  .get('/api/envman/status', async ({ request, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)
    return { ok: true, encryptionEnabled: hasMasterKey() }
  })

  .get('/api/envman/whoami', async ({ request, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)
    const user = await prisma.user.findUnique({
      where: { id: caller.userId },
      select: { id: true, name: true, email: true, role: true },
    })
    return { user, tokenName: caller.tokenName, canWrite: caller.canWrite, scopes: caller.scopes }
  })

  .get('/api/envman/users', async ({ request, set, query }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)
    const q = (query.q as string | undefined) ?? ''
    const users = await prisma.user.findMany({
      where: q.trim()
        ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] }
        : {},
      select: { id: true, name: true, email: true, role: true },
      take: 20,
    })
    return { users }
  })

export const envmanRouter = new Elysia()
  .use(envmanMiscRouter)
  .use(settingsRouter)
  .use(tokensRouter)
  .use(projectsRouter)
  .use(accessMatrixRouter)
  .use(envMembersRouter)
  .use(sectionMatrixRouter)
  .use(sectionMembersRouter)
  .use(envImportsRouter)
  .use(portainerRouter)
  .use(portainerBackupRouter)
  .use(portainerProbeRouter)
  .use(notesRouter)
  .use(aliasesRouter)
  .use(filesResolveRouter)
  .use(filesRouter)
  .use(gistsRouter)
  .use(clipboardRouter)
  .use(transfersRouter)
  .use(databaseRouter)
  .use(adminUsersQueryRouter)
  .use(adminUsersRouter)
  .use(storageRouter)
