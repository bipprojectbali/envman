// PM daemon readonly tools: pm_daemon_status, pm_list, pm_describe, pm_logs.
// Uses existing DaemonClient. Returns helpful error if daemon not running
// rather than throwing (Bug E5 mitigation).

import { z } from 'zod'
import { DaemonClient, DaemonNotRunningError } from '../../pm/cli/client'
import { McpToolError, toErrorResponse } from '../errors'
import { jsonResponse, type ToolModule, type ToolResponse } from '../shared'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const PmDaemonStatusInputSchema = z.object({}).strict()
const PmDaemonStatusOutputSchema = z
  .object({
    uptimeMs: z.number(),
    pid: z.number(),
    version: z.string(),
    processCount: z.number(),
    startedAt: z.number(),
    diskFull: z.boolean(),
  })
  .passthrough()

const PmListInputSchema = z.object({}).strict()

const ProcessSnapshotSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    command: z.array(z.string()),
    cwd: z.string(),
    pid: z.number().nullable(),
    status: z.string(),
    startedAt: z.number().nullable(),
    uptimeMs: z.number(),
    restartCount: z.number(),
    lastExitCode: z.number().nullable(),
    lastError: z.string().nullable(),
  })
  .passthrough()

const PmListOutputSchema = z.object({
  processes: z.array(ProcessSnapshotSchema),
  count: z.number().int(),
})

const PmDescribeInputSchema = z
  .object({
    name: z.string().min(1).max(64).describe('Process name as shown in pm_list'),
  })
  .strict()

const PmDescribeOutputSchema = z.object({ process: ProcessSnapshotSchema })

const PmLogsInputSchema = z
  .object({
    name: z.string().min(1).max(64).describe('Process name'),
    lines: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(100)
      .describe('Number of recent lines to return (default 100, max 1000)'),
    stream: z
      .enum(['out', 'err', 'both'])
      .default('both')
      .describe('Which stream(s) to include: stdout, stderr, or both'),
  })
  .strict()

const PmLogsOutputSchema = z.object({
  out: z.array(z.string()),
  err: z.array(z.string()),
})

// ─── Descriptions ─────────────────────────────────────────────────────────────

const DAEMON_STATUS_DESC = `Get health status of the local pm daemon (process supervisor).

ARGS: (none)

RETURNS:
  - uptimeMs: milliseconds since daemon started
  - pid: daemon process ID
  - version: daemon version
  - processCount: number of managed processes
  - startedAt: epoch ms when daemon started
  - diskFull: true if log manager detected full disk

EXAMPLES:
  - "Is the daemon running?" → pm_daemon_status() → if successful, daemon is running

ERRORS:
  - Returns isError=true with helpful message if daemon is not running. Use pm_daemon_start to start it.

NOTES:
  - The pm daemon is local — runs on the user's machine. Different from envman server (remote API).
  - For envman server status use server_info.`

const PM_LIST_DESC = `List all processes managed by the pm daemon (running, stopped, crashed, quarantined).

ARGS: (none)

RETURNS:
  - processes[]: { id, name, command[], cwd, pid, status, startedAt, uptimeMs, restartCount, lastExitCode, lastError }
  - count

EXAMPLES:
  - pm_list() → all managed processes

ERRORS:
  - Daemon not running → isError with hint

NOTES:
  - status can be: starting, online, stopping, stopped, errored, quarantined
  - quarantined = crash loop detected (5 restarts in 60s). Use pm_reset to recover.`

const PM_DESCRIBE_DESC = `Get full details of one managed process by name.

ARGS:
  - name: process name (as shown in pm_list)

RETURNS:
  - process: full ProcessSnapshot

EXAMPLES:
  - "Why is api-server crashing?" → pm_describe({ name: "api-server" }) → check lastError + restartCount

ERRORS:
  - 404: name not found — use pm_list to see available names
  - Daemon not running → isError with hint

NOTES:
  - For recent log output use pm_logs.`

const PM_LOGS_DESC = `Tail recent stdout/stderr lines of a managed process. Snapshot only — no follow mode (use \`envman pm logs <name> -f\` directly for streaming).

ARGS:
  - name: process name
  - lines: how many recent lines (default 100, max 1000)
  - stream: "out" | "err" | "both" (default both)

RETURNS:
  - out: stdout lines (array)
  - err: stderr lines (array)

EXAMPLES:
  - pm_logs({ name: "api-server" }) → last 100 lines of both streams
  - pm_logs({ name: "api-server", stream: "err", lines: 50 }) → last 50 stderr lines

ERRORS:
  - 404: name not found
  - Daemon not running → isError

NOTES:
  - Lines are typically newest-last (chronological).
  - If process restarted, logs from previous runs may be in rotated files (not included).`

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDaemonClient(): DaemonClient | null {
  try {
    return new DaemonClient({ timeoutMs: 5000 })
  } catch (e) {
    if (e instanceof DaemonNotRunningError) return null
    throw e
  }
}

