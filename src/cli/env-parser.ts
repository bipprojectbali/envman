import { existsSync, readFileSync } from 'node:fs'

export function parseEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    console.error(`[envman] file not found: ${filePath}`)
    process.exit(1)
  }
  const result: Record<string, string> = {}
  for (const raw of readFileSync(filePath, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    if (!key) continue
    let value = line.slice(eq + 1)
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      value = value.slice(1, -1)
    result[key] = value
  }
  return result
}
