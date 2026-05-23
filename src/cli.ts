#!/usr/bin/env bun
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { basename, join } from 'path'
import { spawn, spawnSync } from 'child_process'
import { randomUUID } from 'crypto'

const CONFIG_DIR = join(homedir(), '.config', 'envman')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')
const UPDATE_CACHE_FILE = join(CONFIG_DIR, 'update-check.json')
const RUN_DIR = join(CONFIG_DIR, 'run')
const RUN_DIR_MAX_AGE_MS = 7 * 86400_000  // 7 hari
import { version as PKG_VERSION } from '../package.json'
const VERSION = PKG_VERSION
const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000  // 15 menit

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

// Returns saved server URL without calling process.exit (for background update check)
function getSavedServerUrl(): string | null {
  try {
    if (process.env.ENVMAN_SERVER) return process.env.ENVMAN_SERVER
    if (existsSync(CONFIG_FILE)) {
      const cfg = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
      if (cfg.server) return cfg.server
    }
  } catch {}
  return null
}

// ─── Update check ────────────────────────────────────────────────────────────

function detectPlatform(): string {
  const os = process.platform
  const arch = process.arch
  if (os === 'darwin') return arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64'
  if (os === 'win32') return 'windows-x64'
  return arch === 'arm64' ? 'linux-arm64' : 'linux-x64'
}

// Read cached update state and print notice if update available (no network, instant)
function showUpdateNoticeFromCache() {
  try {
    if (!existsSync(UPDATE_CACHE_FILE)) return
    const cache = JSON.parse(readFileSync(UPDATE_CACHE_FILE, 'utf8'))
    if (!cache.latestVersion || cache.latestVersion === VERSION) return

    if (cache.autoUpdated === true) {
      // Binary berhasil di-replace di background
      console.error(`\n✓ envman diperbarui ke v${cache.latestVersion} di background.\n`)
      writeFileSync(UPDATE_CACHE_FILE, JSON.stringify({ ...cache, autoUpdated: false }))
    } else if (cache.autoUpdated === false && cache.latestVersion !== VERSION) {
      // Update tersedia tapi bg replace gagal (butuh sudo) — minta user update manual
      console.error(`\n[envman] Update tersedia: v${VERSION} → v${cache.latestVersion}. Jalankan: envman update\n`)
    }
  } catch {}
}

