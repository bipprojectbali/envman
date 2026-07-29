import { createHash, randomBytes } from 'node:crypto'
import { getSettingNumber } from './app-settings'
import { prisma } from './db'

// Shared logic for user-to-user transfers (envman send / inbox / recv).
// Routes stay thin; anything worth unit-reasoning about lives here.

// Text is stored hex-encoded in a DB column and arrives as a JSON body, so it
// costs roughly 2x on disk and ~2.7x in memory. 1 MB covers .env files, SSH
// keys, certificate bundles and kubeconfigs; anything larger belongs on the
// file path, where the bytes never touch the server.
export const DEFAULT_MAX_TEXT_KB = 1024
export const DEFAULT_MAX_FILE_MB = 100
export const DEFAULT_MAX_TTL_HOURS = 168 // 7 days
export const DEFAULT_TTL_HOURS = 72 // 3 days
export const DEFAULT_MAX_PENDING = 20

// Download URLs must outlive the sweep's grace period (2h) minus the time a
// claim spends in flight, or a large download could be cut off mid-transfer.
export const DOWNLOAD_URL_TTL_SECONDS = 3600

// Crockford base32: no I, L, O or U. Removes the 0/O and 1/I/L transcription
// traps, which matters because this code gets read aloud or retyped.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_LEN = 16

/** Generates a claim code with ~80 bits of entropy, formatted EM-XXXX-XXXX-XXXX-XXXX. */
export function generateCode(): { code: string; formatted: string; hash: string; prefix: string } {
  const bytes = randomBytes(CODE_LEN)
  let code = ''
  for (let i = 0; i < CODE_LEN; i++) code += ALPHABET[bytes[i] % ALPHABET.length]
  return { code, formatted: formatCode(code), hash: hashCode(code), prefix: code.slice(0, 4) }
}

/** Renders a bare code as EM-XXXX-XXXX-XXXX-XXXX for display. */
export function formatCode(code: string): string {
  return `EM-${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}-${code.slice(12, 16)}`
}

/**
 * Normalizes user input to the canonical 16-char code, or null if it cannot be
 * one. Accepts lowercase, dashes/spaces, and the ambiguous glyphs the alphabet
 * excludes (I/L read as 1, O as 0).
 */
export function normalizeCode(raw: string): string | null {
  const cleaned = raw
    .toUpperCase()
    .replace(/^EM[-\s]*/, '')
    .replace(/[-\s]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
  if (cleaned.length !== CODE_LEN) return null
  for (const ch of cleaned) if (!ALPHABET.includes(ch)) return null
  return cleaned
}

/**
 * Hashes a claim code for storage. Plain SHA-256 rather than bcrypt on purpose:
 * the code already carries ~80 bits of entropy, so stretching buys nothing,
 * and an indexed unique column gives the claim path an O(1) lookup.
 */
export function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

export type RecipientResult =
  | { ok: true; user: { id: string; email: string; name: string } }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'ambiguous'; candidates: string[] }

/**
 * Resolves a send target from an exact email or an exact name.
 *
 * Deliberately NOT fuzzy: GET /api/envman/users?q= fuzzy-matches for a picker
 * where a human confirms the choice, but here one typo would deliver a
 * production .env to the wrong person. Blocked and soft-deleted accounts are
 * treated as not found, so this cannot be used to probe account state.
 */
export async function resolveRecipient(identifier: string): Promise<RecipientResult> {
  const id = identifier.trim()
  if (!id) return { ok: false, reason: 'not_found' }

  const select = { id: true, email: true, name: true }
  const active = { blocked: false, deletedAt: null }

  if (id.includes('@')) {
    const user = await prisma.user.findFirst({ where: { email: id.toLowerCase(), ...active }, select })
    return user ? { ok: true, user } : { ok: false, reason: 'not_found' }
  }

  // `name` is not unique in the schema, so ambiguity is a real outcome.
  const matches = await prisma.user.findMany({ where: { name: id, ...active }, select, take: 3 })
  if (matches.length === 0) return { ok: false, reason: 'not_found' }
  if (matches.length > 1) return { ok: false, reason: 'ambiguous', candidates: matches.map((m) => m.email) }
  return { ok: true, user: matches[0] }
}

