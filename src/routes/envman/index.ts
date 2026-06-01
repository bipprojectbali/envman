import { Elysia } from 'elysia'
import { requireEnvAuth, unauthorized } from '../../lib/auth-middleware'
import { hasMasterKey } from '../../lib/crypto'
// Misc envman routes (status, whoami, user lookup)
import { prisma } from '../../lib/db'
import { adminUsersRouter } from './admin-users'
import { aliasesRouter } from './aliases'
import { databaseRouter } from './database'
import { filesRouter } from './files'
import { gistsRouter } from './gists'
import { mcpAuditRouter } from './mcp-audit'
import { notesRouter } from './notes'
import { pmAuditRouter } from './pm-audit'
import { portainerRouter } from './portainer'
import { portainerBackupRouter } from './portainer-backup'
import { projectsRouter } from './projects'
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
  .use(tokensRouter)
  .use(projectsRouter)
  .use(portainerRouter)
  .use(portainerBackupRouter)
  .use(notesRouter)
  .use(aliasesRouter)
  .use(filesRouter)
  .use(gistsRouter)
  .use(databaseRouter)
  .use(adminUsersRouter)
  .use(pmAuditRouter)
  .use(mcpAuditRouter)