function daemonNotRunningError(): ToolResponse {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: 'Error: pm daemon is not running. Start it with `envman pm daemon start`, or use pm_daemon_start tool (--write mode).',
      },
    ],
  }
}

async function callDaemon<T>(client: DaemonClient, method: 'GET' | 'POST' | 'DELETE', path: string): Promise<T> {
  try {
    if (method === 'GET') return await client.get<T>(path)
    if (method === 'POST') return await client.post<T>(path, {})
    return await client.delete<T>(path)
  } catch (e: unknown) {
    if (e instanceof DaemonNotRunningError) {
      throw new McpToolError('pm daemon stopped during request. Restart with `envman pm daemon start`.')
    }
    throw e
  }
}

// ─── Module ───────────────────────────────────────────────────────────────────

interface DaemonHealth {
  uptimeMs: number
  pid: number
  version: string
  processCount: number
  startedAt: number
  diskFull: boolean
}
interface ListResponse {
  processes: Array<Record<string, unknown>>
}
interface OneResponse {
  process: Record<string, unknown>
}
interface LogsResponse {
  out: string[]
  err: string[]
}

export const pmReadonlyModule: ToolModule = {
  register(server) {
    server.registerTool(
      'pm_daemon_status',
      {
        title: 'Get pm daemon status',
        description: DAEMON_STATUS_DESC,
        inputSchema: PmDaemonStatusInputSchema.shape,
        outputSchema: PmDaemonStatusOutputSchema.shape,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      async (): Promise<ToolResponse> => {
        const client = buildDaemonClient()
        if (!client) return daemonNotRunningError()
        try {
          const health = await callDaemon<DaemonHealth>(client, 'GET', '/v1/daemon/health')
          return jsonResponse(health as unknown as Record<string, unknown>)
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )

    server.registerTool(
      'pm_list',
      {
        title: 'List all managed processes',
        description: PM_LIST_DESC,
        inputSchema: PmListInputSchema.shape,
        outputSchema: PmListOutputSchema.shape,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      async (): Promise<ToolResponse> => {
        const client = buildDaemonClient()
        if (!client) return daemonNotRunningError()
        try {
          const res = await callDaemon<ListResponse>(client, 'GET', '/v1/process')
          return jsonResponse({ processes: res.processes, count: res.processes.length })
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )

    server.registerTool(
      'pm_describe',
      {
        title: 'Get process detail',
        description: PM_DESCRIBE_DESC,
        inputSchema: PmDescribeInputSchema.shape,
        outputSchema: PmDescribeOutputSchema.shape,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      async (args): Promise<ToolResponse> => {
        const parsed = PmDescribeInputSchema.parse(args)
        const client = buildDaemonClient()
        if (!client) return daemonNotRunningError()
        try {
          const res = await callDaemon<OneResponse>(client, 'GET', `/v1/process/${encodeURIComponent(parsed.name)}`)
          return jsonResponse({ process: res.process })
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )

    server.registerTool(
      'pm_logs',
      {
        title: 'Tail process logs',
        description: PM_LOGS_DESC,
        inputSchema: PmLogsInputSchema.shape,
        outputSchema: PmLogsOutputSchema.shape,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      async (args): Promise<ToolResponse> => {
        const parsed = PmLogsInputSchema.parse(args)
        const client = buildDaemonClient()
        if (!client) return daemonNotRunningError()
        try {
          const res = await callDaemon<LogsResponse>(
            client,
            'GET',
            `/v1/process/${encodeURIComponent(parsed.name)}/logs/tail`,
          )
          let out = res.out
          let err = res.err
          if (parsed.stream === 'out') err = []
          if (parsed.stream === 'err') out = []
          if (parsed.lines < out.length) out = out.slice(-parsed.lines)
          if (parsed.lines < err.length) err = err.slice(-parsed.lines)
          return jsonResponse({ out, err })
        } catch (e) {
          return toErrorResponse(e)
        }
      },
    )
  },
}