/** Resolves the effective TTL in ms, clamped to the configured maximum. */
export async function resolveTtlMs(requestedHours?: number): Promise<number> {
  const maxHours = await getSettingNumber('transfer_max_ttl_hours', DEFAULT_MAX_TTL_HOURS)
  const defaultHours = await getSettingNumber('transfer_default_ttl_hours', DEFAULT_TTL_HOURS)
  let hours = typeof requestedHours === 'number' && requestedHours > 0 ? requestedHours : defaultHours
  if (hours > maxHours) hours = maxHours
  return Math.floor(hours * 60 * 60 * 1000)
}

/** Max text payload in bytes. */
export async function maxTextBytes(): Promise<number> {
  const kb = await getSettingNumber('transfer_max_text_kb', DEFAULT_MAX_TEXT_KB)
  return kb * 1024
}

/** Max file payload in bytes (MinIO path — never buffered by the server). */
export async function maxFileBytes(): Promise<number> {
  const mb = await getSettingNumber('transfer_max_file_mb', DEFAULT_MAX_FILE_MB)
  return mb * 1024 * 1024
}

/**
 * Strips any directory part and rejects anything that could escape the
 * transfer's own key prefix. A transfer is exactly one file, never a tree, so
 * `envman send ./deep/dir/x.sql` must not produce a nested key.
 */
export function safeFilename(raw: string): string | null {
  const base = raw.split('/').pop()?.split('\\').pop()?.trim() ?? ''
  if (!base || base === '.' || base === '..') return null
  if (base.includes('/') || base.includes('\\')) return null
  if (base.length > 255) return null
  return base
}

/**
 * Counts a sender's live (unclaimed, unexpired) transfers. Every user's inbox
 * is a write target for every other user, so without a cap this is a spam
 * vector with no existing analogue in the app.
 */
export async function pendingCount(fromUserId: string): Promise<number> {
  return prisma.transfer.count({
    where: { fromUserId, claimedAt: null, expiresAt: { gt: new Date() } },
  })
}

export async function maxPending(): Promise<number> {
  return getSettingNumber('transfer_max_pending_per_user', DEFAULT_MAX_PENDING)
}

/** MinIO key namespace for transfers — separate from project storage's {projectId}/{path}. */
export function buildTransferKey(id: string, filename: string): string {
  return `transfers/${id}/${filename}`
}

interface TransferRow {
  id: string
  kind: string
  fromUserId: string
  toUserId: string | null
  toHint: string | null
  filename: string | null
  size: bigint
  mimeType: string
  label: string | null
  burn: boolean
  codePrefix: string | null
  claimedAt: Date | null
  createdAt: Date
  expiresAt: Date
  fromUser?: { id: string; name: string; email: string } | null
  toUser?: { id: string; name: string; email: string } | null
}

/**
 * Shapes a row for JSON. `size` MUST be converted: it is a BigInt and
 * JSON.stringify throws on those. Never exposes content, minioKey or codeHash.
 */
export function shapeTransfer(row: TransferRow) {
  return {
    id: row.id,
    kind: row.kind,
    from: row.fromUser ? { id: row.fromUser.id, name: row.fromUser.name, email: row.fromUser.email } : null,
    to: row.toUser ? { id: row.toUser.id, name: row.toUser.name, email: row.toUser.email } : null,
    toHint: row.toHint,
    filename: row.filename,
    size: Number(row.size),
    mimeType: row.mimeType,
    label: row.label,
    burn: row.burn,
    codePrefix: row.codePrefix,
    claimedAt: row.claimedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  }
}
