// Entry point for `envman mcp` subcommand.
//
// Stdio MCP server. stdout = JSON-RPC, stderr = logs. Inline (no fork).
// Bug B1 (stdout contamination): never console.log; logger writes to stderr.
// Bug B4 (stdin EOF): graceful shutdown handler.
// Bug B5 (unhandled exception): process-level handlers, don't exit on tool error.
// Bug A1 (no exit on auth error): startup auth failure exits cleanly with stderr message.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { version as PKG_VERSION } from '../../package.json'
import type { Config } from './api-client'
import { emitAudit } from './audit'
import { fetchWhoami, MissingAuthError, resolveMcpAuth, type WhoamiResult } from './auth'
import { log } from './logger'
import { buildServer } from './server-factory'
import type { ToolContext } from './shared'

interface CliFlags {
  write: boolean
  debug: boolean
  version: boolean
  help: boolean
}

function parseFlags(args: string[]): CliFlags {
  const flags: CliFlags = { write: false, debug: false, version: false, help: false }
  for (const a of args) {
    switch (a) {
      case '--write':
        flags.write = true
        break
      case '--debug':
        flags.debug = true
        break
      case '--version':
        flags.version = true
        break
      case '--help':
      case '-h':
        flags.help = true
        break
      default:
        // Unknown flag — log to stderr but don't crash (forward compat)
        process.stderr.write(`envman mcp: unknown flag ignored: ${a}\n`)
    }
  }
  return flags
}

function printHelp(): void {
  process.stderr.write(`Usage: envman mcp [flags]

Start the envman MCP server in stdio mode for use by AI agents (Claude Code, etc.).

Flags:
  --write       Enable mutating tools (var_set, pm_start, etc.). Requires token
                with canWrite=true. Default: readonly tools only.
  --debug       Verbose logging to stderr.
  --version     Print MCP server version and exit.
  --help, -h    Print this help and exit.

Auth resolution (highest priority first):
  1. ENVMAN_SERVER + ENVMAN_TOKEN environment variables
  2. ~/.config/envman/config.json (from \`envman login\`)

Add to your Claude Code MCP config (.mcp.json):

  {
    "mcpServers": {
      "envman": {
        "command": "envman",
        "args": ["mcp"]
      }
    }
  }

For write access:
  "args": ["mcp", "--write"]

Logs go to stderr. stdout carries JSON-RPC protocol.
`)
}

async function probeDaemon(): Promise<boolean> {
  try {
    const { DaemonClient } = await import('../pm/cli/client')
    const client = new DaemonClient({ timeoutMs: 1000 })
    await client.get('/v1/daemon/health')
    return true
  } catch {
    return false
  }
}

let shuttingDown = false

async function shutdown(code = 0): Promise<never> {
  if (shuttingDown) process.exit(code)
  shuttingDown = true
  log.info('shutting down', { code })
  // Brief grace period for any in-flight stderr writes to flush
  await new Promise((r) => setTimeout(r, 50))
  process.exit(code)
}

export async function runMcpServer(argv: string[]): Promise<void> {
  const flags = parseFlags(argv)

  if (flags.help) {
    printHelp()
    return
  }
  if (flags.version) {
    process.stderr.write(`envman-mcp-server ${PKG_VERSION}\n`)
    return
  }

  log.setDebug(flags.debug)

  // Bug B5 mitigation: catch unhandled errors so server stays alive between tool calls.
  // We log to stderr but don't exit — Claude Code's stdio has no auto-reconnect.
  process.on('unhandledRejection', (reason) => {
    log.error('unhandledRejection', { reason: reason instanceof Error ? reason.message : String(reason) })
  })
  process.on('uncaughtException', (err) => {
    log.error('uncaughtException', { error: err.message, stack: err.stack })
  })

  // Bug B4 mitigation: graceful shutdown on stdin EOF or signals.
  process.stdin.on('end', () => {
    log.info('stdin EOF, shutting down')
    void shutdown(0)
  })
  process.on('SIGTERM', () => {
    void shutdown(0)
  })
  process.on('SIGINT', () => {
    void shutdown(0)
  })

  // ─── Auth resolution ────────────────────────────────────────────────────────
  let cfg: Config
  try {
    cfg = resolveMcpAuth()
  } catch (e) {
    if (e instanceof MissingAuthError) {
      process.stderr.write(`envman mcp: ${e.message}\n`)
      process.exit(1)
    }
    throw e
  }

  log.info('auth resolved', { server: cfg.server })

  // ─── Probe whoami (verify token + get canWrite/scopes) ──────────────────────
  let whoami: WhoamiResult
  try {
    whoami = await fetchWhoami(cfg)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    process.stderr.write(`envman mcp: cannot authenticate with ${cfg.server}: ${msg}\n`)
    process.exit(1)
  }

  log.info('whoami ok', { user: whoami.user.email, canWrite: whoami.canWrite, scopes: whoami.scopes.length })

  // ─── Gate write mode on token canWrite ──────────────────────────────────────
  const writeEnabled = flags.write && whoami.canWrite
  if (flags.write && !whoami.canWrite) {
    process.stderr.write(`envman mcp: --write requested but token is read-only. Write tools will not be registered.\n`)
  }

  // ─── Probe daemon (optional) ────────────────────────────────────────────────
  const hasDaemon = await probeDaemon()
  log.info('daemon probe', { hasDaemon })

  // ─── Build server ───────────────────────────────────────────────────────────
  const ctx: ToolContext = { cfg, writeEnabled, hasDaemon }
  const server = buildServer({ name: 'envman-mcp-server', version: PKG_VERSION }, ctx)

  // ─── Audit session start (write mode only — readonly session not auditable) ─
  if (writeEnabled) {
    emitAudit(cfg, 'MCP_SESSION_STARTED', { detail: `mode=write debug=${flags.debug}` })
  }

  // ─── Connect transport ──────────────────────────────────────────────────────
  const transport = new StdioServerTransport()
  await server.connect(transport)
  log.info('mcp server ready')

  // Keep process alive — transport handles the I/O loop.
  // Returns when transport closes (stdin EOF triggers shutdown via listener above).
  await new Promise<void>((resolve) => {
    const checkClosed = setInterval(() => {
      if (shuttingDown) {
        clearInterval(checkClosed)
        resolve()
      }
    }, 1000)
  })
}
