// Daemon auth token — shared secret di-generate sekali, persistent di filesystem.
// Dipakai sebagai defense-in-depth bersama chmod 0600 pada socket file.

import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { randomBytes } from 'crypto'

const TOKEN_LENGTH_BYTES = 32  // 256-bit entropy

/**
 * Baca token yang sudah ada, atau generate + simpan baru.
 * Idempotent — boleh dipanggil daemon dan CLI.
 */
export function ensureToken(tokenPath: string): string {
  if (existsSync(tokenPath)) {
    const content = readFileSync(tokenPath, 'utf8').trim()
    if (content.length >= 32) return content
    // file ada tapi corrupt/kosong — regenerate
  }
  const dir = dirname(tokenPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
  const token = randomBytes(TOKEN_LENGTH_BYTES).toString('hex')
  writeFileSync(tokenPath, token, { mode: 0o600 })
  chmodSync(tokenPath, 0o600)  // double-check di case writeFileSync ignore mode
  return token
}

/**
 * Constant-time string comparison untuk avoid timing attack.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

export const AUTH_HEADER = 'x-envman-daemon-auth'
