// MinIO client via Bun.S3Client (S3-compatible). Singleton lazy-init.
// Env vars: MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET
// Optional: MINIO_PRESIGN_BASE_URL — endpoint alternatif untuk presigned URL
//   (gunakan URL direct ke MinIO yang tidak lewat Cloudflare/reverse proxy)
//   Jika tidak diset, presigned URL memakai MINIO_ENDPOINT (default lama).

function buildEndpoint(raw: string): string {
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  return `https://${raw}`
}

function createClient(endpointEnv = 'MINIO_ENDPOINT'): InstanceType<typeof Bun.S3Client> | null {
  const endpoint = process.env[endpointEnv] ?? process.env.MINIO_ENDPOINT
  const accessKey = process.env.MINIO_ACCESS_KEY
  const secretKey = process.env.MINIO_SECRET_KEY
  const bucket = process.env.MINIO_BUCKET
  if (!endpoint || !accessKey || !secretKey || !bucket) return null
  return new Bun.S3Client({
    endpoint: buildEndpoint(endpoint),
    accessKeyId: accessKey,
    secretAccessKey: secretKey,
    bucket,
  })
}

let _client: InstanceType<typeof Bun.S3Client> | null | undefined = undefined
let _presignClient: InstanceType<typeof Bun.S3Client> | null | undefined = undefined

/** Client untuk operasi server-side (read/write/delete ke MinIO). */
export function getMinioClient(): InstanceType<typeof Bun.S3Client> | null {
  if (_client === undefined) _client = createClient('MINIO_ENDPOINT')
  return _client
}

/**
 * Client khusus untuk menghasilkan presigned URL yang akan dipakai CLI.
 * Jika MINIO_PRESIGN_BASE_URL diset, presigned URL mengarah ke URL itu
 * (bypass Cloudflare / reverse proxy) sehingga upload besar tidak terpotong.
 * Fallback ke client biasa jika env var tidak diset.
 */
export function getMinioPresignClient(): InstanceType<typeof Bun.S3Client> | null {
  if (_presignClient === undefined) {
    _presignClient = process.env.MINIO_PRESIGN_BASE_URL
      ? createClient('MINIO_PRESIGN_BASE_URL')
      : getMinioClient()
  }
  return _presignClient
}

export function isMinioEnabled(): boolean {
  return getMinioClient() !== null
}

export function getMinioBucket(): string {
  return process.env.MINIO_BUCKET ?? ''
}
