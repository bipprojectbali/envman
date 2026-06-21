import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Disk cache untuk conditional request CLI (If-None-Match → 304 → serve dari cache).
// Body bisa berisi konten file project → diperlakukan sebagai data sensitif (mode 0600).
// Pure-ish module: path bisa di-override agar unit-testable tanpa menyentuh ~/.config.

const DEFAULT_CACHE_DIR = join(homedir(), '.config', 'envman', 'cache')
const MAX_ENTRIES = 200

export interface CacheEntry {
  etag: string
  body: string
}

function keyFor(server: string, path: string): string {
  return createHash('sha256').update(`${server}\n${path}`).digest('base64url')
}

export function cacheFileFor(server: string, path: string, dir: string = DEFAULT_CACHE_DIR): string {
  return join(dir, `${keyFor(server, path)}.json`)
}

export function readCache(file: string): CacheEntry | null {
  try {
    if (!existsSync(file)) return null
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (typeof parsed?.etag === 'string' && typeof parsed?.body === 'string') {
      return { etag: parsed.etag, body: parsed.body }
    }
    return null
  } catch {
    return null
  }
}

export function writeCache(file: string, etag: string, body: string): void {
  const dir = join(file, '..')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify({ etag, body }), { mode: 0o600 })
  renameSync(tmp, file)
}

// Batasi pertumbuhan: kalau melebihi MAX_ENTRIES, hapus entri tertua (by mtime).
export function pruneIfNeeded(dir: string = DEFAULT_CACHE_DIR, max: number = MAX_ENTRIES): void {
  try {
    if (!existsSync(dir)) return
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
    if (files.length <= max) return
    const sorted = files
      .map((f) => {
        const full = join(dir, f)
        return { full, mtime: Bun.file(full).lastModified }
      })
      .sort((a, b) => a.mtime - b.mtime)
    for (const { full } of sorted.slice(0, files.length - max)) {
      rmSync(full, { force: true })
    }
  } catch {
    // Prune best-effort: housekeeping cache tidak boleh memunculkan error ke user.
  }
}
