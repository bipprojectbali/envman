#!/usr/bin/env bun
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { basename, join } from 'path'
import { spawnSync } from 'child_process'

const CONFIG_DIR = join(homedir(), '.config', 'envman')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')
const VERSION = '1.3.0'

interface Config {
  server: string
  token: string
}

// ─── Local .env file parser ───────────────────────────────────────────────────

function parseEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    console.error(`[envman] file not found: ${filePath}`)
    process.exit(1)
  }
  const result: Record<string, string> = {}
  for (const raw of readFileSync(filePath, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    if (!key) continue
    let value = line.slice(eq + 1)
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      value = value.slice(1, -1)
    result[key] = value
  }
  return result
}

// ─── Auth resolution ──────────────────────────────────────────────────────────
// Priority (highest → lowest):
//   1. Local file vars (ENVMAN_SERVER + ENVMAN_TOKEN from parsed -e files)
//   2. System env vars (ENVMAN_SERVER + ENVMAN_TOKEN from process.env / .bashrc)
//   3. Config file    (~/.config/envman/config.json from `envman login`)

function resolveAuth(localVars: Record<string, string>): Config {
  // 1. Local file vars
  if (localVars.ENVMAN_SERVER && localVars.ENVMAN_TOKEN) {
    return { server: localVars.ENVMAN_SERVER, token: localVars.ENVMAN_TOKEN }
  }
  // 2. System env
  if (process.env.ENVMAN_SERVER && process.env.ENVMAN_TOKEN) {
    return { server: process.env.ENVMAN_SERVER, token: process.env.ENVMAN_TOKEN }
  }
  // 3. Config file
  if (existsSync(CONFIG_FILE)) {
    try {
      const cfg = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
      if (cfg.server && cfg.token) return cfg
    } catch {}
  }
  console.error(
    '[envman] Not authenticated. Options:\n' +
    '  1. Run: envman login <server-url> --token <token>\n' +
    '  2. Set env vars: ENVMAN_SERVER=<url> ENVMAN_TOKEN=<token>\n' +
    '  3. Add ENVMAN_SERVER and ENVMAN_TOKEN to a local file passed with -e'
  )
  process.exit(1)
}

// ─── API fetch ────────────────────────────────────────────────────────────────

async function apiFetch(cfg: Config, path: string): Promise<any> {
  const url = `${cfg.server.replace(/\/$/, '')}${path}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${cfg.token}` } })
  const body = await res.json()
  if (!res.ok) {
    console.error(`Error ${res.status}: ${body.error ?? JSON.stringify(body)}`)
    process.exit(1)
  }
  return body
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function cmdLogin(args: string[]) {
  const server = args[0]
  const tokenIdx = args.indexOf('--token')
  const token = tokenIdx !== -1 ? args[tokenIdx + 1] : null
  if (!server) { console.error('Usage: envman login <server-url> --token <token>'); process.exit(1) }
  if (!token) { console.error('--token <token> required'); process.exit(1) }
  const cfg = { server, token }
  try {
    const data = await apiFetch(cfg, '/api/envman/whoami')
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
    writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2))
    console.log(`Logged in as ${data.user.email} (${data.user.role})`)
    if (data.tokenName) console.log(`Token: ${data.tokenName}`)
  } catch {
    console.error('Login failed. Check server URL and token.')
    process.exit(1)
  }
}

async function cmdLogout() {
  if (existsSync(CONFIG_FILE)) {
    const { unlinkSync } = await import('fs')
    unlinkSync(CONFIG_FILE)
  }
  console.log('Logged out.')
}

async function cmdWhoami() {
  // whoami also supports ENVMAN_SERVER/TOKEN env vars
  const cfg = resolveAuth({})
  const data = await apiFetch(cfg, '/api/envman/whoami')
  console.log(`User:   ${data.user.email} (${data.user.role})`)
  if (data.tokenName) console.log(`Token:  ${data.tokenName}`)
  console.log(`Server: ${cfg.server}`)
}

// ─── Files: stdin command builder ────────────────────────────────────────────

