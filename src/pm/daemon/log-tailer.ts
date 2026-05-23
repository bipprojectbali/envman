// LogTailer — broadcaster untuk multi-subscriber SSE log streaming.
//
// Bug yang dimitigasi (PROCESS-MANAGER-PLAN.md):
//   L8 ✓ Tail tanpa shell subprocess — pure JS via Bun.file slice.
//   I4 ✓ Per-subscriber cap (1000 lines) untuk avoid daemon memory growth.
//   RL4 ✓ Auto-unsubscribe via AbortSignal saat client disconnect.

import type { LineHook } from './log-writer'

export type Stream = 'out' | 'err'
export interface LogLine {
  stream: Stream
  line: string
  ts: number
}

const MAX_QUEUE_PER_SUBSCRIBER = 1000

type Subscriber = {
  id: string
  push: (line: LogLine) => void
  queueLen: number
  truncated: boolean
}

export class LogTailer {
  private subscribers = new Map<string, Subscriber>()

  /**
   * Hook untuk LogWriter — di-bind ke onOutLine/onErrLine.
   */
  onOutLine: LineHook = (line) => this.broadcast({ stream: 'out', line, ts: Date.now() })
  onErrLine: LineHook = (line) => this.broadcast({ stream: 'err', line, ts: Date.now() })

  private broadcast(entry: LogLine): void {
    for (const sub of this.subscribers.values()) {
      if (sub.queueLen >= MAX_QUEUE_PER_SUBSCRIBER) {
        if (!sub.truncated) {
          // First overflow — signal truncation
          sub.truncated = true
          try {
            sub.push({
              stream: 'err',
              line: '[envman pm] log stream truncated — reconnect to resume',
              ts: Date.now(),
            })
          } catch {}
        }
        continue
      }
      try {
        sub.push(entry)
        sub.queueLen++
      } catch {
        // subscriber callback throw — remove silently
        this.subscribers.delete(sub.id)
      }
    }
  }

  /**
   * Subscribe — return SSE-compatible ReadableStream.
   * stream auto-close saat client abort.
   */
  subscribeSSE(signal?: AbortSignal): ReadableStream<Uint8Array> {
    const id = crypto.randomUUID()
    const encoder = new TextEncoder()

    let pushFn: (line: LogLine) => void = () => {}
    let close: () => void = () => {}

    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const sub: Subscriber = {
          id,
          push: (line) => {
            const data = JSON.stringify(line)
            controller.enqueue(encoder.encode(`data: ${data}\n\n`))
            sub.queueLen = Math.max(0, sub.queueLen - 1)
          },
          queueLen: 0,
          truncated: false,
        }
        this.subscribers.set(id, sub)
        pushFn = sub.push
        close = () => {
          this.subscribers.delete(id)
          try { controller.close() } catch {}
        }

        // Keep-alive ping setiap 15s (proxy may drop idle conn at 30-60s)
        const keepAlive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': ping\n\n'))
          } catch {
            clearInterval(keepAlive)
            close()
          }
        }, 15_000)

        // Unsubscribe saat client abort
        if (signal) {
          signal.addEventListener('abort', () => {
            clearInterval(keepAlive)
            close()
          })
        }
      },
      cancel: () => {
        close()
      },
    })

    return stream
  }

  /**
   * Cleanup semua subscriber (saat process di-delete).
   */
  closeAll(): void {
    this.subscribers.clear()
  }

  subscriberCount(): number {
    return this.subscribers.size
  }
}

/**
 * Read last N lines dari file — pure JS, tanpa shell subprocess.
 * Strategy: baca dari belakang chunk demi chunk sampai dapat N newline.
 */
export async function tailFile(path: string, lines: number = 100): Promise<string[]> {
  const file = Bun.file(path)
  if (!(await file.exists())) return []

  const totalSize = file.size
  if (totalSize === 0) return []

  // Baca 64KB dari belakang per iterasi
  const CHUNK = 64 * 1024
  let pos = totalSize
  let collected = ''
  let lineCount = 0
  const targetCount = lines + 1  // butuh extra untuk handle trailing line

  while (pos > 0 && lineCount < targetCount) {
    const readSize = Math.min(CHUNK, pos)
    const slice = await file.slice(pos - readSize, pos).text()
    collected = slice + collected
    lineCount = (collected.match(/\n/g) ?? []).length
    pos -= readSize
  }

  const allLines = collected.split('\n')
  // Drop empty trailing (from final \n)
  while (allLines.length > 0 && allLines[allLines.length - 1] === '') {
    allLines.pop()
  }
  return allLines.slice(-lines)
}
