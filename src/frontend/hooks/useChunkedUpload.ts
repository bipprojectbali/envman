// Hook untuk upload file besar via server-mediated S3 multipart.
// Dipakai oleh StorageUploadModal untuk file > MULTIPART_THRESHOLD.
//
// Flow: init → N × part → complete  (setiap part ≤ 50 MB → aman lewat Cloudflare)
// Cancel: AbortController — panggil abort() lalu kirim DELETE /multipart/abort ke MinIO.

import { useRef, useState } from 'react'

export const MULTIPART_THRESHOLD = 50 * 1024 * 1024  // 50 MB
const CHUNK_SIZE = 50 * 1024 * 1024

export interface ChunkedProgress {
  loaded: number
  total: number
  percent: number
  currentPart: number
  totalParts: number
  speedBps: number
  etaSec: number | null
}

interface InitResponse {
  uploadId: string
  minioKey: string
  path: string
  chunkSize: number
  totalParts: number
  error?: string
}

interface PartResponse {
  etag: string
  error?: string
}

interface CompleteResponse {
  ok: boolean
  object: { id: string; path: string; size: number; mimeType: string; isPublic: boolean; tags: string[]; description: string | null }
  error?: string
}

export interface ChunkedUploadResult {
  object: CompleteResponse['object']
}

export function useChunkedUpload(slug: string) {
  const [progress, setProgress] = useState<ChunkedProgress | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // Simpan session info untuk cleanup saat cancel
  const sessionRef = useRef<{ uploadId: string; minioKey: string } | null>(null)
  const startRef = useRef<number>(0)

  function computeProgress(loaded: number, total: number, part: number, totalParts: number): ChunkedProgress {
    const elapsed = (Date.now() - startRef.current) / 1000
    const speedBps = elapsed > 0.1 ? loaded / elapsed : 0
    const etaSec = speedBps > 0 && loaded < total ? (total - loaded) / speedBps : null
    return { loaded, total, percent: total > 0 ? Math.round((loaded / total) * 100) : 0, currentPart: part, totalParts, speedBps, etaSec }
  }

  async function upload(
    file: File,
    remotePath: string,
    opts?: { description?: string; tags?: string[] },
  ): Promise<ChunkedUploadResult> {
    const controller = new AbortController()
    abortRef.current = controller
    sessionRef.current = null
    setUploading(true)
    setError(null)
    setProgress(null)
    startRef.current = Date.now()

    try {
      // 1. Init — validasi quota + buat sesi multipart di MinIO
      const initRes = await fetch(`/api/envman/projects/${slug}/storage/multipart/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: remotePath, size: file.size, mimeType: file.type || 'application/octet-stream' }),
        credentials: 'include',
        signal: controller.signal,
      })
      const initJson: InitResponse = await initRes.json()
      if (!initRes.ok) throw new Error(initJson.error ?? `Init gagal (${initRes.status})`)

      const { uploadId, minioKey, totalParts } = initJson
      sessionRef.current = { uploadId, minioKey }

      const parts: { partNumber: number; etag: string }[] = []

      // 2. Upload per chunk — client → server → MinIO (setiap chunk ≤ 50 MB)
      for (let part = 1; part <= totalParts; part++) {
        const start = (part - 1) * CHUNK_SIZE
        const chunk = file.slice(start, Math.min(start + CHUNK_SIZE, file.size))

        setProgress(computeProgress(start, file.size, part, totalParts))

        const params = new URLSearchParams({ uploadId, minioKey, partNumber: String(part) })
        const partRes = await fetch(
          `/api/envman/projects/${slug}/storage/multipart/part?${params}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: chunk,
            credentials: 'include',
            signal: controller.signal,
          },
        )
        const partJson: PartResponse = await partRes.json()
        if (!partRes.ok) throw new Error(partJson.error ?? `Upload chunk ${part}/${totalParts} gagal (${partRes.status})`)
        parts.push({ partNumber: part, etag: partJson.etag })

        setProgress(computeProgress(Math.min(start + CHUNK_SIZE, file.size), file.size, part, totalParts))
      }

      // 3. Complete — MinIO gabungkan semua part, server daftarkan ke DB
      const completeRes = await fetch(`/api/envman/projects/${slug}/storage/multipart/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: remotePath, uploadId, minioKey, parts,
          size: file.size, mimeType: file.type || 'application/octet-stream',
          description: opts?.description, tags: opts?.tags,
        }),
        credentials: 'include',
        signal: controller.signal,
      })
      const completeJson: CompleteResponse = await completeRes.json()
      if (!completeRes.ok) throw new Error(completeJson.error ?? `Penyelesaian upload gagal (${completeRes.status})`)

      sessionRef.current = null
      return { object: completeJson.object }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        // Bersihkan sesi MinIO (best-effort)
        if (sessionRef.current) {
          void fetch(`/api/envman/projects/${slug}/storage/multipart/abort`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sessionRef.current),
            credentials: 'include',
          }).catch(() => { /* best-effort */ })
        }
        throw new Error('Upload dibatalkan')
      }
      const msg = (e as Error).message ?? 'Upload gagal'
      setError(msg)
      throw new Error(msg)
    } finally {
      setUploading(false)
      setProgress(null)
      abortRef.current = null
    }
  }

  function abort() {
    abortRef.current?.abort()
  }

  return { upload, abort, uploading, progress, error }
}
