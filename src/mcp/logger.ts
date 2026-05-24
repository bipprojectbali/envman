// Stderr-only logger. WAJIB di MCP stdio context — stdout dipakai JSON-RPC protocol.
// Bug B1 mitigation: tidak boleh console.log di MCP path.

import type { Writable } from 'stream'

const REDACT_PATTERNS: Array<[RegExp, string]> = [
  [/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***'],
  [/em_[a-f0-9]{16,}/gi, 'em_***'],
  [/"token"\s*:\s*"[^"]+"/gi, '"token":"***"'],
  [/"password"\s*:\s*"[^"]+"/gi, '"password":"***"'],
]

function redact(text: string): string {
  let out = text
  for (const [re, replacement] of REDACT_PATTERNS) {
    out = out.replace(re, replacement)
  }
  return out
}

class StderrLogger {
  private debug_ = false
  private out: Writable = process.stderr

  setDebug(on: boolean): void {
    this.debug_ = on
  }

  private write(level: string, msg: string, detail?: unknown): void {
    const ts = new Date().toISOString()
    const detailStr = detail !== undefined ? ' ' + redact(JSON.stringify(detail)) : ''
    this.out.write(`${ts} ${level} mcp ${redact(msg)}${detailStr}\n`)
  }

  debug(msg: string, detail?: unknown): void {
    if (this.debug_) this.write('DEBUG', msg, detail)
  }

  info(msg: string, detail?: unknown): void {
    this.write('INFO', msg, detail)
  }

  warn(msg: string, detail?: unknown): void {
    this.write('WARN', msg, detail)
  }

  error(msg: string, detail?: unknown): void {
    this.write('ERROR', msg, detail)
  }
}

export const log = new StderrLogger()
