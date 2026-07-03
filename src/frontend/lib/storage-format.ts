export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1048576).toFixed(1)} MB`
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
