import { createHash, randomInt } from 'node:crypto'
import { getSettingNumber } from './app-settings'
import { prisma } from './db'
import { CODE_SEPARATOR, CODE_WORDS, TRANSFER_WORDS } from './transfer-wordlist'

// Shared logic for user-to-user transfers (envman transfer / recv).
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

// Legacy Crockford base32 (no I, L, O or U). Codes minted before the mnemonic
// format are still claimable, so this alphabet and length must stay.
const LEGACY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const LEGACY_CODE_LEN = 16

/**
 * Minimum length for a user-supplied --code. Short enough to stay typeable,
 * long enough that the 15-minute TTL ceiling below is doing real work.
 */
export const MIN_CUSTOM_CODE_LEN = 12

/**
 * Ceiling on how long a transfer with a user-chosen code may live.
 *
 * A custom code is low-entropy by nature, so its defence is the claim rate
 * limiter: 10 failures per IP per 10 minutes plus a 100/10min global cap means
 * roughly 150 guesses can reach a code during a 15-minute life. That is the
 * whole reason a memorable code is acceptable at all.
 */
export const CUSTOM_CODE_MAX_TTL_MINUTES = 15

/**
 * Generates a claim code as four words, e.g. "viking.pudding.alaska.sunny".
 *
 * Base32 was stronger (~80 bits) but nobody could dictate it over the phone or
 * retype it without errors, which is what a claim code is actually for. Four
 * words from a 1296-entry list carry ≈41 bits — with the claim rate limiter
 * capping guesses at 10 per IP per 10 minutes, that is astronomically out of
 * reach while being readable aloud.
 */
export function generateCode(): { code: string; formatted: string; hash: string; prefix: string } {
  const words: string[] = []
  for (let i = 0; i < CODE_WORDS; i++) {
    // randomInt, not `% length`: 1296 does not divide 256, so modulo would
    // bias the low-numbered words.
    words.push(TRANSFER_WORDS[randomInt(TRANSFER_WORDS.length)])
  }
  const code = words.join(CODE_SEPARATOR)
  // Only the first word is kept as a label. Four characters would give away a
  // quarter of the entropy and all but name the first word.
  return { code, formatted: code, hash: hashCode(code), prefix: words[0] }
}

/**
 * Validates a user-supplied code and returns its canonical form, or an error
 * describing what is wrong.
 *
 * Whitespace and shell metacharacters are rejected because the code is handed
 * to the recipient inside a copy-paste command line.
 */
export function validateCustomCode(raw: string): { ok: true; code: string } | { ok: false; error: string } {
  const code = raw.trim().toLowerCase()
  if (code.length < MIN_CUSTOM_CODE_LEN) {
    return { ok: false, error: `Kode kustom minimal ${MIN_CUSTOM_CODE_LEN} karakter` }
  }
  if (/\s/.test(code)) {
    return { ok: false, error: 'Kode kustom tidak boleh memuat spasi' }
  }
  if (/[^a-z0-9._-]/.test(code)) {
    return { ok: false, error: 'Kode kustom hanya boleh huruf, angka, titik, garis bawah, dan tanda hubung' }
  }
  return { ok: true, code }
}

/**
 * Normalizes user input to the exact string that was hashed at mint time.
 *
 * This is the canonicalisation contract with the database — hashCode runs on
 * the result — so it must agree byte for byte with NormalizeCode in
 * cli-go/internal/transfer/transfer.go. A divergence produces a code that
 * cannot be claimed, reported as a 404 deliberately indistinguishable from a
 * wrong guess.
 *
 * Detection is by class first, because the classes need opposite treatment:
 * folding I/L to 1 rescues a misread base32 code but destroys "viking".
 */
export function normalizeCode(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  // Legacy base32: strip separators and the EM- prefix, then fold the glyphs
  // the alphabet deliberately excludes.
  const asLegacy = trimmed
    .toUpperCase()
    .replace(/^EM[-\s]*/, '')
    .replace(/[-\s]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
  if (asLegacy.length === LEGACY_CODE_LEN && [...asLegacy].every((ch) => LEGACY_ALPHABET.includes(ch))) {
    return asLegacy
  }

  // Mnemonic and custom codes are both plain lowercase text; spaces are
  // accepted as a separator because people retype them that way.
  const lowered = trimmed.toLowerCase().replace(/\s+/g, CODE_SEPARATOR)
  if (lowered.length < MIN_CUSTOM_CODE_LEN) return null
  if (/[^a-z0-9._-]/.test(lowered)) return null
  return lowered
}

/**
 * Hashes a claim code for storage.
 *
 * Plain SHA-256, not bcrypt: the codeHash column is @unique so the claim path
 * can look it up in O(1), which key stretching would forfeit. That was easy to
 * justify at ~80 bits; at ≈41 bits (mnemonic) or less (custom) the real
 * defences are the claim rate limiter and, for custom codes, the 15-minute TTL
 * ceiling above — not the hash.
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

/**
 * Resolves the effective TTL in ms, clamped to the configured maximum and — for
 * a user-chosen code — to CUSTOM_CODE_MAX_TTL_MINUTES.
 *
 * The custom-code ceiling lives here rather than at the call sites because both
 * the text and file paths compute the expiry with the same one-liner, and the
 * file path is the one that would be forgotten. It is also where a long-lived
 * weak code is worst: a presigned object stays reachable for the whole TTL.
 */
export async function resolveTtlMs(requestedHours?: number, opts?: { customCode?: boolean }): Promise<number> {
  const maxHours = await getSettingNumber('transfer_max_ttl_hours', DEFAULT_MAX_TTL_HOURS)
  const defaultHours = await getSettingNumber('transfer_default_ttl_hours', DEFAULT_TTL_HOURS)
  let hours = typeof requestedHours === 'number' && requestedHours > 0 ? requestedHours : defaultHours
  if (hours > maxHours) hours = maxHours

  let ms = Math.floor(hours * 60 * 60 * 1000)
  if (opts?.customCode) {
    // Applied last and as a minimum, so an admin who sets transfer_max_ttl_hours
    // below 15 minutes still wins — this ceiling may only shorten, never extend.
    ms = Math.min(ms, CUSTOM_CODE_MAX_TTL_MINUTES * 60 * 1000)
  }
  return ms
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
 * `envman transfer send ./deep/dir/x.sql` must not produce a nested key.
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
