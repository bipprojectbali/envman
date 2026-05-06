#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { spawnSync } from 'child_process'

const CONFIG_DIR = join(homedir(), '.config', 'envman')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')
const VERSION = '1.0.0'

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

// ─── Run ─────────────────────────────────────────────────────────────────────

async function cmdRun(sources: string[], command: string[], serverWins: boolean) {
  if (command.length === 0) { console.error('No command specified after --'); process.exit(1) }

  // Step 1: Parse all local files first (needed for auth resolution)
  const localVars: Record<string, string> = {}
  for (const src of sources) {
    if (!src.includes(':')) {
      Object.assign(localVars, parseEnvFile(src))
    }
  }

  // Step 2: Resolve auth (local vars > system env > config file)
  const cfg = resolveAuth(localVars)

  // Step 3: Fetch server envs and merge all sources in order
  // Later sources override earlier ones
  let merged: Record<string, string> = {}
  for (const src of sources) {
    if (src.includes(':')) {
      // Server env: project:env
      const [project, env] = src.split(':')
      if (!env) { console.error(`Invalid format: '${src}' — expected project:env`); process.exit(1) }
      const data = await apiFetch(cfg, `/api/envman/projects/${project}/environments/${env}/vars/export`)
      Object.assign(merged, data.vars)
    } else {
      // Local file: already parsed, but re-merge in order (excluding auth keys)
      const fileVars = parseEnvFile(src)
      // Strip auth keys from injection — no need to leak them into the child process
      const { ENVMAN_SERVER: _s, ENVMAN_TOKEN: _t, ...rest } = fileVars
      Object.assign(merged, rest)
    }
  }

  // Step 4: Final merge with process.env
  // default:      system < merged (server+local ordered)
  // --server-wins handled by source order, this flag flips system vs merged
  const finalEnv = serverWins
    ? { ...merged, ...process.env }   // system overrides everything
    : { ...process.env, ...merged }   // merged overrides system

  const result = spawnSync(command[0], command.slice(1), {
    env: finalEnv,
    stdio: 'inherit',
    shell: false,
  })

  process.exit(result.status ?? 0)
}

// ─── Help ─────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`envman v${VERSION}

USAGE:
  envman login <server-url> --token <token>   Save credentials to config file
  envman logout                                Remove saved credentials
  envman whoami                                Show current authenticated user
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
