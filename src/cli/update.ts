import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveAuth } from './auth-resolver'
import { CONFIG_DIR, UPDATE_CACHE_FILE, UPDATE_CHECK_INTERVAL_MS, VERSION } from './constants'

export function detectPlatform(): string {
  const os = process.platform
  const arch = process.arch
  if (os === 'darwin') return arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64'
  if (os === 'win32') return 'windows-x64'
  return arch === 'arm64' ? 'linux-arm64' : 'linux-x64'
}

// Read cached update state and print notice if update available (no network, instant)
export function showUpdateNoticeFromCache() {
  try {
    if (!existsSync(UPDATE_CACHE_FILE)) return
    const cache = JSON.parse(readFileSync(UPDATE_CACHE_FILE, 'utf8'))
    if (!cache.latestVersion || cache.latestVersion === VERSION) return

    if (cache.autoUpdated === true) {
      console.error(`\n✓ envman diperbarui ke v${cache.latestVersion} di background.\n`)
      writeFileSync(UPDATE_CACHE_FILE, JSON.stringify({ ...cache, autoUpdated: false }))
    } else if (cache.autoUpdated === false && cache.latestVersion !== VERSION) {
      console.error(`\n[envman] Update tersedia: v${VERSION} → v${cache.latestVersion}. Jalankan: envman update\n`)
    }
  } catch {}
}

