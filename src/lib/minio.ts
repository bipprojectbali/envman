// MinIO client via Bun.S3Client (S3-compatible). Singleton lazy-init.
// Env vars: MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET

function buildEndpoint(raw: string): string {
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  return `https://${raw}`
}

function createClient(): InstanceType<typeof Bun.S3Client> | null {
  const endpoint = process.env.MINIO_ENDPOINT
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

export function getMinioClient(): InstanceType<typeof Bun.S3Client> | null {
  if (_client === undefined) _client = createClient()
  return _client
}

export function isMinioEnabled(): boolean {
  return getMinioClient() !== null
}

export function getMinioBucket(): string {
  return process.env.MINIO_BUCKET ?? ''
}
