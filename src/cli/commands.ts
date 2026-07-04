import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { apiFetch } from './api'
import { resolveAuth } from './auth-resolver'
import { CONFIG_DIR, CONFIG_FILE, VERSION } from './constants'

export async function cmdDocs(args: string[]) {
  if (args[0] === '--help' || args[0] === '-h') {
    console.log(
      'Usage: envman docs\n' +
      '\n' +
      'Print the full API docs and CLI reference to stdout.\n' +
      'Pipe to a file or clipboard for use as AI agent context:\n' +
      '\n' +
      '  envman docs > context.md\n' +
      '  envman docs | pbcopy\n',
    )
    return
  }
  const cfg = resolveAuth({})
  const res = await fetch(`${cfg.server}/api/docs.md`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
  })
  if (!res.ok) {
    console.error(`[envman] Failed to fetch docs (HTTP ${res.status})`)
    process.exit(1)
  }
  process.stdout.write(await res.text())
}

export async function cmdLogin(args: string[]) {
  const server = args[0]
  const tokenIdx = args.indexOf('--token')
  const token = tokenIdx !== -1 ? args[tokenIdx + 1] : null
  if (!server) {
    console.error('Usage: envman login <server-url> --token <token>')
    process.exit(1)
  }
  if (!token) {
    console.error('--token <token> required')
    process.exit(1)
  }
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

export async function cmdLogout() {
  if (existsSync(CONFIG_FILE)) {
    const { unlinkSync } = await import('node:fs')
    unlinkSync(CONFIG_FILE)
  }
  console.log('Logged out.')
}

export async function cmdWhoami() {
  const cfg = resolveAuth({})
  const data = await apiFetch(cfg, '/api/envman/whoami')
  console.log(`User:   ${data.user.email} (${data.user.role})`)
  if (data.tokenName) console.log(`Token:  ${data.tokenName}`)
  console.log(`Server: ${cfg.server}`)
}

export function printHelp() {
  console.log(`envman v${VERSION}

USAGE:
  envman login <server-url> --token <token>   Save credentials to config file
  envman logout                                Remove saved credentials
  envman whoami                                Show current authenticated user
  envman update                                Update CLI to latest version
  envman docs                                  Print full API docs + CLI reference to stdout
  envman run [-e <source>]... <project>:<alias> [args...]  Expand alias + passthrough args
  envman [options] -- <command>                Inject env vars and run command
  envman -- <interpreter> <project>:<path/file.ext>  Execute project file (no -e needed)

OPTIONS:
  -e <project>:<env>   Fetch vars from server environment (project:env)
  -e <file>            Load vars from local file (.env, .env.local, etc.)
  --server-wins        System env overrides merged vars (default: merged wins)

FILE REFERENCE (in command args, after --)
  project:prefix/file.ext   Short form — slug:path disambiguated by "/" or extension
  project:file.ext           Short form — slug:file (single-file entry)
  files:prefix[/file]        Explicit prefix form (project inferred from -e source)
  files:slug/prefix[/file]   Explicit prefix form with slug

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

  # Mix server + local (local overrides server)
  envman -e myapp:production -e .env.local -- bun dev

  # Execute project file — no -e needed, slug embedded in arg
  envman -- bash myapp:scripts/deploy.sh
  envman -- bun myapp:utils/seed.ts

  # Execute project file + inject env vars
  envman -e myapp:production -- bash myapp:scripts/deploy.sh

  # Auth from env vars — no login needed (CI/CD, container)
  ENVMAN_SERVER=https://envman.example.com ENVMAN_TOKEN=em_xxx \\
    envman -e myapp:production -- bun start

PRIORITY (default, later -e wins):
  system env  →  server vars  →  local file vars

Manage projects at: <server-url>/envmanager
`)
}
