function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

function required(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
}

export const env = {
  PORT: parseInt(optional('PORT', '3000'), 10),
  NODE_ENV: optional('NODE_ENV', 'development'),
  REACT_EDITOR: optional('REACT_EDITOR', 'code'),
  DATABASE_URL: required('DATABASE_URL'),
  REDIS_URL: required('REDIS_URL'),
  GOOGLE_CLIENT_ID: required('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: required('GOOGLE_CLIENT_SECRET'),
  SUPER_ADMIN_EMAILS: optional('SUPER_ADMIN_EMAIL', '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean),
  AUDIT_LOG_RETENTION_DAYS: parseInt(optional('AUDIT_LOG_RETENTION_DAYS', '90'), 10),
  // Optional: 32-byte hex key for AES-256-GCM encryption of secret env vars.
  // Generate: openssl rand -hex 32
  // If unset, secret values are stored as plaintext (no at-rest protection).
  MASTER_KEY: optional('MASTER_KEY', ''),
  // Better-auth — BETTER_AUTH_URL wajib diset di staging/production ke URL publik server
  // (default localhost hanya valid untuk dev lokal)
  BETTER_AUTH_SECRET: required('BETTER_AUTH_SECRET'),
  BETTER_AUTH_URL: optional('BETTER_AUTH_URL', 'http://localhost:3000'),
  // Explicit trusted origins — diisi jika ada domain tambahan (misal: preview URL)
  BETTER_AUTH_TRUSTED_ORIGINS: optional('BETTER_AUTH_TRUSTED_ORIGINS', ''),
} as const
