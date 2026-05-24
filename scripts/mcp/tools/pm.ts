// MCP tools untuk envman pm — query state daemon dari Claude.
//
// Readonly tools (dev + stg sama):
//   - pm_daemon_status: ping daemon + return health
//   - pm_list: list processes (name, pid, status, uptime, restarts)
//   - pm_describe: detail per process
//   - pm_logs: snapshot last N lines (out + err)
//
// Admin tools (dev only — write access):
//   - pm_start: start managed process
//   - pm_stop: stop process
//   - pm_restart: restart process
//   - pm_delete: stop + remove

import { z } from 'zod'
import { DaemonClient, DaemonNotRunningError } from '../../../src/pm/cli/client'
import { jsonText, errText, type ToolModule } from './shared'
import type { DaemonHealth } from '../../../src/pm/shared/types'
import type { ProcessSnapshot } from '../../../src/pm/daemon/process-container'

function buildClient(): DaemonClient | null {
  try {
    return new DaemonClient({ timeoutMs: 5000 })
  } catch (e: any) {
    if (e instanceof DaemonNotRunningError) return null
    throw e
  }
}

export const pmReadonlyTools: ToolModule = {
  name: 'pm-readonly',
  scope: 'readonly',
  register(server) {
    server.registerTool(
      'pm_daemon_status',
      {
        title: 'Check envman pm daemon status',
        description: 'Returns daemon health: version, pid, uptime, process count. Reports not-running if daemon down.',
        inputSchema: {},
      },
      async () => {
        const client = buildClient()
        if (!client) return jsonText({ status: 'stopped', message: 'Daemon not running' })
        try {
          const health = await client.get<DaemonHealth>('/v1/daemon/health')
          return jsonText({ status: 'running', ...health })
        } catch (e: any) {
          return jsonText({ status: 'error', error: e.message })
        }
      },
    )

    server.registerTool(
      'pm_list',
      {
        title: 'List managed processes',
        description: 'List all processes managed by envman pm daemon dengan name, pid, status, uptime, restarts',
        inputSchema: {},
      },
      async () => {
        const client = buildClient()
        if (!client) return errText('Daemon not running')
        try {
          const res = await client.get<{ ok: true; processes: ProcessSnapshot[] }>('/v1/process')
          return jsonText({
            count: res.processes.length,
            processes: res.processes.map(p => ({
              id: p.id,
              name: p.name,
              status: p.status,
              pid: p.pid,
              uptimeSec: Math.floor(p.uptimeMs / 1000),
              restartCount: p.restartCount,
              command: p.command,
              cwd: p.cwd,
              lastExitCode: p.lastExitCode,
              lastError: p.lastError,
            })),
          })
        } catch (e: any) {
          return errText(e.message)
        }
      },
    )

    server.registerTool(
      'pm_describe',
      {
        title: 'Describe a managed process',
        description: 'Get detailed info for a process by name or id',
        inputSchema: {
          name: z.string().describe('Process name or id'),
        },
      },
      async ({ name }) => {
        const client = buildClient()
        if (!client) return errText('Daemon not running')
        try {
          const res = await client.get<{ ok: true; process: ProcessSnapshot }>(
            `/v1/process/${encodeURIComponent(name)}`,
          )
          return jsonText(res.process)
        } catch (e: any) {
          return errText(e.message)
        }
      },
    )

    server.registerTool(
      'pm_logs',
      {
        title: 'Get process logs snapshot',
        description: 'Tail last N lines dari stdout + stderr untuk debugging',
        inputSchema: {
          name: z.string().describe('Process name or id'),
        },
      },
      async ({ name }) => {
        const client = buildClient()
        if (!client) return errText('Daemon not running')
        try {
          const res = await client.get<{ ok: true; out: string[]; err: string[] }>(
            `/v1/process/${encodeURIComponent(name)}/logs/tail`,
          )
          return jsonText({
            outLines: res.out.length,
            errLines: res.err.length,
            stdout: res.out.join('\n'),
            stderr: res.err.join('\n'),
          })
        } catch (e: any) {
          return errText(e.message)
        }
      },
    )
  },
}

export const pmAdminTools: ToolModule = {
  name: 'pm-admin',
  scope: 'admin',
  register(server) {
    server.registerTool(
      'pm_start',
      {
        title: 'Start managed process',
        description: 'Start a new managed process via envman pm daemon',
        inputSchema: {
          name: z.string().describe('Unique process name (alphanumeric + - _)'),
          command: z.array(z.string()).describe('Command + args, e.g. ["bun", "index.js"]'),
          cwd: z.string().optional().describe('Working directory'),
          staticEnv: z.record(z.string(), z.string()).optional().describe('Static env KEY=VAL'),
        },
      },
      async ({ name, command, cwd, staticEnv }) => {
        const client = buildClient()
        if (!client) return errText('Daemon not running')
        try {
          const res = await client.post<{ ok: true; process: ProcessSnapshot }>(
            '/v1/process/start',
            { name, command, cwd, staticEnv },
          )
          return jsonText({ started: res.process.name, pid: res.process.pid, status: res.process.status })
        } catch (e: any) {
          return errText(e.message)
        }
      },
    )

    server.registerTool(
      'pm_stop',
      {
        title: 'Stop managed process',
        description: 'Send SIGTERM to a managed process (escalate ke SIGKILL setelah 5s)',
        inputSchema: { name: z.string() },
      },
      async ({ name }) => {
        const client = buildClient()
        if (!client) return errText('Daemon not running')
        try {
          const res = await client.post<{ ok: true; process: ProcessSnapshot }>(
            `/v1/process/${encodeURIComponent(name)}/stop`, {},
          )
          return jsonText({ stopped: res.process.name, status: res.process.status })
        } catch (e: any) {
          return errText(e.message)
        }
      },
    )

    server.registerTool(
      'pm_restart',
      {
        title: 'Restart managed process',
        description: 'Stop + start atomic. Useful setelah edit env atau code reload.',
        inputSchema: { name: z.string() },
      },
      async ({ name }) => {
        const client = buildClient()
        if (!client) return errText('Daemon not running')
        try {
          const res = await client.post<{ ok: true; process: ProcessSnapshot }>(
            `/v1/process/${encodeURIComponent(name)}/restart`, {},
          )
          return jsonText({ restarted: res.process.name, newPid: res.process.pid })
        } catch (e: any) {
          return errText(e.message)
        }
      },
    )

    server.registerTool(
      'pm_delete',
      {
        title: 'Delete managed process',
        description: 'Stop + remove from management',
        inputSchema: { name: z.string() },
      },
      async ({ name }) => {
        const client = buildClient()
        if (!client) return errText('Daemon not running')
        try {
          await client.delete(`/v1/process/${encodeURIComponent(name)}`)
          return jsonText({ removed: name })
        } catch (e: any) {
          return errText(e.message)
        }
      },
    )
  },
}
