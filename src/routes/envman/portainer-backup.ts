import { Elysia } from 'elysia'
import { requireEnvAuth, unauthorized } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'
import { hasCapability } from '../../lib/permissions'
import { runBackup, syncBackupCrons } from '../../lib/portainer-cron'

const BACKUP_TYPE_LABEL: Record<string, string> = {
  PORTAINER_DB: 'portainer-db',
  COMPOSE_FILES: 'compose-files',
}

export const portainerBackupRouter = new Elysia()

  // ─── List backups (paginated) ─────────────────────────────────────────────
  .get('/api/envman/portainer/connections/:id/backups', async ({ request, params, set, query }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)
    if (!hasCapability(caller, 'backup:view')) {
      set.status = 403
      return { error: 'Butuh capability: backup:view' }
    }

    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) {
      set.status = 404
      return { error: 'Connection not found' }
    }

    const page = Math.max(1, Number(query.page) || 1)
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20))
    const offset = (page - 1) * limit
    const type = (query.type as string | undefined) ?? undefined

    const where = {
      connectionId: params.id,
      ...(type ? { type: type as any } : {}),
    }

    const [backups, total] = await Promise.all([
      prisma.portainerBackup.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          type: true,
          note: true,
          sizeBytes: true,
          ok: true,
          error: true,
          createdAt: true,
          createdBy: { select: { id: true, name: true } },
        },
      }),
      prisma.portainerBackup.count({ where }),
    ])

    return { backups, total, page, limit, totalPages: Math.ceil(total / limit) }
  })

  // ─── Trigger backup now ───────────────────────────────────────────────────
  .post('/api/envman/portainer/connections/:id/backups', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)
    if (!hasCapability(caller, 'backup:manage')) {
      set.status = 403
      return { error: 'Butuh capability: backup:manage' }
    }

    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) {
      set.status = 404
      return { error: 'Connection not found' }
    }

    const body = (await request.json().catch(() => null)) as { type?: string; note?: string } | null
    const type = (['PORTAINER_DB', 'COMPOSE_FILES', 'FULL'].includes(body?.type ?? '') ? body!.type : 'PORTAINER_DB') as
      | 'PORTAINER_DB'
      | 'COMPOSE_FILES'
      | 'FULL'

    try {
      await runBackup(params.id, type, { note: body?.note, createdById: caller.userId })
      return { ok: true }
    } catch (err) {
      set.status = 500
      return { error: err instanceof Error ? err.message : 'Backup gagal' }
    }
  })

  // ─── Delete multiple backups ──────────────────────────────────────────────
  .delete('/api/envman/portainer/connections/:id/backups', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)
    if (!hasCapability(caller, 'backup:manage')) {
      set.status = 403
      return { error: 'Butuh capability: backup:manage' }
    }

    const body = (await request.json().catch(() => null)) as { ids?: string[] } | null
    if (!body?.ids?.length) {
      set.status = 400
      return { error: 'ids required' }
    }

    const { count } = await prisma.portainerBackup.deleteMany({
      where: { id: { in: body.ids }, connectionId: params.id },
    })
    return { ok: true, count }
  })

  // ─── Download backup file ─────────────────────────────────────────────────
  .get('/api/envman/portainer/connections/:id/backups/:backupId/download', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)
    if (!hasCapability(caller, 'backup:view')) {
      set.status = 403
      return { error: 'Butuh capability: backup:view' }
    }

    const backup = await prisma.portainerBackup.findUnique({
      where: { id: params.backupId },
      select: { id: true, connectionId: true, type: true, data: true, ok: true, createdAt: true },
    })
    if (!backup || backup.connectionId !== params.id) {
      set.status = 404
      return { error: 'Backup not found' }
    }
    if (!backup.ok || !backup.data.length) {
      set.status = 400
      return { error: 'Backup gagal, tidak ada data' }
    }

    const date = backup.createdAt.toISOString().slice(0, 10)
    const isDb = backup.type === 'PORTAINER_DB'
    const filename = `portainer-${BACKUP_TYPE_LABEL[backup.type] ?? backup.type.toLowerCase()}-${date}.${isDb ? 'tar.gz' : 'json'}`

    set.headers = {
      'Content-Type': isDb ? 'application/gzip' : 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    }
    return new Response(backup.data)
  })

  // ─── Get backup schedule ──────────────────────────────────────────────────
  .get('/api/envman/portainer/connections/:id/backup-schedule', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)
    if (!hasCapability(caller, 'backup:view')) {
      set.status = 403
      return { error: 'Butuh capability: backup:view' }
    }

    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) {
      set.status = 404
      return { error: 'Connection not found' }
    }

    const schedule = await prisma.portainerBackupSchedule.findUnique({ where: { connectionId: params.id } })
    return { schedule }
  })

  // ─── Save/update backup schedule ─────────────────────────────────────────
  .put('/api/envman/portainer/connections/:id/backup-schedule', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)
    if (!hasCapability(caller, 'backup:manage')) {
      set.status = 403
      return { error: 'Butuh capability: backup:manage' }
    }

    const conn = await prisma.portainerConnection.findUnique({ where: { id: params.id } })
    if (!conn) {
      set.status = 404
      return { error: 'Connection not found' }
    }

    const body = (await request.json().catch(() => null)) as {
      cron?: string
      type?: string
      note?: string
      enabled?: boolean
    } | null
    if (!body?.cron) {
      set.status = 400
      return { error: 'cron required' }
    }
    const type = (
      ['PORTAINER_DB', 'COMPOSE_FILES', 'FULL'].includes(body.type ?? '') ? body.type : 'PORTAINER_DB'
    ) as string

    const schedule = await prisma.portainerBackupSchedule.upsert({
      where: { connectionId: params.id },
      create: {
        connectionId: params.id,
        cron: body.cron,
        type: type as any,
        note: body.note,
        enabled: body.enabled ?? true,
      },
      update: {
        cron: body.cron,
        type: type as any,
        note: body.note,
        enabled: body.enabled ?? true,
      },
    })

    await syncBackupCrons()
    return { schedule }
  })

  // ─── Delete backup schedule ───────────────────────────────────────────────
  .delete('/api/envman/portainer/connections/:id/backup-schedule', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) return unauthorized(set)
    if (!hasCapability(caller, 'backup:manage')) {
      set.status = 403
      return { error: 'Butuh capability: backup:manage' }
    }

    await prisma.portainerBackupSchedule.deleteMany({ where: { connectionId: params.id } })
    await syncBackupCrons()
    return { ok: true }
  })
