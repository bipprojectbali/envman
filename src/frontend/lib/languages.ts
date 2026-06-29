export const LANGUAGES = [
  'plaintext',
  'bash',
  'javascript',
  'typescript',
  'python',
  'go',
  'rust',
  'java',
  'kotlin',
  'swift',
  'c',
  'cpp',
  'csharp',
  'php',
  'ruby',
  'elixir',
  'haskell',
  'scala',
  'r',
  'sql',
  'html',
  'css',
  'scss',
  'json',
  'yaml',
  'toml',
  'xml',
  'markdown',
  'dockerfile',
  'nginx',
  'prisma',
  'graphql',
]

export const LANG_EXT: Record<string, string> = {
  plaintext: 'txt',
  bash: 'sh',
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  go: 'go',
  rust: 'rs',
  java: 'java',
  kotlin: 'kt',
  swift: 'swift',
  c: 'c',
  cpp: 'cpp',
  csharp: 'cs',
  php: 'php',
  ruby: 'rb',
  elixir: 'ex',
  haskell: 'hs',
  scala: 'scala',
  r: 'r',
  sql: 'sql',
  html: 'html',
  css: 'css',
  scss: 'scss',
  json: 'json',
  yaml: 'yml',
  toml: 'toml',
  xml: 'xml',
  markdown: 'md',
  dockerfile: 'Dockerfile',
  nginx: 'conf',
  prisma: 'prisma',
  graphql: 'graphql',
}

export const LANG_COLORS: Record<string, string> = {
  javascript: 'yellow',
  typescript: 'blue',
  python: 'green',
  go: 'cyan',
  rust: 'orange',
  bash: 'gray',
  sql: 'violet',
  json: 'teal',
  yaml: 'lime',
  html: 'red',
  css: 'indigo',
  markdown: 'gray',
  dockerfile: 'blue',
  prisma: 'violet',
  toml: 'orange',
  plaintext: 'gray',
}

export const getExt = (lang: string) => LANG_EXT[lang] ?? 'txt'

export const getLangColor = (lang: string) => LANG_COLORS[lang] ?? 'gray'

export function adjustFilenameForLang(filename: string, oldLang: string, newLang: string): string {
  const oldExt = getExt(oldLang)
  const newExt = getExt(newLang)
  if (oldExt === newExt) return filename
  if (newExt === 'Dockerfile') return 'Dockerfile'
  if (filename === 'Dockerfile' && oldLang === 'dockerfile') return `file.${newExt}`
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1) {
    return filename ? `${filename}.${newExt}` : `file.${newExt}`
  }
  const base = filename.slice(0, lastDot)
  const currentExt = filename.slice(lastDot + 1)
  if (currentExt === oldExt) {
    return `${base}.${newExt}`
  }
  return filename
}
