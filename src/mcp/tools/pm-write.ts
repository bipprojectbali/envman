// PM daemon write tools: pm_start, pm_stop, pm_restart, pm_delete, pm_sync,
// pm_reset, pm_daemon_start, pm_daemon_stop.

import { z } from 'zod'
import { spawnSync } from 'child_process'
import { DaemonClient, DaemonNotRunningError } from '../../pm/cli/client'
import { jsonResponse, type ToolModule, type ToolResponse } from '../shared'
import { toErrorResponse, McpToolError } from '../errors'
import { emitAudit } from '../audit'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ProcessNameSchema = z.string()
  .min(1).max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, 'Process name must be alphanumeric with -/_ only')
  .describe('Process name (unique within daemon).')

const EnvSourceSchema = z.object({
  type: z.enum(['envman', 'file']),
  ref: z.string().describe('"slug:env" for envman, or file path for file'),
}).strict()

const PmStartInputSchema = z.object({
  name: ProcessNameSchema,
  command: z.array(z.string()).min(1).describe('Argv to spawn — first element is the binary.'),
  cwd: z.string().optional().describe('Working directory (default: current daemon CWD).'),
  staticEnv: z.record(z.string(), z.string()).optional()
    .describe('Static env vars as KEY=value object. NOT secrets — visible in pm describe.'),
  envSources: z.array(EnvSourceSchema).optional()
    .describe('Sources to fetch env from. envman type: "slug:env". file type: path.'),
}).strict()

const ProcessSnapshotSchema = z.object({
  id: z.string(), name: z.string(), command: z.array(z.string()),
  pid: z.number().nullable(), status: z.string(),
}).passthrough()

const PmStartOutputSchema = z.object({ process: ProcessSnapshotSchema })

const PmByNameSchema = z.object({ name: ProcessNameSchema }).strict()

const PmSyncInputSchema = z.object({
  name: z.string().optional().describe('Sync only one process by name; omit to sync all.'),
  dryRun: z.boolean().default(false).describe('Compute diff but do not restart.'),
}).strict()

const PmSyncOutputSchema = z.object({
  checked: z.number(),
  updated: z.array(z.string()),
  unchanged: z.array(z.string()),
  failed: z.array(z.object({ name: z.string(), error: z.string() })),
})

const PmDaemonControlInputSchema = z.object({}).strict()

const PmDaemonControlOutputSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
})

// ─── Descriptions ─────────────────────────────────────────────────────────────

const START_DESC = `Start a new process under pm daemon supervision. Requires --write.

ARGS:
  - name: unique process name
  - command: argv array (e.g., ["bun", "index.js"])
  - cwd: working dir (optional)
  - staticEnv: { KEY: value } object (optional, NOT secret-safe — visible in describe)
  - envSources: array of { type: "envman"|"file", ref } (optional)

RETURNS:
  - process: ProcessSnapshot with pid + status

EXAMPLES:
  - pm_start({ name: "api", command: ["bun", "index.js"] })
  - pm_start({ name: "worker", command: ["node", "worker.js"], envSources: [{ type: "envman", ref: "myapp:prod" }] })

ERRORS:
  - 409: name already exists — use pm_delete first or pick a unique name
  - 400: invalid command (empty)

NOTES:
  - Process inherits a limited env allowlist (PATH, HOME, LANG, etc.) + sources.
  - To use envman vars, pass envSources; daemon resolves at start time.
  - **AUDITED**: MCP_PM_START.`

const STOP_DESC = `Stop a managed process (SIGTERM → SIGKILL after 5s timeout).

ARGS: { name }

RETURNS: { process: ProcessSnapshot with status="stopped" }

ERRORS:
  - 404: name not found

NOTES:
  - Idempotent: stopping an already-stopped process succeeds with no-op.
  - **AUDITED**: MCP_PM_STOP.`

const RESTART_DESC = `Restart a managed process (atomic stop+start).

ARGS: { name }

RETURNS: { process: ProcessSnapshot }

ERRORS:
  - 404: name not found

NOTES:
  - Re-fetches envSources if applicable.
  - **AUDITED**: MCP_PM_RESTART.`

const RESET_DESC = `Reset a quarantined process (clears crash-loop quarantine flag, restarts).

ARGS: { name }

RETURNS: { process: ProcessSnapshot }

NOTES:
  - Use when status="quarantined" (5 crashes in 60s window).
  - After reset, process re-enters normal supervision.
  - **AUDITED**: MCP_PM_RESET.`

