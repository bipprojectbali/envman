// Simple structured logger untuk daemon. Pakai console.log dengan format konsisten,
// karena Bun.spawn dari CLI redirect stdout ke ~/.config/envman/run/daemon.log.

type Level = 'debug' | 'info' | 'warn' | 'error'

function shouldLog(level: Level): boolean {
  const wanted = (process.env.ENVMAN_PM_LOG_LEVEL ?? 'info').toLowerCase()
  const order = { debug: 0, info: 1, warn: 2, error: 3 } as const
  return order[level] >= (order[wanted as Level] ?? 1)
}

function emit(level: Level, msg: string, extra?: Record<string, unknown>) {
  if (!shouldLog(level)) return
  const ts = new Date().toISOString()
  const parts = [ts, level.toUpperCase(), msg]
  if (extra && Object.keys(extra).length > 0) parts.push(JSON.stringify(extra))
  if (level === 'error') console.error(parts.join(' '))
  else console.log(parts.join(' '))
}

export const log = {
  debug: (msg: string, extra?: Record<string, unknown>) => emit('debug', msg, extra),
  info: (msg: string, extra?: Record<string, unknown>) => emit('info', msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => emit('warn', msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => emit('error', msg, extra),
}
