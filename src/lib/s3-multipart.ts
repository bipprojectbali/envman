// S3 Multipart Upload — AWS SigV4 implementation untuk MinIO.
// Bun.S3Client tidak expose API multipart (createMultipartUpload, uploadPart).
// Implementasi langsung via HTTP + HMAC-SHA256 tanpa npm package tambahan.
//
// Env vars: MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET
// Optional: MINIO_REGION (default "us-east-1"), MINIO_PRESIGN_BASE_URL

import { createHash, createHmac } from 'crypto'

// 50 MB per chunk — di bawah Cloudflare 100 MB hard limit (free/pro).
export const MULTIPART_CHUNK_SIZE = 50 * 1024 * 1024

const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

// ─── Config ────────────────────────────────────────────────────────────────

function getS3Config() {
  const raw = process.env.MINIO_ENDPOINT ?? ''
  const accessKey = process.env.MINIO_ACCESS_KEY ?? ''
  const secretKey = process.env.MINIO_SECRET_KEY ?? ''
  const bucket = process.env.MINIO_BUCKET ?? ''
  const region = process.env.MINIO_REGION ?? 'us-east-1'
  if (!raw || !accessKey || !secretKey || !bucket) throw new Error('MinIO tidak dikonfigurasi')
  const endpoint = raw.startsWith('http') ? raw : `https://${raw}`
  return { endpoint, accessKey, secretKey, bucket, region }
}

// ─── SigV4 helpers ─────────────────────────────────────────────────────────

function sha256hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest()
}

function signingKey(secretKey: string, dateStamp: string, region: string): Buffer {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp)
  const kRegion = hmac(kDate, region)
  const kService = hmac(kRegion, 's3')
  return hmac(kService, 'aws4_request')
}

function utcNow(): { datetime: string; date: string } {
  const d = new Date()
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  const datetime =
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  return { datetime, date: datetime.slice(0, 8) }
}

// ─── HTTP request helper ────────────────────────────────────────────────────

async function s3Fetch(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  key: string,
  query: Record<string, string> = {},
  body?: Uint8Array,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; text: string; headers: Headers }> {
  const cfg = getS3Config()
  const { datetime, date } = utcNow()

  // Path-style URL: {endpoint}/{bucket}/{key}
  const u = new URL(cfg.endpoint)
  const host = u.host
  const encodedKey = key.split('/').map((s) => encodeURIComponent(s)).join('/')
  const path = `/${cfg.bucket}/${encodedKey}`

  const sortedQuery = Object.entries(query)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

  const bodyBuf = body ? Buffer.from(body) : undefined
  const bodyHash = bodyBuf ? sha256hex(bodyBuf) : EMPTY_SHA256

  const headersForSign: Record<string, string> = {
    host,
    'x-amz-content-sha256': bodyHash,
    'x-amz-date': datetime,
    ...extraHeaders,
  }

  const sortedKeys = Object.keys(headersForSign).sort()
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${headersForSign[k].trim()}`).join('\n') + '\n'
  const signedHeaders = sortedKeys.join(';')

  const canonical = [method, path, sortedQuery, canonicalHeaders, signedHeaders, bodyHash].join('\n')
  const scope = `${date}/${cfg.region}/s3/aws4_request`
  const toSign = `AWS4-HMAC-SHA256\n${datetime}\n${scope}\n${sha256hex(canonical)}`
  const sig = createHmac('sha256', signingKey(cfg.secretKey, date, cfg.region)).update(toSign).digest('hex')

  const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`

  const fetchHeaders: Record<string, string> = {
    ...headersForSign,
    Authorization: authorization,
  }
  if (bodyBuf) fetchHeaders['content-length'] = String(bodyBuf.length)

  const fullUrl = `${u.protocol}//${host}${path}${sortedQuery ? `?${sortedQuery}` : ''}`
  // Bun fetch accepts Uint8Array as body
  const res = await fetch(fullUrl, { method, headers: fetchHeaders, body: body as unknown as BodyInit ?? undefined })
  const text = await res.text()
  return { status: res.status, text, headers: res.headers }
}

// ─── Multipart ops ─────────────────────────────────────────────────────────

/** Mulai sesi multipart upload — kembalikan uploadId. */
export async function createMultipartUpload(key: string, mimeType: string): Promise<string> {
  const res = await s3Fetch('POST', key, { uploads: '' }, undefined, { 'content-type': mimeType })
  if (res.status !== 200)
    throw new Error(`CreateMultipartUpload gagal (${res.status}): ${res.text.slice(0, 300)}`)
  const m = res.text.match(/<UploadId>(.+?)<\/UploadId>/)
  if (!m) throw new Error('UploadId tidak ditemukan di response MinIO')
  return m[1]
}

/** Upload satu chunk — kembalikan ETag (tanpa tanda kutip). */
export async function uploadPart(
  key: string,
  uploadId: string,
  partNumber: number,
  chunk: Uint8Array,
): Promise<string> {
  const res = await s3Fetch('PUT', key, { partNumber: String(partNumber), uploadId }, chunk)
  if (res.status !== 200)
    throw new Error(`UploadPart ${partNumber} gagal (${res.status}): ${res.text.slice(0, 300)}`)
  const etag = res.headers.get('etag')
  if (!etag) throw new Error(`ETag tidak ada di response part ${partNumber}`)
  return etag.replace(/"/g, '')
}

/** Selesaikan multipart upload — MinIO akan menggabungkan semua part. */
export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
): Promise<void> {
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUpload>' +
    parts.map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>"${p.etag}"</ETag></Part>`).join('') +
    '</CompleteMultipartUpload>'
  const body = new TextEncoder().encode(xml)
  const res = await s3Fetch('POST', key, { uploadId }, body, { 'content-type': 'application/xml' })
  if (res.status !== 200)
    throw new Error(`CompleteMultipartUpload gagal (${res.status}): ${res.text.slice(0, 300)}`)
}

/** Batalkan multipart upload — bersihkan part yang sudah terupload. */
export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  // Best-effort — tidak throw jika sudah expired atau tidak ada
  try {
    await s3Fetch('DELETE', key, { uploadId })
  } catch {
    /* ignored */
  }
}
