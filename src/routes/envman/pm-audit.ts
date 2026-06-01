// PM audit endpoint — receive lifecycle events dari envman daemon di mesin user.
// Allow user track process management activity di dashboard envman.

import { Elysia } from 'elysia'
import { audit } from '../../lib/audit'
import { requireEnvAuth, unauthorized } from '../../lib/auth-middleware'

const PM_AUDIT_ACTIONS = new Set([
  'PM_PROCESS_STARTED',
  'PM_PROCESS_STOPPED',
  'PM_PROCESS_RESTARTED',
  'PM_PROCESS_CRASHED',
  'PM_PROCESS_QUARANTINED',
  'PM_PROCESS_DELETED',
  'PM_SYNC_TRIGGERED',
  'PM_SYNC_RESTART',
  'PM_DAEMON_STARTED',
  'PM_DAEMON_STOPPED',
])

interface PmAuditBody {
  action: string
  detail?: string
  processName?: string
  processId?: string
}

export const pmAuditRouter = new Elysia().post('/api/envman/pm/audit', async ({ request, set, body }) => {
  const caller = await requireEnvAuth(request)
  if (!caller) return unauthorized(set)

  const b = body as PmAuditBody
  if (!b || typeof b.action !== 'string') {
    set.status = 400
    return { error: 'action required' }
  }
  if (!PM_AUDIT_ACTIONS.has(b.action)) {
    set.status = 400
    return { error: `unknown action: ${b.action}` }
  }

  const detail = JSON.stringify({
    processName: b.processName,
    processId: b.processId,
    message: b.detail,
  })
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown'

  audit(caller.userId, b.action, detail, ip)
  return { ok: true }
})
