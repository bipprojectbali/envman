// Helper konversi var → teks untuk clipboard. Murni string (tanpa DOM) agar unit-testable.

export interface EnvLineInput {
  key: string
  value: string
}

// Satu baris KEY=value dengan quoting bila value mengandung spasi/karakter khusus.
export function toEnvLine(v: EnvLineInput): string {
  const val = v.value
  const needsQuotes = val.includes(' ') || val.includes('#') || val.includes('"') || val.includes("'")
  return needsQuotes ? `${v.key}="${val.replace(/"/g, '\\"')}"` : `${v.key}=${val}`
}

export function toEnvText(list: EnvLineInput[]): string {
  return list.map(toEnvLine).join('\n')
}

// Template .env.example: hanya key, value dikosongkan (paste-ready untuk dibagikan manual).
export function toKeyTemplate(list: { key: string }[]): string {
  return list.map((v) => `${v.key}=`).join('\n')
}
