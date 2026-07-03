// Bucket-level MinIO operations via raw S3 API (AWS Sig V4).
// Bun.S3Client tidak expose bucket management, jadi kita sign manual.
import { createHash, createHmac } from 'node:crypto'

const EMPTY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

function sha256hex(data: string): string {
  return createHash('sha256').update(data).digest('hex')
}

function hmac256(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest()
}

function buildAuthHeaders(
  method: string,
  url: URL,
  accessKey: string,
  secretKey: string,
  region: string,
): Record<string, string> {
  const now = new Date()
  // YYYYMMDDTHHMMSSZ — no separators
  const datetime = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const date = datetime.slice(0, 8)

  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': EMPTY_HASH,
    'x-amz-date': datetime,
  }

  const sortedEntries = Object.entries(headers).sort(([a], [b]) => a.localeCompare(b))
  const canonicalHeaders = sortedEntries.map(([k, v]) => `${k}:${v.trim()}`).join('\n') + '\n'
  const signedHeaders = sortedEntries.map(([k]) => k).join(';')

  const canonicalRequest = [method, url.pathname, '', canonicalHeaders, signedHeaders, EMPTY_HASH].join('\n')

  const scope = `${date}/${region}/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', datetime, scope, sha256hex(canonicalRequest)].join('\n')

  const sigKey = hmac256(hmac256(hmac256(hmac256(`AWS4${secretKey}`, date), region), 's3'), 'aws4_request')
  const signature = createHmac('sha256', sigKey).update(stringToSign).digest('hex')

  return {
    ...headers,
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  }
}

function getConfig(): { endpoint: string; accessKey: string; secretKey: string; bucket: string; region: string } | null {
  const raw = process.env.MINIO_ENDPOINT
  const accessKey = process.env.MINIO_ACCESS_KEY
  const secretKey = process.env.MINIO_SECRET_KEY
  const bucket = process.env.MINIO_BUCKET
  if (!raw || !accessKey || !secretKey || !bucket) return null
  const endpoint = (raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`).replace(/\/$/, '')
  return { endpoint, accessKey, secretKey, bucket, region: process.env.MINIO_REGION ?? 'us-east-1' }
}

export type BucketStatus = 'exists' | 'not_found' | 'error' | 'not_configured'

/** Cek apakah bucket sudah ada via HEAD /bucket. */
export async function checkBucketExists(): Promise<{ status: BucketStatus; detail?: string }> {
  const cfg = getConfig()
  if (!cfg) return { status: 'not_configured' }

  const url = new URL(`/${cfg.bucket}`, cfg.endpoint)
  const headers = buildAuthHeaders('HEAD', url, cfg.accessKey, cfg.secretKey, cfg.region)

  try {
    const res = await fetch(url.toString(), { method: 'HEAD', headers })
    // 200 = exists, 403 = exists tapi no-list-perm (creds salah atau ACL), 404 = belum ada
    if (res.status === 200 || res.status === 403) return { status: 'exists' }
    if (res.status === 404) return { status: 'not_found' }
    return { status: 'error', detail: `HTTP ${res.status}` }
  } catch (e) {
    return { status: 'error', detail: (e as Error).message }
  }
}

/** Buat bucket via PUT /bucket. Idempotent — sudah ada (409) dianggap sukses. */
export async function createBucket(): Promise<void> {
  const cfg = getConfig()
  if (!cfg) throw new Error('MinIO tidak dikonfigurasi')

  const url = new URL(`/${cfg.bucket}`, cfg.endpoint)
  const headers = buildAuthHeaders('PUT', url, cfg.accessKey, cfg.secretKey, cfg.region)

  const res = await fetch(url.toString(), { method: 'PUT', headers, body: '' })
  if (res.ok || res.status === 409) return
  const body = await res.text()
  throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`)
}

/** Check + auto-create jika belum ada. */
export async function ensureBucket(): Promise<{
  created: boolean
  alreadyExisted: boolean
  notConfigured: boolean
  error?: string
}> {
  const check = await checkBucketExists()
  if (check.status === 'not_configured') return { created: false, alreadyExisted: false, notConfigured: true }
  if (check.status === 'exists') return { created: false, alreadyExisted: true, notConfigured: false }
  if (check.status === 'error') return { created: false, alreadyExisted: false, notConfigured: false, error: check.detail }

  try {
    await createBucket()
    return { created: true, alreadyExisted: false, notConfigured: false }
  } catch (e) {
    return { created: false, alreadyExisted: false, notConfigured: false, error: (e as Error).message }
  }
}
