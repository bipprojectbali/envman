import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGO = 'aes-256-gcm'
const PREFIX = 'enc:'

function getMasterKey(): Buffer | null {
  const raw = process.env.MASTER_KEY ?? ''
  if (!raw) return null
  const buf = Buffer.from(raw, 'hex')
  if (buf.length !== 32) {
    console.error('[crypto] MASTER_KEY must be 32 bytes (64 hex chars) — secrets stored as plaintext')
    return null
  }
  return buf
}

export function encryptSecret(value: string): string {
  const key = getMasterKey()
  if (!key) return value
  const iv = randomBytes(12) // 96-bit IV recommended for GCM
  const cipher = createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('hex')}:${encrypted.toString('hex')}:${tag.toString('hex')}`
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored // plaintext, not yet encrypted
  const key = getMasterKey()
  if (!key) return stored // can't decrypt — return raw (won't be human-readable)
  try {
    const [ivHex, encHex, tagHex] = stored.slice(PREFIX.length).split(':')
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8')
  } catch {
    return '[decryption failed]'
  }
}

export const isEncrypted = (v: string) => v.startsWith(PREFIX)
export const hasMasterKey = () => getMasterKey() !== null