// Spawn detached subprocess to refresh update cache (doesn't block parent)
export function spawnUpdateCheck(serverUrl: string, _token: string) {
  try {
    if (!existsSync(UPDATE_CACHE_FILE)) {
      // First run — force check
    } else {
      const cache = JSON.parse(readFileSync(UPDATE_CACHE_FILE, 'utf8'))
      if (Date.now() - (cache.checkedAt ?? 0) < UPDATE_CHECK_INTERVAL_MS) return
    }
    const child = spawn(process.execPath, ['--_update-check', serverUrl, process.execPath], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
  } catch {}
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fmtSpeed(bps: number): string {
  if (bps < 1024) return `${bps.toFixed(0)} B/s`
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`
  return `${(bps / 1024 / 1024).toFixed(1)} MB/s`
}

function fmtEta(secs: number): string {
  if (!Number.isFinite(secs) || secs <= 0) return '...'
  if (secs < 60) return `${Math.ceil(secs)}s`
  const m = Math.floor(secs / 60)
  const s = Math.ceil(secs % 60)
  return `${m}m ${s}s`
}

function renderProgress(received: number, total: number, speed: number, _elapsed: number): string {
  const BAR = 20
  const pct = total > 0 ? Math.min(received / total, 1) : -1
  const bar = pct >= 0 ? `[${'█'.repeat(Math.floor(pct * BAR))}${'░'.repeat(BAR - Math.floor(pct * BAR))}]` : ''
  const pctStr = pct >= 0 ? ` ${(pct * 100).toFixed(0).padStart(3)}%` : ''
  const sizeStr = total > 0 ? `  ${fmtBytes(received)} / ${fmtBytes(total)}` : `  ${fmtBytes(received)}`
  const speedStr = speed > 0 ? `  ${fmtSpeed(speed)}` : ''
  const eta = speed > 0 && total > 0 ? `  ETA ${fmtEta((total - received) / speed)}` : ''
  return `  ${bar}${pctStr}${sizeStr}${speedStr}${eta}`
}

export async function downloadBinary(url: string, timeoutMs = 10 * 60 * 1000, showProgress = false): Promise<Buffer | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: { 'Accept-Encoding': 'gzip' },
      signal: controller.signal,
    })
    if (!res.ok || !res.body) {
      clearTimeout(timer)
      return null
    }

    // Content-Length = compressed size (server serves gzip); decompressed total ~2.5-3x
    const compressedLen = parseInt(res.headers.get('content-length') ?? '0', 10) || 0
    // Estimate decompressed total: gzip ratio for Bun binaries is ~2.7x
    const estimatedTotal = compressedLen > 0 ? Math.round(compressedLen * 2.7) : 0

    const chunks: Buffer[] = []
    const reader = res.body.getReader()
    let received = 0
    const startTime = Date.now()
    let lastPrint = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(Buffer.from(value))
      received += value.length

      if (showProgress) {
        const now = Date.now()
        if (now - lastPrint >= 250) {
          lastPrint = now
          const elapsed = (now - startTime) / 1000
          const speed = elapsed > 0 ? received / elapsed : 0
          const line = renderProgress(received, estimatedTotal, speed, elapsed)
          process.stdout.write(`\r\x1b[K${line}`)
        }
      }
    }

    clearTimeout(timer)
    if (showProgress) {
      const elapsed = (Date.now() - startTime) / 1000
      const speed = elapsed > 0 ? received / elapsed : 0
      process.stdout.write(`\r\x1b[K  ✓ ${fmtBytes(received)}  ${fmtSpeed(speed)}  ${elapsed.toFixed(1)}s\n`)
    }
    return Buffer.concat(chunks)
  } catch (e) {
    clearTimeout(timer)
    if (showProgress) process.stdout.write('\n')
    if ((e as Error).name === 'AbortError') return null
    throw e
  }
}

// Background auto-update handler (spawned detached, runs silently)
export async function runBgUpdateCheck(serverUrl: string, binaryPath: string) {
  try {
    const server = serverUrl.replace(/\/$/, '')
    const res = await fetch(`${server}/download/cli/version`)
    if (!res.ok) process.exit(0)
    const { version: latest } = (await res.json()) as { version: string }

    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })

    if (latest === VERSION) {
      writeFileSync(UPDATE_CACHE_FILE, JSON.stringify({ checkedAt: Date.now(), latestVersion: latest }))
      process.exit(0)
    }

    const platform = detectPlatform()
    const buf = await downloadBinary(`${server}/download/cli/${platform}`, 8 * 60 * 1000, false)
    if (!buf || buf.length < 1_000_000) process.exit(0)

    const tmpBin = join(tmpdir(), `envman-bg-${Date.now()}`)
    writeFileSync(tmpBin, buf, { mode: 0o755 })

    let replaced = false
    try {
      const { renameSync } = await import('node:fs')
      rmSync(binaryPath, { force: true })
      renameSync(tmpBin, binaryPath)
      replaced = true
    } catch {
      rmSync(tmpBin, { force: true })
    }

    writeFileSync(
      UPDATE_CACHE_FILE,
      JSON.stringify({
        checkedAt: Date.now(),
        latestVersion: latest,
        autoUpdated: replaced,
      }),
    )
  } catch {}
  process.exit(0)
}

export async function cmdUpdate() {
  const cfg = resolveAuth({})
  const server = cfg.server.replace(/\/$/, '')
  console.log(`Memeriksa update...`)
  const res = await fetch(`${server}/download/cli/version`).catch(() => null)
  if (!res?.ok) {
    console.error('Tidak bisa cek versi dari server.')
    process.exit(1)
  }
  const { version: latest } = (await res.json()) as { version: string }
  if (latest === VERSION) {
    console.log(`✓ envman v${VERSION} sudah versi terbaru.`)
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
    writeFileSync(UPDATE_CACHE_FILE, JSON.stringify({ checkedAt: Date.now(), latestVersion: latest }))
    return
  }
  const platform = detectPlatform()
  console.log(`Update tersedia: v${VERSION} → v${latest}`)
  console.log(`Mengunduh envman ${platform}...`)
  const buf = await downloadBinary(`${server}/download/cli/${platform}`, 10 * 60 * 1000, true)
  if (!buf) {
    console.error('Download gagal atau timeout. Cek koneksi ke server.')
    process.exit(1)
  }

  const tmpBin = join(tmpdir(), `envman-update-${Date.now()}`)
  writeFileSync(tmpBin, buf, { mode: 0o755 })

  const binaryPath = process.execPath
  const { renameSync } = await import('node:fs')
  try {
    rmSync(binaryPath, { force: true })
    renameSync(tmpBin, binaryPath)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EACCES') {
      console.log(`Membutuhkan izin sudo untuk install ke ${binaryPath}...`)
      const r = spawnSync('sudo', ['mv', '-f', tmpBin, binaryPath], { stdio: 'inherit' })
      if (r.status !== 0) {
        console.error(`Update gagal. Coba manual:\n  sudo mv ${tmpBin} ${binaryPath}`)
        process.exit(1)
      }
    } else {
      throw e
    }
  }

  writeFileSync(UPDATE_CACHE_FILE, JSON.stringify({ checkedAt: Date.now(), latestVersion: latest }))
  console.log(`✓ envman diupdate ke v${latest}.`)
}
