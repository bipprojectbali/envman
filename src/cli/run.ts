import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { apiFetch } from './api'
import { resolveAuth } from './auth-resolver'
import { parseEnvFile } from './env-parser'

// Disambiguate project:env vs project:path/file.ext in command args.
// Contains "/" after colon → path ref; has extension after colon → file ref.
export function isProjectFileRef(arg: string): boolean {
  if (!arg.includes(':')) return false
  const after = arg.slice(arg.indexOf(':') + 1)
  if (!after) return false
  return after.includes('/') || /\.[a-zA-Z0-9]+$/.test(after)
}

const NODE_BUILTINS = new Set([
  'fs', 'path', 'os', 'http', 'https', 'crypto', 'child_process', 'util', 'stream',
  'events', 'url', 'querystring', 'buffer', 'process', 'zlib', 'net', 'dns', 'tls',
  'cluster', 'worker_threads', 'readline', 'assert', 'console', 'timers',
  'string_decoder', 'punycode', 'vm', 'v8', 'perf_hooks',
])

// Detect bare-name imports (not relative, not built-in, not bun:/node: prefix).
// Used to decide whether to enable Bun --install=auto for piped scripts.
export function detectsNpmImports(content: string): boolean {
  const patterns = [
    /^\s*import\s+(?:[^'"]+?\s+from\s+)?["']([^"']+)["']/gm,
    /\brequire\s*\(\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']/g,
  ]
  for (const re of patterns) {
    for (const match of content.matchAll(re)) {
      const spec = match[1]
      if (!spec) continue
      if (spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/')) continue
      if (spec.startsWith('bun:') || spec.startsWith('node:')) continue
      if (NODE_BUILTINS.has(spec)) continue
      return true
    }
  }
  return false
}

function buildStdinCommand(cmd: string[], opts: { bunAutoInstall?: boolean } = {}): string[] | null {
  const name = basename(cmd[0])
  const rest = cmd.slice(1)
  switch (name) {
    case 'bash':
    case 'sh':
    case 'zsh':
      return [cmd[0], '-s', ...rest]
    case 'bun': {
      // --install=fallback: install missing packages ke global cache, bekerja
      // bahkan kalau ada node_modules di walk-up. Tidak pollute local node_modules
      // karena Bun resolve dari global cache untuk package yang missing.
      const installFlag = opts.bunAutoInstall ? ['--install=fallback'] : []
      if (rest[0] === 'run') return [cmd[0], ...installFlag, 'run', '-', ...rest.slice(1)]
      return [cmd[0], ...installFlag, 'run', '-', ...rest]
    }
    case 'node':
      return [cmd[0], ...rest]
    case 'python3':
    case 'python':
      return [cmd[0], '-', ...rest]
    case 'deno':
      return [cmd[0], 'run', '-', ...rest]
    default:
      return null
  }
}

export async function cmdRun(sources: string[], command: string[], serverWins: boolean, projectSlugHint = '') {
  if (command.length === 0) {
    console.error('No command specified after --')
    process.exit(1)
  }

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
  const merged: Record<string, string> = {}
  for (const src of sources) {
    if (src.startsWith('files:')) continue
    if (src.includes(':')) {
      const [project, env] = src.split(':')
      if (!env) {
        console.error(`Invalid format: '${src}' — expected project:env`)
        process.exit(1)
      }
      const data = await apiFetch(cfg, `/api/envman/projects/${project}/environments/${env}/vars/export`)
      Object.assign(merged, data.vars)
    } else {
      const fileVars = parseEnvFile(src)
      const { ENVMAN_SERVER: _s, ENVMAN_TOKEN: _t, ...rest } = fileVars
      Object.assign(merged, rest)
    }
  }

  // Step 4: Final merge with process.env
  const finalEnv = serverWins ? { ...merged, ...process.env } : { ...process.env, ...merged }

  // Step 5: Resolve file reference in command args (zero disk write via stdin)
  // Supports two syntaxes:
  //   files:prefix[/filename]          — explicit prefix (project inferred from -e source)
  //   files:slug/prefix[/filename]     — explicit slug + prefix
  //   project:prefix/filename.ext      — new: slug:path, disambiguated by "/" or extension
  //   project:file.ext                 — new: slug:file, disambiguated by extension
  let fileContent: string | null = null
  let resolvedFilename = ''
  const transformedCommand = [...command]
  const fileArgIdx = transformedCommand.findIndex((a) => a.startsWith('files:') || isProjectFileRef(a))

  if (fileArgIdx !== -1) {
    const fileRef = transformedCommand[fileArgIdx]
    transformedCommand.splice(fileArgIdx, 1)

    let slug: string
    let prefix: string

    if (fileRef.startsWith('files:')) {
      // Legacy files: syntax
      const refBody = fileRef.slice(6)
      const parts = refBody.split('/')
      const inferredSlug =
        sources.find((s) => s.includes(':') && !s.startsWith('files:'))?.split(':')[0] ?? projectSlugHint
      if (parts.length >= 3) {
        slug = parts[0]
        prefix = parts[1]
        resolvedFilename = parts.slice(2).join('/')
      } else if (parts.length === 2) {
        slug = inferredSlug
        prefix = parts[0]
        resolvedFilename = parts[1]
      } else {
        slug = inferredSlug
        prefix = parts[0]
        resolvedFilename = ''
      }
    } else {
      // New project:path syntax — slug is always explicit (before colon)
      const colonIdx = fileRef.indexOf(':')
      slug = fileRef.slice(0, colonIdx)
      const filePath = fileRef.slice(colonIdx + 1)
      const parts = filePath.split('/')
      if (parts.length >= 2) {
        prefix = parts[0]
        resolvedFilename = parts.slice(1).join('/')
      } else {
        prefix = filePath
        resolvedFilename = ''
      }
    }

    if (!slug) {
      console.error(
        `[envman] Cannot infer project slug for "${fileRef}". Use project:path/file.ext syntax or add -e project:env.`,
      )
      process.exit(1)
    }

    const qs = resolvedFilename
      ? `prefix=${encodeURIComponent(prefix)}&filename=${encodeURIComponent(resolvedFilename)}`
      : `prefix=${encodeURIComponent(prefix)}`
    const data = await apiFetch(cfg, `/api/envman/projects/${slug}/files/resolve?${qs}`, { cache: true })
    fileContent = data.content
    if (!resolvedFilename) resolvedFilename = data.filename
  }

  // Step 6: Spawn
  if (fileContent !== null) {
    const interpreterName = basename(transformedCommand[0])
    const isBun = interpreterName === 'bun'
    const hasNpmImports = isBun && detectsNpmImports(fileContent)

    const stdinCmd = buildStdinCommand(transformedCommand, { bunAutoInstall: hasNpmImports })
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
      const cleanup = () => {
        try {
          rmSync(tmpDir, { recursive: true, force: true })
        } catch {}
      }
      process.on('exit', cleanup)
      const result = spawnSync(transformedCommand[0], [tmpFile, ...transformedCommand.slice(1)], {
        env: finalEnv,
        stdio: 'inherit',
        shell: false,
      })
      cleanup()
      process.exit(result.status ?? 0)
    }
  } else {
    const result = spawnSync(command[0], command.slice(1), {
      env: finalEnv,
      stdio: 'inherit',
      shell: false,
    })
    process.exit(result.status ?? 0)
  }
}

export async function cmdAlias(args: string[]) {
  const extraSources: string[] = []
  const passthroughArgs: string[] = []
  let ref = ''
  let extraServerWins = false
  let refFound = false
  let i = 0
  while (i < args.length) {
    const a = args[i]
    if (refFound) {
      passthroughArgs.push(a)
      i++
    } else if (a === '-e') {
      const val = args[i + 1]
      if (!val) {
        console.error('-e requires a value')
        process.exit(1)
      }
      extraSources.push(val)
      i += 2
    } else if (a === '--server-wins') {
      extraServerWins = true
      i++
    } else if (!a.startsWith('-')) {
      ref = a
      refFound = true
      i++
    } else {
      console.error(`Unknown flag: ${a}\nUsage: envman run [-e <source>]... <project>:<alias> [args...]`)
      process.exit(1)
    }
  }

  if (!ref?.includes(':')) {
    console.error('Usage: envman run [-e <source>]... <project>:<alias>')
    process.exit(1)
  }

  const cfg = resolveAuth({})
  const data = await apiFetch(cfg, `/api/envman/aliases/resolve/${encodeURIComponent(ref)}`, { cache: true })
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

  const storedSources: string[] = []
  let storedServerWins = false
  let j = 0
  while (j < flagParts.length) {
    const flag = flagParts[j]
    if (flag === '-e') {
      const val = flagParts[j + 1]
      if (!val) {
        console.error('-e requires a value')
        process.exit(1)
      }
      storedSources.push(val)
      j += 2
    } else if (flag === '--server-wins') {
      storedServerWins = true
      j++
    } else {
      console.error(`Unknown flag in alias: ${flag}`)
      process.exit(1)
    }
  }

  // Extra sources (command line) go first; stored sources override them.
  const mergedSources = [...extraSources, ...storedSources]
  const aliasProject = ref.split(':')[0]
  await cmdRun(mergedSources, [...command, ...passthroughArgs], extraServerWins || storedServerWins, aliasProject)
}