// Spawn detached subprocess to refresh update cache (doesn't block parent)
function spawnUpdateCheck(serverUrl: string, _token: string) {
  try {
    if (!existsSync(UPDATE_CACHE_FILE)) {
      // First run — force check
    } else {
      const cache = JSON.parse(readFileSync(UPDATE_CACHE_FILE, 'utf8'))
      if (Date.now() - (cache.checkedAt ?? 0) < UPDATE_CHECK_INTERVAL_MS) return
    }
    const child = spawn(process.execPath, ['--_update-check', serverUrl, process.execPath], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
  } catch {}
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

// ─── Project file ref detection ──────────────────────────────────────────────
// Disambiguate project:env vs project:path/file.ext in command args.
// Rules (both must NOT apply to be treated as env):
//   - Contains "/" after colon → path ref (env names never have slashes)
//   - Has a file extension after colon → file ref (env names don't have dots)
function isProjectFileRef(arg: string): boolean {
  if (!arg.includes(':')) return false
  const after = arg.slice(arg.indexOf(':') + 1)
  if (!after) return false
  return after.includes('/') || /\.[a-zA-Z0-9]+$/.test(after)
}

// ─── npm import detection ────────────────────────────────────────────────────
// Detect bare-name imports (not relative, not built-in, not bun:/node: prefix).
// Used to decide whether to enable Bun --install=auto for piped scripts.
const NODE_BUILTINS = new Set([
  'fs', 'path', 'os', 'http', 'https', 'crypto', 'child_process', 'util',
  'stream', 'events', 'url', 'querystring', 'buffer', 'process', 'zlib',
  'net', 'dns', 'tls', 'cluster', 'worker_threads', 'readline', 'assert',
  'console', 'timers', 'string_decoder', 'punycode', 'vm', 'v8', 'perf_hooks',
])

export function detectsNpmImports(content: string): boolean {
  const patterns = [
    /^\s*import\s+(?:[^'"]+?\s+from\s+)?["']([^"']+)["']/gm,  // ESM static import
    /\brequire\s*\(\s*["']([^"']+)["']/g,                      // CJS require
    /\bimport\s*\(\s*["']([^"']+)["']/g,                       // dynamic import()
  ]
  for (const re of patterns) {
    for (const match of content.matchAll(re)) {
      const spec = match[1]
      if (!spec) continue
      if (spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/')) continue
      if (spec.startsWith('bun:') || spec.startsWith('node:')) continue
      if (NODE_BUILTINS.has(spec)) continue
      return true  // bare specifier = npm package
    }
  }
  return false
}

// ─── Isolated workspace for Bun scripts ──────────────────────────────────────
// Bun's resolver walks up looking for node_modules. If user is inside a Node
// project that doesn't have the imported packages, resolution fails. Solution:
// run script in a fresh CWD at ~/.config/envman/run/<uuid>/ that symlinks user
// files but excludes node_modules — Bun's walk-up finds no node_modules → auto
// install kicks in → packages come from global cache.

interface IsolatedWorkspace {
  runDir: string
  symlinkFailed: boolean  // true = Windows perm or similar → no `./file` access
}

// Entries di user CWD yang TIDAK di-symlink ke workspace. Tujuannya: cegah Bun
// resolution algorithm (walk-up node_modules, baca lockfile, baca bunfig) bocor
// ke project user. Auto-install hanya jalan kalau Bun gak ketemu lockfile/config
// yang bilang "pakai deps yang sudah ada".
const WORKSPACE_SKIP_ENTRIES = new Set([
  'node_modules',       // resolution root
  'package.json',       // declares deps Bun expects to find
  'bun.lock',           // Bun lockfile (text)
  'bun.lockb',          // Bun lockfile (binary, legacy)
  'package-lock.json',  // npm lockfile
  'yarn.lock',          // yarn lockfile
  'pnpm-lock.yaml',     // pnpm lockfile
  'bunfig.toml',        // bisa disable auto-install
  '.bunfig.toml',       // dot-prefixed variant
])

function prepareIsolatedWorkspace(userCwd: string): IsolatedWorkspace | null {
  try {
    if (!existsSync(RUN_DIR)) mkdirSync(RUN_DIR, { recursive: true })
    const runDir = join(RUN_DIR, randomUUID())
    mkdirSync(runDir)

    // Minimal package.json so Bun doesn't try to read user's package.json
    // (which would declare deps it expects to find in node_modules).
    writeFileSync(join(runDir, 'package.json'), '{"name":"envman-script","type":"module"}')

    // Symlink top-level entries from user CWD, except resolution-affecting files.
    let symlinkFailed = false
    let entries: string[] = []
    try { entries = readdirSync(userCwd) } catch { entries = [] }
    for (const entry of entries) {
      if (WORKSPACE_SKIP_ENTRIES.has(entry)) continue
      try {
        symlinkSync(join(userCwd, entry), join(runDir, entry))
      } catch {
        // Windows symlink perm denied, broken target, dll → fallback ke pure isolation
        symlinkFailed = true
        break
      }
    }
    return { runDir, symlinkFailed }
  } catch {
    return null  // can't create runDir → caller falls back to user CWD
  }
}

function cleanupRunDir(runDir: string) {
  try { rmSync(runDir, { recursive: true, force: true }) } catch {}
}

// Auto-purge run dirs older than 7 days. Called on every CLI startup (cheap).
function cleanupOldRunDirs() {
  try {
    if (!existsSync(RUN_DIR)) return
    const now = Date.now()
    for (const entry of readdirSync(RUN_DIR)) {
      const path = join(RUN_DIR, entry)
      try {
        const stats = statSync(path)
        if (now - stats.mtimeMs > RUN_DIR_MAX_AGE_MS) {
          rmSync(path, { recursive: true, force: true })
        }
      } catch {}
    }
  } catch {}
}

// ─── Files: stdin command builder ────────────────────────────────────────────

function buildStdinCommand(cmd: string[], opts: { bunAutoInstall?: boolean } = {}): string[] | null {
  const name = basename(cmd[0])
  const rest = cmd.slice(1)
  switch (name) {
    case 'bash': case 'sh': case 'zsh':
      return [cmd[0], '-s', ...rest]           // bash -s reads from stdin, $@ preserved
    case 'bun': {
      // --install=auto goes BEFORE `run` subcommand. Default Bun behavior is already
      // auto, but we pass explicitly to override any user bunfig.toml that disables it.
      const installFlag = opts.bunAutoInstall ? ['--install=auto'] : []
      if (rest[0] === 'run') return [cmd[0], ...installFlag, 'run', '-', ...rest.slice(1)]
      return [cmd[0], ...installFlag, 'run', '-', ...rest]
    }
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

async function cmdRun(sources: string[], command: string[], serverWins: boolean, projectSlugHint = '') {
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

  // Step 5: Resolve file reference in command args (zero disk write via stdin)
  // Supports two syntaxes:
  //   files:prefix[/filename]          — explicit prefix (project inferred from -e source)
  //   files:slug/prefix[/filename]     — explicit slug + prefix
  //   project:prefix/filename.ext      — new: slug:path, disambiguated by "/" or extension
  //   project:file.ext                 — new: slug:file, disambiguated by extension
  let fileContent: string | null = null
  let resolvedFilename = ''
  const transformedCommand = [...command]
  const fileArgIdx = transformedCommand.findIndex(a => a.startsWith('files:') || isProjectFileRef(a))

  if (fileArgIdx !== -1) {
    const fileRef = transformedCommand[fileArgIdx]
    transformedCommand.splice(fileArgIdx, 1)

    let slug: string
    let prefix: string

    if (fileRef.startsWith('files:')) {
      // Legacy files: syntax
      const refBody = fileRef.slice(6)
      const parts = refBody.split('/')
      const inferredSlug = sources.find(s => s.includes(':') && !s.startsWith('files:'))?.split(':')[0] ?? projectSlugHint
      if (parts.length >= 3) {
        slug = parts[0]; prefix = parts[1]; resolvedFilename = parts.slice(2).join('/')
      } else if (parts.length === 2) {
        slug = inferredSlug; prefix = parts[0]; resolvedFilename = parts[1]
      } else {
        slug = inferredSlug; prefix = parts[0]; resolvedFilename = ''
      }
    } else {
      // New project:path syntax — slug is always explicit (before colon)
      const colonIdx = fileRef.indexOf(':')
      slug = fileRef.slice(0, colonIdx)
      const filePath = fileRef.slice(colonIdx + 1)
      const parts = filePath.split('/')
      if (parts.length >= 2) {
        prefix = parts[0]; resolvedFilename = parts.slice(1).join('/')
      } else {
        // e.g. "project:deploy.sh" — treat whole segment as prefix (single-file entry)
        prefix = filePath; resolvedFilename = ''
      }
    }

    if (!slug) {
      console.error(`[envman] Cannot infer project slug for "${fileRef}". Use project:path/file.ext syntax or add -e project:env.`)
      process.exit(1)
    }

    const qs = resolvedFilename
      ? `prefix=${encodeURIComponent(prefix)}&filename=${encodeURIComponent(resolvedFilename)}`
      : `prefix=${encodeURIComponent(prefix)}`
    const data = await apiFetch(cfg, `/api/envman/projects/${slug}/files/resolve?${qs}`)
    fileContent = data.content
    if (!resolvedFilename) resolvedFilename = data.filename
  }

  // Step 6: Spawn
  if (fileContent !== null) {
    const interpreterName = basename(transformedCommand[0])
    const isBun = interpreterName === 'bun'
    const hasNpmImports = isBun && detectsNpmImports(fileContent)

    // For Bun scripts: ALWAYS isolate in ~/.config/envman/run/<uuid>/ to decouple
    // from user's node_modules. Symlinks to user files preserved (kecuali Windows
    // perm fail). INIT_CWD env var = original CWD as fallback convention.
    const userCwd = process.cwd()
    const workspace = isBun ? prepareIsolatedWorkspace(userCwd) : null
    if (workspace?.symlinkFailed) {
      console.error('[envman] symlink terbatas (mungkin Windows tanpa dev mode) — pure isolation. Pakai $INIT_CWD/file untuk akses file user.')
    } else if (workspace && hasNpmImports) {
      console.error('[envman] npm imports terdeteksi — running in isolated workspace dengan auto-install.')
    }

    const stdinCmd = buildStdinCommand(transformedCommand, { bunAutoInstall: hasNpmImports })
    if (stdinCmd) {
      const spawnEnv = { ...finalEnv, ...(workspace ? { INIT_CWD: userCwd } : {}) }
      const result = spawnSync(stdinCmd[0], stdinCmd.slice(1), {
        env: spawnEnv,
        cwd: workspace?.runDir,
        stdio: ['pipe', 'inherit', 'inherit'],
        input: fileContent,
        shell: false,
      })
      if (workspace) {
        if (result.status === 0) {
          cleanupRunDir(workspace.runDir)
        } else {
          console.error(`[envman] script gagal (exit ${result.status}). Workspace preserved untuk debug: ${workspace.runDir}`)
        }
      }
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
  // Everything AFTER the ref is collected as extra args passed through to the command.
  const extraSources: string[] = []
  const passthroughArgs: string[] = []
  let ref = ''
  let extraServerWins = false
  let refFound = false
  let i = 0
  while (i < args.length) {
    const a = args[i]
    if (refFound) {
      // After ref: everything is passed through to the command
      passthroughArgs.push(a); i++
    } else if (a === '-e') {
      const val = args[i + 1]
      if (!val) { console.error('-e requires a value'); process.exit(1) }
      extraSources.push(val); i += 2
    } else if (a === '--server-wins') {
      extraServerWins = true; i++
    } else if (!a.startsWith('-')) {
      ref = a; refFound = true; i++
    } else {
      console.error(`Unknown flag: ${a}\nUsage: envman run [-e <source>]... <project>:<alias> [args...]`)
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
  // Pass alias project slug as hint so files: can resolve even with no -e project:env source
  const aliasProject = ref.split(':')[0]
  // Append passthrough args to command (e.g. envman run project:alias --flag value)
  await cmdRun(mergedSources, [...command, ...passthroughArgs], extraServerWins || storedServerWins, aliasProject)
}

// ─── Download helper: streaming with progress + timeout ──────────────────────

async function downloadBinary(url: string, timeoutMs = 10 * 60 * 1000, showProgress = false): Promise<Buffer | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: { 'Accept-Encoding': 'gzip' },
      signal: controller.signal,
    })
    if (!res.ok || !res.body) { clearTimeout(timer); return null }

    const chunks: Buffer[] = []
    const reader = res.body.getReader()
    let received = 0
    let lastMb = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(Buffer.from(value))
      received += value.length
      if (showProgress) {
        const mb = Math.floor(received / (1024 * 1024))
        if (mb > lastMb) { process.stdout.write('.'); lastMb = mb }
      }
    }
    clearTimeout(timer)
    if (showProgress) process.stdout.write(` ${(received / 1024 / 1024).toFixed(1)}MB\n`)
    return Buffer.concat(chunks)
  } catch (e) {
    clearTimeout(timer)
    if ((e as Error).name === 'AbortError') return null
    throw e
  }
}

// ─── Update ──────────────────────────────────────────────────────────────────

async function cmdUpdate() {
  const cfg = resolveAuth({})
  const server = cfg.server.replace(/\/$/, '')
  console.log(`Memeriksa update...`)
  const res = await fetch(`${server}/download/cli/version`).catch(() => null)
  if (!res?.ok) { console.error('Tidak bisa cek versi dari server.'); process.exit(1) }
  const { version: latest } = await res.json() as { version: string }
  if (latest === VERSION) {
    console.log(`✓ envman v${VERSION} sudah versi terbaru.`)
    // Update cache
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
    writeFileSync(UPDATE_CACHE_FILE, JSON.stringify({ checkedAt: Date.now(), latestVersion: latest }))
    return
  }
  console.log(`Update tersedia: v${VERSION} → v${latest}`)
  process.stdout.write('Mengunduh')
  const platform = detectPlatform()
  const buf = await downloadBinary(`${server}/download/cli/${platform}`, 10 * 60 * 1000, true)
  if (!buf) { console.error('Download gagal atau timeout. Cek koneksi ke server.'); process.exit(1) }

  const tmpBin = join(tmpdir(), `envman-update-${Date.now()}`)
  writeFileSync(tmpBin, buf, { mode: 0o755 })

  const binaryPath = process.execPath
  const { renameSync } = await import('fs')
  try {
    rmSync(binaryPath, { force: true })
    renameSync(tmpBin, binaryPath)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EACCES') {
      // Binary di direktori protected (mis. /usr/local/bin) — butuh sudo
      console.log(`Membutuhkan izin sudo untuk install ke ${binaryPath}...`)
      const r = spawnSync('sudo', ['mv', '-f', tmpBin, binaryPath], { stdio: 'inherit' })
      if (r.status !== 0) {
        console.error(`Update gagal. Coba manual:\n  sudo mv ${tmpBin} ${binaryPath}`)
        process.exit(1)
      }
    } else {
      throw e
    }
  }

  writeFileSync(UPDATE_CACHE_FILE, JSON.stringify({ checkedAt: Date.now(), latestVersion: latest }))
  console.log(`✓ envman diupdate ke v${latest}.`)
}

// ─── Help ─────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`envman v${VERSION}

USAGE:
  envman login <server-url> --token <token>   Save credentials to config file
  envman logout                                Remove saved credentials
  envman whoami                                Show current authenticated user
  envman update                                Update CLI to latest version
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)

  // Hidden flag: background auto-update (spawned detached, runs silently after main process exits)
  if (args[0] === '--_update-check') {
    const [, serverUrl, binaryPath] = args
    try {
      const server = serverUrl.replace(/\/$/, '')
      const res = await fetch(`${server}/download/cli/version`)
      if (!res.ok) process.exit(0)
      const { version: latest } = await res.json() as { version: string }

      if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })

      if (latest === VERSION) {
        // Already up to date — just refresh the check timestamp
        writeFileSync(UPDATE_CACHE_FILE, JSON.stringify({ checkedAt: Date.now(), latestVersion: latest }))
        process.exit(0)
      }

      // Download new binary (silent, 8-min timeout)
      const platform = detectPlatform()
      const buf = await downloadBinary(`${server}/download/cli/${platform}`, 8 * 60 * 1000, false)
      if (!buf || buf.length < 1_000_000) process.exit(0)  // sanity: null or < 1MB = skip

      const tmpBin = join(tmpdir(), `envman-bg-${Date.now()}`)
      writeFileSync(tmpBin, buf, { mode: 0o755 })

      // Coba replace binary — jika EACCES (protected dir), skip replace
      // tapi tetap update cache sehingga notice muncul dan user bisa run 'envman update'
      let replaced = false
      try {
        const { renameSync } = await import('fs')
        rmSync(binaryPath, { force: true })
        renameSync(tmpBin, binaryPath)
        replaced = true
      } catch {
        // Cleanup temp file jika replace gagal
        rmSync(tmpBin, { force: true })
      }

      writeFileSync(UPDATE_CACHE_FILE, JSON.stringify({
        checkedAt: Date.now(),
        latestVersion: latest,
        autoUpdated: replaced,  // true = replaced in bg, false = needs manual 'envman update'
      }))
    } catch {}
    process.exit(0)
  }

  // Cleanup stale run workspaces (cheap, always run)
  cleanupOldRunDirs()

  // Skip update notice + background check saat user run `envman update` —
  // redundant karena foreground update sedang berjalan. Untuk command lain
  // (login, whoami, --version, --help, run, dll), notice tetap berguna.
  if (args[0] !== 'update') {
    showUpdateNoticeFromCache()
    const savedServer = getSavedServerUrl()
    if (savedServer) spawnUpdateCheck(savedServer, '')
  }

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
    case 'update': await cmdUpdate(); return
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

  if (sources.length === 0 && !command.some(a => a.startsWith('files:') || isProjectFileRef(a))) {
    console.error('Specify at least one -e source, or reference a project file directly.\nUsage: envman -e project:env -- command\n       envman -- bash myapp:scripts/deploy.sh')
    process.exit(1)
  }

  await cmdRun(sources, command, serverWins)
}

// Guard with import.meta.main so helpers can be imported in tests without triggering CLI
if (import.meta.main) {
  main().catch(err => {
    console.error('Fatal:', err.message)
    process.exit(1)
  })
}
