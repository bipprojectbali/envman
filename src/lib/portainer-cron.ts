import { prisma } from './db'
import { appLog } from './applog'

type ActiveCron = { stop(): void }

const activeCrons = new Map<string, ActiveCron>()

export async function runBackup(
  connectionId: string,
  type: 'PORTAINER_DB' | 'COMPOSE_FILES' | 'FULL',
  opts?: { note?: string; createdById?: string; triggeredBy?: string },
) {
  const conn = await prisma.portainerConnection.findUnique({ where: { id: connectionId } })
  if (!conn) throw new Error('Connection not found')
  const url = conn.portainerUrl.replace(/\/$/, '')

  if (type === 'PORTAINER_DB' || type === 'FULL') {
    try {
      const res = await fetch(`${url}/api/backup`, {
        method: 'POST',
        headers: { 'X-API-Key': conn.apiToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error(`Portainer backup API returned ${res.status}: ${await res.text()}`)
      const bytes = await res.bytes()
      await prisma.portainerBackup.create({
        data: {
          connectionId,
          type: 'PORTAINER_DB',
          note: opts?.note,
          sizeBytes: bytes.length,
          data: Buffer.from(bytes),
          ok: true,
          createdById: opts?.createdById,
        },
      })
      appLog('info', `Portainer DB backup OK: ${conn.name} (${bytes.length} bytes)`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await prisma.portainerBackup.create({
        data: {
          connectionId,
          type: 'PORTAINER_DB',
          note: opts?.note,
          data: Buffer.alloc(0),
          ok: false,
          error: msg,
          createdById: opts?.createdById,
        },
      })
      appLog('warn', `Portainer DB backup FAILED: ${conn.name} — ${msg}`)
      if (type !== 'FULL') throw err
    }
  }

  if (type === 'COMPOSE_FILES' || type === 'FULL') {
    try {
      const stacksRes = await fetch(`${url}/api/stacks`, { headers: { 'X-API-Key': conn.apiToken } })
      if (!stacksRes.ok) throw new Error(`Failed to fetch stacks: ${stacksRes.status}`)
      const stacks = (await stacksRes.json()) as Array<{ Id: number; Name: string }>

      const composeFiles: Record<string, string> = {}
      await Promise.all(
        stacks.map(async (stack) => {
          try {
            const r = await fetch(`${url}/api/stacks/${stack.Id}/file`, { headers: { 'X-API-Key': conn.apiToken } })
            if (r.ok) {
              const d = (await r.json()) as { StackFileContent: string }
              composeFiles[`${stack.Name}.yml`] = d.StackFileContent
            }
          } catch { /* skip individual stack errors */ }
        }),
      )

      const buf = Buffer.from(JSON.stringify(composeFiles, null, 2))
      await prisma.portainerBackup.create({
        data: {
          connectionId,
          type: 'COMPOSE_FILES',
          note: opts?.note,
          sizeBytes: buf.length,
          data: buf,
          ok: true,
          createdById: opts?.createdById,
        },
      })
      appLog('info', `Portainer compose backup OK: ${conn.name} (${Object.keys(composeFiles).length} stacks)`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await prisma.portainerBackup.create({
        data: {
          connectionId,
          type: 'COMPOSE_FILES',
          note: opts?.note,
          data: Buffer.alloc(0),
          ok: false,
          error: msg,
          createdById: opts?.createdById,
        },
      })
      appLog('warn', `Portainer compose backup FAILED: ${conn.name} — ${msg}`)
      if (type !== 'FULL') throw err
    }
  }
}

export async function syncBackupCrons() {
  for (const [, job] of activeCrons) job.stop()
  activeCrons.clear()

  const schedules = await prisma.portainerBackupSchedule.findMany({ where: { enabled: true } })

  for (const schedule of schedules) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const job = (Bun.cron as any)(schedule.cron, async () => {
        const ok_flag = { ok: true }
        try {
          await runBackup(schedule.connectionId, schedule.type as 'PORTAINER_DB' | 'COMPOSE_FILES' | 'FULL', {
            note: schedule.note ?? undefined,
            triggeredBy: 'scheduled',
          })
        } catch {
          ok_flag.ok = false
        }
        await prisma.portainerBackupSchedule.update({
          where: { id: schedule.id },
          data: { lastRunAt: new Date(), lastRunOk: ok_flag.ok },
        }).catch(() => {})
      })
      activeCrons.set(schedule.connectionId, job)
    } catch (err) {
      appLog('warn', `Invalid backup cron for connection ${schedule.connectionId}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (schedules.length > 0) appLog('info', `Portainer backup crons synced: ${schedules.length} active`)
}
