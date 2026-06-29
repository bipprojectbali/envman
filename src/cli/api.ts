import { cacheFileFor, pruneIfNeeded, readCache, writeCache } from './response-cache'
import type { Config } from './auth-resolver'

export function handleApiError(status: number, body: any): never {
  if (status === 403 && Array.isArray(body?.deniedEnvs) && body.deniedEnvs.length > 0) {
    const list = body.deniedEnvs.map((d: { project: string; env: string }) => `${d.project}:${d.env}`).join(', ')
    console.error(`[envman] Akses ditolak untuk env: ${list}`)
    console.error('         Hubungi project owner untuk mendapatkan akses.')
    process.exit(1)
  }
  console.error(`Error ${status}: ${body?.error ?? JSON.stringify(body)}`)
  process.exit(1)
}

// opts.cache: opt-in conditional cache (If-None-Match → 304 → body dari disk).
// HANYA untuk endpoint baca konten yang aman (files/resolve, aliases/resolve).
// JANGAN aktifkan untuk vars/session (CLAUDE.md: jangan cache env vars).
export async function apiFetch(cfg: Config, path: string, opts?: { cache?: boolean }): Promise<any> {
  const url = `${cfg.server.replace(/\/$/, '')}${path}`
  const headers: Record<string, string> = { Authorization: `Bearer ${cfg.token}` }

  if (!opts?.cache) {
    const res = await fetch(url, { headers })
    const body = await res.json()
    if (!res.ok) handleApiError(res.status, body)
    return body
  }

  const file = cacheFileFor(cfg.server, path)
  const cached = readCache(file)
  if (cached) headers['If-None-Match'] = cached.etag

  const res = await fetch(url, { headers })

  if (res.status === 304) {
    // Konten tak berubah. Jika cache hilang (race), fallback re-fetch tanpa conditional.
    if (cached) return JSON.parse(cached.body)
    return apiFetch(cfg, path)
  }

  const text = await res.text()
  if (!res.ok) {
    let parsed: any
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = { error: text }
    }
    handleApiError(res.status, parsed)
  }

  const etag = res.headers.get('etag')
  if (etag) {
    try {
      writeCache(file, etag, text)
      pruneIfNeeded()
    } catch {
      // Cache write best-effort: kegagalan disk (read-only FS, kuota) tidak boleh
      // menggagalkan command — response sudah didapat, lanjut tanpa cache.
    }
  }
  return JSON.parse(text)
}