const DELETE_DESC = `Stop process AND remove from management (delete logs, free name).

ARGS: { name }

RETURNS: { ok, message }

ERRORS:
  - 404: name not found

NOTES:
  - **DESTRUCTIVE**: process logs deleted, cannot recover.
  - **AUDITED**: MCP_PM_DELETE.`

const SYNC_DESC = `Re-fetch env vars from envman server for processes with envSources. Restart processes whose env hash changed.

ARGS:
  - name: optional, sync only one process
  - dryRun: if true, return diff without restarting

RETURNS:
  - checked: total processes considered
  - updated: names of processes restarted (or would-be-restarted if dryRun)
  - unchanged: names with no env diff
  - failed: per-process errors

EXAMPLES:
  - pm_sync() → sync all
  - pm_sync({ dryRun: true }) → preview changes
  - pm_sync({ name: "api" }) → sync only "api"

NOTES:
  - **AUDITED**: MCP_PM_SYNC.`

const DAEMON_START_DESC = `Start the pm daemon (no-op if already running).

ARGS: (none)

RETURNS: { ok, message }

NOTES:
  - This spawns a child process via shell. Takes up to 5s for handshake.
  - If daemon was crashed, will cleanup stale state.
  - **AUDITED**: MCP_PM_DAEMON_START.`

const DAEMON_STOP_DESC = `Stop the pm daemon gracefully. All managed processes also stopped.

ARGS: (none)

RETURNS: { ok, message }

NOTES:
  - **DESTRUCTIVE**: all running processes terminate. Their state persists (resurrect on next start), but logs may be interrupted.
  - **AUDITED**: MCP_PM_DAEMON_STOP.`

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildClient(): DaemonClient | null {
  try {
    return new DaemonClient({ timeoutMs: 10_000 })
  } catch (e) {
    if (e instanceof DaemonNotRunningError) return null
    throw e
  }
}

function daemonNotRunningError(): ToolResponse {
  return {
    isError: true,
    content: [{ type: 'text', text: 'Error: pm daemon is not running. Use pm_daemon_start to start it.' }],
  }
}

async function callDaemon<T>(c: DaemonClient, method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
  try {
    if (method === 'GET') return await c.get<T>(path)
    if (method === 'POST') return await c.post<T>(path, body ?? {})
    return await c.delete<T>(path)
  } catch (e) {
    if (e instanceof DaemonNotRunningError) {
      throw new McpToolError('pm daemon stopped during request. Use pm_daemon_start.')
    }
    throw e
  }
}

// ─── Module ───────────────────────────────────────────────────────────────────

interface OneResponse { process: Record<string, unknown> }
interface SyncResponse { checked: number; updated: string[]; unchanged: string[]; failed: { name: string; error: string }[] }