function buildStdinCommand(cmd: string[]): string[] | null {
  const name = basename(cmd[0])
  const rest = cmd.slice(1)
  switch (name) {
    case 'bash': case 'sh': case 'zsh':
      return [cmd[0], '-s', ...rest]           // bash -s reads from stdin, $@ preserved
    case 'bun':
      if (rest[0] === 'run') return [cmd[0], 'run', '-', ...rest.slice(1)]
      return [cmd[0], 'run', '-', ...rest]     // bun run -
    case 'node':
      return [cmd[0], ...rest]                 // node reads JS from stdin
    case 'python3': case 'python':
      return [cmd[0], '-', ...rest]            // python3 -
    case 'deno':
      return [cmd[0], 'run', '-', ...rest]
    default:
      return null                              // fallback: secure temp file
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

async function cmdRun(sources: string[], command: string[], serverWins: boolean) {
  if (command.length === 0) { console.error('No command specified after --'); process.exit(1) }

  // Step 1: Parse all local files first (needed for auth resolution)
  const localVars: Record<string, string> = {}
  for (const src of sources) {
    if (!src.includes(':') && !src.startsWith('files:')) {
      Object.assign(localVars, parseEnvFile(src))
    }
  }

  // Step 2: Resolve auth (local vars > system env > config file)
  const cfg = resolveAuth(localVars)

  // Step 3: Fetch server envs and merge all sources in order
  let merged: Record<string, string> = {}
  for (const src of sources) {
    if (src.startsWith('files:')) continue  // handled separately below
    if (src.includes(':')) {
      const [project, env] = src.split(':')
      if (!env) { console.error(`Invalid format: '${src}' — expected project:env`); process.exit(1) }
      const data = await apiFetch(cfg, `/api/envman/projects/${project}/environments/${env}/vars/export`)
      Object.assign(merged, data.vars)
    } else {
      const fileVars = parseEnvFile(src)
      const { ENVMAN_SERVER: _s, ENVMAN_TOKEN: _t, ...rest } = fileVars
      Object.assign(merged, rest)
    }
  }

  // Step 4: Final merge with process.env
  const finalEnv = serverWins
    ? { ...merged, ...process.env }
    : { ...process.env, ...merged }

  // Step 5: Resolve files: reference in command args (zero disk write via stdin)
  let fileContent: string | null = null
  let fileRef = ''
  let resolvedFilename = ''
  const transformedCommand = [...command]
  const fileArgIdx = transformedCommand.findIndex(a => a.startsWith('files:'))

  if (fileArgIdx !== -1) {
    fileRef = transformedCommand[fileArgIdx]
    transformedCommand.splice(fileArgIdx, 1)  // remove files: from command

    const refBody = fileRef.slice(6)  // strip "files:"
    const parts = refBody.split('/')

    // Infer project slug from first project:env source
    const inferredSlug = sources.find(s => s.includes(':') && !s.startsWith('files:'))?.split(':')[0] ?? ''

    let slug: string
    let prefix: string
    if (parts.length >= 3) {
      slug = parts[0]; prefix = parts[1]; resolvedFilename = parts.slice(2).join('/')
    } else if (parts.length === 2) {
      slug = inferredSlug; prefix = parts[0]; resolvedFilename = parts[1]
    } else {
      slug = inferredSlug; prefix = parts[0]; resolvedFilename = ''
    }

    if (!slug) {
      console.error(`[envman] Cannot infer project slug for "${fileRef}". Add a -e project:env source or use files:slug/prefix/filename.`)
      process.exit(1)
    }

    const qs = resolvedFilename
      ? `prefix=${encodeURIComponent(prefix)}&filename=${encodeURIComponent(resolvedFilename)}`
      : `prefix=${encodeURIComponent(prefix)}`
    const data = await apiFetch(cfg, `/api/envman/projects/${slug}/files/resolve?${qs}`)
    fileContent = data.content
    if (!resolvedFilename) resolvedFilename = data.filename  // for temp file name fallback
  }

  // Step 6: Spawn
  if (fileContent !== null) {
    const stdinCmd = buildStdinCommand(transformedCommand)
    if (stdinCmd) {
      const result = spawnSync(stdinCmd[0], stdinCmd.slice(1), {
        env: finalEnv,
        stdio: ['pipe', 'inherit', 'inherit'],
        input: fileContent,
        shell: false,
      })
      process.exit(result.status ?? 0)
    } else {
      // Secure temp file fallback for unknown interpreters (mode 0600, cleanup on exit)
      const tmpDir = mkdtempSync(join(tmpdir(), 'envman-'))
      const tmpFile = join(tmpDir, basename(resolvedFilename || 'script'))
      writeFileSync(tmpFile, fileContent, { mode: 0o600 })
      const cleanup = () => { try { rmSync(tmpDir, { recursive: true, force: true }) } catch {} }
      process.on('exit', cleanup)
      const result = spawnSync(transformedCommand[0], [tmpFile, ...transformedCommand.slice(1)], {
        env: finalEnv, stdio: 'inherit', shell: false,
      })
      cleanup()
      process.exit(result.status ?? 0)
    }
  } else {
    const result = spawnSync(command[0], command.slice(1), {
      env: finalEnv, stdio: 'inherit', shell: false,
    })
    process.exit(result.status ?? 0)
  }
}

// ─── Run alias ───────────────────────────────────────────────────────────────

async function cmdAlias(args: string[]) {
  // Parse extra -e flags and optional --server-wins from command line.
  // The non-flag argument is the alias ref (project:alias).
  const extraSources: string[] = []
  let ref = ''
  let extraServerWins = false
  let i = 0
  while (i < args.length) {
    const a = args[i]
    if (a === '-e') {
      const val = args[i + 1]
      if (!val) { console.error('-e requires a value'); process.exit(1) }
      extraSources.push(val); i += 2
    } else if (a === '--server-wins') {
      extraServerWins = true; i++
    } else if (!a.startsWith('-')) {
      ref = a; i++
    } else {
      console.error(`Unknown flag: ${a}\nUsage: envman run [-e <source>]... <project>:<alias>`)
      process.exit(1)
    }
  }

  if (!ref || !ref.includes(':')) {
    console.error('Usage: envman run [-e <source>]... <project>:<alias>')
    process.exit(1)
  }

  const cfg = resolveAuth({})
  const data = await apiFetch(cfg, `/api/envman/aliases/resolve/${encodeURIComponent(ref)}`)
  const storedArgs: string = data.args

  const parts = storedArgs.split(/\s+/).filter(Boolean)
  const sepIdx = parts.indexOf('--')
  if (sepIdx === -1) {
    console.error(`[envman] Alias "${ref}" has no -- separator in stored args: ${storedArgs}`)
    process.exit(1)
  }

  const flagParts = parts.slice(0, sepIdx)
  const command = parts.slice(sepIdx + 1)
  if (command.length === 0) {
    console.error(`[envman] Alias "${ref}" stores no command after --`)
    process.exit(1)
  }

  // Parse stored sources from the alias
  const storedSources: string[] = []
  let storedServerWins = false
  let j = 0
  while (j < flagParts.length) {
    const flag = flagParts[j]
    if (flag === '-e') {
      const val = flagParts[j + 1]
      if (!val) { console.error('-e requires a value'); process.exit(1) }
      storedSources.push(val); j += 2
    } else if (flag === '--server-wins') {
      storedServerWins = true; j++
    } else {
      console.error(`Unknown flag in alias: ${flag}`)
      process.exit(1)
    }
  }

  // Extra sources (command line) go first; stored sources override them.
  // e.g. envman run -e .env open-marina:dev
  //      → loads .env first, then server sources win
  const mergedSources = [...extraSources, ...storedSources]
  await cmdRun(mergedSources, command, extraServerWins || storedServerWins)
}

// ─── Help ─────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`envman v${VERSION}

USAGE:
  envman login <server-url> --token <token>   Save credentials to config file
  envman logout                                Remove saved credentials
  envman whoami                                Show current authenticated user
  envman run [-e <source>]... <project>:<alias>    Expand alias, merge extra sources
  envman -e <project:env> -- <cmd> files:<prefix>[/<file>]  Execute project file via stdin
  envman [options] -- <command>                Inject env vars and run command

OPTIONS:
  -e <project>:<env>   Fetch vars from server environment (project:env)
  -e <file>            Load vars from local file (.env, .env.local, etc.)
  --server-wins        System env overrides merged vars (default: merged wins)

AUTHENTICATION (highest priority first):
  1. ENVMAN_SERVER + ENVMAN_TOKEN in a local -e file
  2. ENVMAN_SERVER + ENVMAN_TOKEN as system env vars (set in ~/.bashrc, CI, container)
  3. Config file saved by \`envman login\`

EXAMPLES:
  # Login (saves to ~/.config/envman/config.json)
  envman login https://envman.example.com --token em_abc123

  # Single server env
  envman -e myapp:production -- bun start

  # Multiple server envs (later overrides earlier)
  envman -e myapp:base -e myapp:production -- bun dev

  # Local file only
  envman -e .env.local -- bun dev

  # Mix server + local (local overrides server)
  envman -e myapp:production -e .env.local -- bun dev

  # Auth from env vars — no login needed (CI/CD, container)
  ENVMAN_SERVER=https://envman.example.com ENVMAN_TOKEN=em_xxx \\
    envman -e myapp:production -- bun start

  # Auth from local file — useful for Portainer / team setups
  # .env.local contains: ENVMAN_SERVER=... ENVMAN_TOKEN=...
  envman -e .env.local -e myapp:production -- bun start

PRIORITY (default, later -e wins):
  system env  →  server vars  →  local file vars

Manage projects at: <server-url>/envmanager
`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp(); return
  }
  if (args[0] === '--version' || args[0] === '-v') {
    console.log(VERSION); return
  }

  switch (args[0]) {
    case 'login':  await cmdLogin(args.slice(1)); return
    case 'logout': await cmdLogout(); return
    case 'whoami': await cmdWhoami(); return
    case 'run':    await cmdAlias(args.slice(1)); return
  }

  // Run mode — collect all flags before --
  const sepIdx = args.indexOf('--')
  if (sepIdx === -1) {
    console.error('Missing -- separator.\nUsage: envman -e <project:env|file> -- <command>')
    process.exit(1)
  }

  const flagArgs = args.slice(0, sepIdx)
  const command = args.slice(sepIdx + 1)
  const sources: string[] = []
  let serverWins = false
  let i = 0

  while (i < flagArgs.length) {
    const flag = flagArgs[i]
    if (flag === '-e') {
      const val = flagArgs[i + 1]
      if (!val) { console.error('-e requires a value'); process.exit(1) }
      sources.push(val)
      i += 2
    } else if (flag === '--server-wins') {
      serverWins = true; i++
    } else {
      console.error(`Unknown flag: ${flag}\nRun 'envman --help' for usage.`)
      process.exit(1)
    }
  }

  if (sources.length === 0) {
    console.error('Specify at least one -e source.\nUsage: envman -e project:env -- command')
    process.exit(1)
  }

  await cmdRun(sources, command, serverWins)
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
