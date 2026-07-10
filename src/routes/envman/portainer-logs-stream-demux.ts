// De-mux stream Docker multiplexed → SSE incremental.
// Format frame Docker: header 8 byte [streamType, 0,0,0, size(uint32 BE)] + payload.
// Chunk jaringan bisa terpotong di tengah header/payload → akumulasi buffer lintas
// chunk, hanya emit frame yang sudah lengkap. Sisa partial disimpan untuk chunk berikut.

const HEARTBEAT_MS = 20_000

type DemuxOptions = {
  withTimestamps: boolean
  onClose?: () => void
}

function sseLine(stream: 'stdout' | 'stderr', message: string): string {
  // Satu event SSE per baris log. `event:` bedakan stderr agar konsumen bisa warnai.
  return `event: ${stream}\ndata: ${message}\n\n`
}

function extractMessage(raw: string, withTimestamps: boolean): string | null {
  const line = raw.trimEnd()
  if (!line) return null
  if (!withTimestamps) return line
  const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s(.*)$/)
  return tsMatch ? `${tsMatch[1]} ${tsMatch[2]}` : line
}

export function streamDockerLogs(
  body: ReadableStream<Uint8Array>,
  opts: DemuxOptions,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const reader = body.getReader()
  let buf = new Uint8Array(0)
  let heartbeat: ReturnType<typeof setInterval> | undefined

  function append(chunk: Uint8Array) {
    const merged = new Uint8Array(buf.length + chunk.length)
    merged.set(buf, 0)
    merged.set(chunk, buf.length)
    buf = merged
  }

  // Emit tiap frame lengkap di buffer. Return string SSE gabungan (bisa kosong).
  function drainFrames(): string {
    let out = ''
    let offset = 0
    while (buf.length - offset >= 8) {
      const streamType = buf[offset]
      const size =
        (buf[offset + 4] << 24) | (buf[offset + 5] << 16) | (buf[offset + 6] << 8) | buf[offset + 7]
      if (buf.length - offset - 8 < size) break // frame belum lengkap
      const payload = decoder.decode(buf.slice(offset + 8, offset + 8 + size))
      offset += 8 + size
      const stream = streamType === 2 ? 'stderr' : 'stdout'
      for (const raw of payload.split('\n')) {
        const message = extractMessage(raw, opts.withTimestamps)
        if (message !== null) out += sseLine(stream, message)
      }
    }
    if (offset > 0) buf = buf.slice(offset)
    return out
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      heartbeat = setInterval(() => {
        // Komentar SSE — jaga koneksi hidup saat container diam tanpa memicu event.
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'))
        } catch {
          /* controller sudah tertutup */
        }
      }, HEARTBEAT_MS)

      ;(async () => {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (value) {
              append(value)
              const sse = drainFrames()
              if (sse) controller.enqueue(encoder.encode(sse))
            }
          }
          controller.close()
        } catch {
          // Abort (client putus) atau error upstream → tutup diam-diam.
          try {
            controller.close()
          } catch {
            /* already closed */
          }
        } finally {
          if (heartbeat) clearInterval(heartbeat)
          opts.onClose?.()
        }
      })()
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat)
      reader.cancel().catch(() => {})
      opts.onClose?.()
    },
  })
}