export const pmWriteModule: ToolModule = {
  register(server, ctx) {
    server.registerTool(
      'pm_start',
      {
        title: 'Start managed process',
        description: START_DESC,
        inputSchema: PmStartInputSchema.shape,
        outputSchema: PmStartOutputSchema.shape,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      },
      async (args): Promise<ToolResponse> => {
        const client = buildClient()
        if (!client) return daemonNotRunningError()
        try {
          const p = PmStartInputSchema.parse(args)
          const res = await callDaemon<OneResponse>(client, 'POST', '/v1/process/start', p)
          emitAudit(ctx.cfg, 'MCP_PM_START', { processName: p.name, detail: `command=${JSON.stringify(p.command)}` })
          return jsonResponse({ process: res.process })
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )

    server.registerTool(
      'pm_stop',
      {
        title: 'Stop process',
        description: STOP_DESC,
        inputSchema: PmByNameSchema.shape,
        outputSchema: PmStartOutputSchema.shape,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      async (args): Promise<ToolResponse> => {
        const client = buildClient()
        if (!client) return daemonNotRunningError()
        try {
          const p = PmByNameSchema.parse(args)
          const res = await callDaemon<OneResponse>(client, 'POST', `/v1/process/${encodeURIComponent(p.name)}/stop`)
          emitAudit(ctx.cfg, 'MCP_PM_STOP', { processName: p.name })
          return jsonResponse({ process: res.process })
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )

    server.registerTool(
      'pm_restart',
      {
        title: 'Restart process',
        description: RESTART_DESC,
        inputSchema: PmByNameSchema.shape,
        outputSchema: PmStartOutputSchema.shape,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      },
      async (args): Promise<ToolResponse> => {
        const client = buildClient()
        if (!client) return daemonNotRunningError()
        try {
          const p = PmByNameSchema.parse(args)
          const res = await callDaemon<OneResponse>(client, 'POST', `/v1/process/${encodeURIComponent(p.name)}/restart`)
          emitAudit(ctx.cfg, 'MCP_PM_RESTART', { processName: p.name })
          return jsonResponse({ process: res.process })
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )

    server.registerTool(
      'pm_reset',
      {
        title: 'Reset quarantined process',
        description: RESET_DESC,
        inputSchema: PmByNameSchema.shape,
        outputSchema: PmStartOutputSchema.shape,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      async (args): Promise<ToolResponse> => {
        const client = buildClient()
        if (!client) return daemonNotRunningError()
        try {
          const p = PmByNameSchema.parse(args)
          const res = await callDaemon<OneResponse>(client, 'POST', `/v1/process/${encodeURIComponent(p.name)}/reset`)
          emitAudit(ctx.cfg, 'MCP_PM_RESET', { processName: p.name })
          return jsonResponse({ process: res.process })
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )

    server.registerTool(
      'pm_delete',
      {
        title: 'Delete process from management',
        description: DELETE_DESC,
        inputSchema: PmByNameSchema.shape,
        outputSchema: PmDaemonControlOutputSchema.shape,
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      },
      async (args): Promise<ToolResponse> => {
        const client = buildClient()
        if (!client) return daemonNotRunningError()
        try {
          const p = PmByNameSchema.parse(args)
          await callDaemon(client, 'DELETE', `/v1/process/${encodeURIComponent(p.name)}`)
          emitAudit(ctx.cfg, 'MCP_PM_DELETE', { processName: p.name })
          return jsonResponse({ ok: true, message: `Process "${p.name}" deleted.` })
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )

    server.registerTool(
      'pm_sync',
      {
        title: 'Re-fetch env + restart changed processes',
        description: SYNC_DESC,
        inputSchema: PmSyncInputSchema.shape,
        outputSchema: PmSyncOutputSchema.shape,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      async (args): Promise<ToolResponse> => {
        const client = buildClient()
        if (!client) return daemonNotRunningError()
        try {
          const p = PmSyncInputSchema.parse(args)
          const body: Record<string, unknown> = {}
          if (p.name) body.name = p.name
          if (p.dryRun) body.dryRun = true
          const res = await callDaemon<SyncResponse>(client, 'POST', '/v1/sync', body)
          emitAudit(ctx.cfg, 'MCP_PM_SYNC', { detail: `dryRun=${p.dryRun} target=${p.name ?? 'all'}` })
          return jsonResponse(res as unknown as Record<string, unknown>)
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )

    server.registerTool(
      'pm_daemon_start',
      {
        title: 'Start pm daemon',
        description: DAEMON_START_DESC,
        inputSchema: PmDaemonControlInputSchema.shape,
        outputSchema: PmDaemonControlOutputSchema.shape,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      async (): Promise<ToolResponse> => {
        try {
          // Spawn `envman pm daemon start` synchronously. Use the same binary we're running.
          const bin = process.argv[0]
          const isDev = bin.includes('bun') && process.argv[1]?.endsWith('.ts')
          const cmd = isDev ? [bin, process.argv[1]!, 'pm', 'daemon', 'start'] : [bin, 'pm', 'daemon', 'start']
          const r = spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8', timeout: 10_000 })
          if (r.status !== 0) {
            return toErrorResponse(new McpToolError(`daemon start failed: ${r.stderr || r.stdout}`))
          }
          emitAudit(ctx.cfg, 'MCP_PM_DAEMON_START')
          return jsonResponse({ ok: true, message: r.stdout.trim() || 'Daemon started.' })
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )

    server.registerTool(
      'pm_daemon_stop',
      {
        title: 'Stop pm daemon',
        description: DAEMON_STOP_DESC,
        inputSchema: PmDaemonControlInputSchema.shape,
        outputSchema: PmDaemonControlOutputSchema.shape,
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      },
      async (): Promise<ToolResponse> => {
        const client = buildClient()
        if (!client) {
          return jsonResponse({ ok: true, message: 'Daemon already stopped (no PID file).' })
        }
        try {
          await callDaemon(client, 'POST', '/v1/daemon/shutdown')
          emitAudit(ctx.cfg, 'MCP_PM_DAEMON_STOP')
          return jsonResponse({ ok: true, message: 'Daemon stopped.' })
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )
  },
}
