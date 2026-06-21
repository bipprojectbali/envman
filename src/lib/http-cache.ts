import { createHash } from 'node:crypto'

// Conditional HTTP caching (RFC 9110) — validator generation + revalidation.
// Helper murni: tidak menyentuh Prisma/Elysia agar reusable & unit-testable.

export interface ConditionalResult {
  notModified: boolean
  headers: Record<string, string>
}

function hash(input: string): string {
  return createHash('sha256').update(input).digest('base64url')
}

// Strong validator dari konten penuh (mis. raw file).
export function strongEtag(content: string): string {
  return `"${hash(content)}"`
}

// Weak validator dari identitas + waktu ubah (mis. resource JSON).
export function weakEtag(parts: string): string {
  return `W/"${hash(parts)}"`
}

function normalizeEtag(tag: string): string {
  return tag.trim().replace(/^W\//, '')
}

function ifNoneMatchHits(header: string, etag: string): boolean {
  const candidates = header.split(',').map((t) => t.trim())
  if (candidates.includes('*')) return true
  const target = normalizeEtag(etag)
  return candidates.some((c) => normalizeEtag(c) === target)
}

// Evaluasi conditional request + bangun header validator untuk response.
// Default Cache-Control: private, no-cache → klien wajib revalidasi via validator,
// tidak pernah menyajikan stale tanpa cek (resource bisa private/per-user).
// Override `cacheControl` untuk resource publik non-sensitif (mis. docs).
// `lastModified` opsional: resource tanpa timestamp bermakna (mis. konten
// statis-deterministik) divalidasi via ETag saja, tanpa Last-Modified.
export function conditional(
  request: Request,
  opts: { etag: string; lastModified?: Date; cacheControl?: string },
): ConditionalResult {
  const headers: Record<string, string> = {
    ETag: opts.etag,
    'Cache-Control': opts.cacheControl ?? 'private, no-cache',
  }
  if (opts.lastModified) {
    headers['Last-Modified'] = opts.lastModified.toUTCString()
  }

  const inm = request.headers.get('if-none-match')
  if (inm) {
    return { notModified: ifNoneMatchHits(inm, opts.etag), headers }
  }

  // If-Modified-Since hanya dipertimbangkan saat tidak ada If-None-Match (RFC 9110 §13.1.3).
  const ims = request.headers.get('if-modified-since')
  if (ims && opts.lastModified) {
    const since = Date.parse(ims)
    if (!Number.isNaN(since)) {
      // Bandingkan dalam detik (HTTP-date tidak punya milidetik).
      const modified = Math.floor(opts.lastModified.getTime() / 1000)
      const sinceSec = Math.floor(since / 1000)
      return { notModified: modified <= sinceSec, headers }
    }
  }

  return { notModified: false, headers }
}

export function notModifiedResponse(headers: Record<string, string>): Response {
  return new Response(null, { status: 304, headers })
}
