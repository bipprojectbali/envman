import type { ComponentType } from 'react'
import { TbArchive, TbBraces, TbCode, TbDatabase, TbFile, TbFileText, TbMovie, TbMusic, TbPhoto } from 'react-icons/tb'

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1048576).toFixed(1)} MB`
}

const CODE_EXTS = new Set([
  'js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs', 'py', 'rs', 'go', 'rb', 'php',
  'java', 'c', 'cpp', 'h', 'cs', 'swift', 'kt', 'sh', 'bash', 'zsh', 'fish',
  'css', 'scss', 'html', 'xml', 'toml', 'yaml', 'yml', 'ini', 'conf', 'env',
])
const ZIP_EXTS = new Set(['zip', 'gz', 'tar', 'bz2', '7z', 'rar', 'xz', 'tgz'])
const DB_EXTS = new Set(['db', 'sqlite', 'sqlite3'])

/** Kembalikan icon component yang sesuai tipe file. Fallback ke TbFile. */
export function getFileIcon(mimeType: string, path: string): ComponentType<{ size?: number; style?: React.CSSProperties }> {
  if (mimeType.startsWith('image/')) return TbPhoto
  if (mimeType.startsWith('video/')) return TbMovie
  if (mimeType.startsWith('audio/')) return TbMusic
  if (mimeType.startsWith('text/')) return TbFileText
  if (mimeType === 'application/json') return TbBraces
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'json') return TbBraces
  if (ext === 'sql') return TbDatabase
  if (CODE_EXTS.has(ext)) return TbCode
  if (ZIP_EXTS.has(ext)) return TbArchive
  if (DB_EXTS.has(ext)) return TbDatabase
  return TbFile
}

/** Jika `desired` sudah ada di `existing`, auto-append " (copy)" sebelum ekstensi. */
export function suggestNonConflictPath(desired: string, existing: string[]): string {
  if (!existing.includes(desired)) return desired
  const dot = desired.lastIndexOf('.')
  const base = dot > 0 ? desired.slice(0, dot) : desired
  const ext = dot > 0 ? desired.slice(dot) : ''
  let c = `${base} (copy)${ext}`
  let n = 2
  while (existing.includes(c)) { c = `${base} (copy ${n})${ext}`; n++ }
  return c
}

const TEXT_EXTS = new Set([
  'txt', 'md', 'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'json', 'toml', 'yaml', 'yml', 'env', 'ini', 'conf', 'config',
  'sh', 'bash', 'zsh', 'fish', 'py', 'rs', 'go', 'rb', 'php',
  'css', 'scss', 'html', 'xml', 'svg', 'sql', 'csv', 'gitignore', 'dockerfile',
])

export function isTextFile(mimeType: string, path: string): boolean {
  if (mimeType.startsWith('text/')) return true
  if (['application/json', 'application/xml', 'application/javascript', 'application/typescript'].includes(mimeType)) return true
  return TEXT_EXTS.has(path.split('.').pop()?.toLowerCase() ?? '')
}

export function isPreviewable(mimeType: string, path: string): boolean {
  return (
    mimeType.startsWith('image/') ||
    mimeType.startsWith('video/') ||
    mimeType.startsWith('audio/') ||
    isTextFile(mimeType, path)
  )
}
