// POC #37: Bun.spawn detached behavior
// Goals:
//   1. Apakah parent bisa exit tanpa nunggu child?
//   2. Apakah child survive SIGHUP saat terminal close?
//   3. Apakah perlu setsid wrapper?

// Mode dipilih via env var: MODE=basic | detached | setsid | nohup

import { writeFileSync, openSync } from 'fs'

const mode = process.env.POC_MODE ?? 'basic'

// Output log file untuk child agar tidak hilang saat parent exit
const childLog = openSync('/tmp/poc37-child.log', 'a', 0o600)

let cmd: string[]
const spawnOpts: Parameters<typeof Bun.spawn>[1] = {
  stdio: ['ignore', childLog, childLog],
  env: { ...process.env, POC_CHILD: '1' },
}

switch (mode) {
  case 'basic':
    // Tanpa detached, tanpa unref — parent harus tunggu?
    cmd = ['sleep', '60']
    break
  case 'unref':
    // Pakai unref() — parent boleh exit, child masih bisa kena SIGHUP
    cmd = ['sleep', '60']
    break
  case 'detached':
    // Coba detached: true (kalau supported)
    cmd = ['sleep', '60']
    ;(spawnOpts as any).detached = true
    break
  case 'setsid':
    // Wrapper setsid: spawn child di session baru, lepas controlling terminal
    cmd = ['setsid', 'sleep', '60']
    break
  case 'nohup':
    // nohup: child ignore SIGHUP
    cmd = ['nohup', 'sleep', '60']
    break
  default:
    console.error(`Unknown mode: ${mode}`)
    process.exit(1)
}

const start = Date.now()
const child = Bun.spawn(cmd, spawnOpts)

if (mode === 'unref' || mode === 'detached' || mode === 'setsid' || mode === 'nohup') {
  child.unref()
}

// Write PID file untuk verifikasi
writeFileSync('/tmp/poc37-child.pid', String(child.pid))
console.log(`MODE=${mode} CHILD_PID=${child.pid} PARENT_PID=${process.pid}`)

// Parent exit immediately untuk semua mode kecuali 'basic'
if (mode === 'basic') {
  console.log('basic mode: waiting for child...')
  await child.exited
  console.log(`child exited after ${Date.now() - start}ms`)
} else {
  console.log('parent exiting immediately')
  process.exit(0)
}
