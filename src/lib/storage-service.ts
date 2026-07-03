import { getMinioClient } from './minio'
import { getSettingNumber } from './app-settings'

export const STORAGE_MAX_FILE_MB_DEFAULT = 50
export const STORAGE_QUOTA_MB_DEFAULT = 500

// ─── Path sanitization ─────────────────────────────────────────────────────

/** Kembalikan path yang sudah dibersihkan, atau null jika tidak valid. */
export function sanitizePath(raw: string): string | null {
  const parts = raw.replace(/\\/g, '/').split('/').filter(Boolean)
  // Tolak traversal, hidden files (".env"), atau segmen kosong
  if (parts.some((p) => p === '..' || p === '.')) return null
  if (parts.length === 0 || parts.length > 10) return null
  const clean = parts.join('/')
  if (clean.length > 500) return null
  // Hanya izinkan karakter aman: alfanumerik, dash, underscore, titik, spasi
  if (!/^[\w\-. /]+$/.test(clean)) return null
  return clean
}

// ─── Quota ─────────────────────────────────────────────────────────────────

export async function getQuotaBytes(projectQuotaMb: number | null): Promise<number> {
  const defaultMb = await getSettingNumber('storage_default_quota_mb', STORAGE_QUOTA_MB_DEFAULT)
  return (projectQuotaMb ?? defaultMb) * 1024 * 1024
}

export async function getMaxFileSizeBytes(): Promise<number> {
  const maxMb = await getSettingNumber('storage_max_file_mb', STORAGE_MAX_FILE_MB_DEFAULT)
  return maxMb * 1024 * 1024
}

/** Ambil total size bytes yang sudah terpakai project (fresh dari DB). */
export async function getUsedBytes(projectId: string): Promise<number> {
  const { prisma } = await import('./db')
  const agg = await prisma.projectStorageObject.aggregate({
    where: { projectId },
    _sum: { size: true },
  })
  return agg._sum.size ?? 0
}

// ─── MinIO operations ──────────────────────────────────────────────────────

/** Upload buffer ke MinIO. Throw jika client tidak dikonfigurasi. */
export async function minioUpload(
  minioKey: string,
  data: Buffer | Uint8Array,
  mimeType: string,
): Promise<void> {
  const client = getMinioClient()
  if (!client) throw new Error('MinIO tidak dikonfigurasi')
  await client.write(minioKey, data, { type: mimeType })
}

/** Hapus satu object dari MinIO. Silent jika tidak ada. */
export async function minioDelete(minioKey: string): Promise<void> {
  const client = getMinioClient()
  if (!client) return
  try {
    await client.delete(minioKey)
  } catch {
    // silent: object mungkin sudah tidak ada
  }
}

/** Hapus semua storage objects milik sebuah project dari MinIO (batch). */
export async function minioDeleteProject(projectId: string): Promise<void> {
  const client = getMinioClient()
  if (!client) return
  const { prisma } = await import('./db')
  const objects = await prisma.projectStorageObject.findMany({
    where: { projectId },
    select: { minioKey: true },
  })
  await Promise.allSettled(objects.map((o) => client.delete(o.minioKey)))
}

/**
 * Generate presigned GET URL dari MinIO.
 * Public files: TTL 1 jam, force attachment untuk cegah MIME sniffing.
 * Private files: TTL 5 menit.
 */
export function minioPresign(
  minioKey: string,
  filename: string,
  isPublic: boolean,
): string {
  const client = getMinioClient()
  if (!client) throw new Error('MinIO tidak dikonfigurasi')
  const expiresIn = isPublic ? 3600 : 300
  return client.presign(minioKey, {
    expiresIn,
    method: 'GET',
    // Force download agar browser tidak render file berbahaya (JS, HTML, SVG)
    contentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
  })
}

/** Build MinIO key dari projectId + path. */
export function buildMinioKey(projectId: string, path: string): string {
  return `${projectId}/${path}`
}
