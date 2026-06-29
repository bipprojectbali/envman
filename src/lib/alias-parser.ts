// Parse args string sebuah alias, ekstrak refs env (`-e project:env`).
// Tujuan: tampilkan badge di FE & block resolve di server jika user di-deny.
//
// Aturan tokenize:
// - Split sederhana berbasis whitespace, hormati quoted strings (single/double).
// - Hanya `-e` (atau `--env`?) yang valid — saat ini CLI hanya support `-e`.
// - Skip token yang bukan format `project:env` (mis. path file lokal `-e .env.prod`).
//   Heuristik: ada `:` dan kedua sisi alfanumerik (no `/`, no `.`).
// - Stop parsing setelah `--` (terminator argumen interpreter).

export type EnvRef = { project: string; env: string }

const REF_RE = /^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/i

function tokenize(input: string): string[] {
  const tokens: string[] = []
  let cur = ''
  let quote: '"' | "'" | null = null
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!
    if (quote) {
      if (ch === quote) {
        quote = null
      } else {
        cur += ch
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      if (cur) {
        tokens.push(cur)
        cur = ''
      }
      continue
    }
    cur += ch
  }
  if (cur) tokens.push(cur)
  return tokens
}

export function extractEnvRefs(args: string): EnvRef[] {
  const tokens = tokenize(args)
  const refs: EnvRef[] = []
  const seen = new Set<string>()
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!
    if (t === '--') break
    if (t !== '-e' && t !== '--env') continue
    const val = tokens[i + 1]
    if (!val) continue
    i++
    // file refs ada `/` atau `.` → skip
    if (val.includes('/') || val.includes('.')) continue
    if (!REF_RE.test(val)) continue
    const [project, env] = val.split(':') as [string, string]
    const key = `${project}:${env}`
    if (seen.has(key)) continue
    seen.add(key)
    refs.push({ project, env })
  }
  return refs
}
