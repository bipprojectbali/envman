// POC #37 lanjutan: test SIGHUP behavior
// Simulasi: parent spawn detached child, kemudian kirim SIGHUP ke process group parent
// Untuk verifikasi child tidak ikut mati.

import { writeFileSync, openSync } from 'fs'

const childLog = openSync('/tmp/poc37-sighup.log', 'a', 0o600)

const child = Bun.spawn(['sleep', '60'], {
  stdio: ['ignore', childLog, childLog],
  // @ts-ignore - cek apakah detached supported
  detached: true,
})

child.unref()
writeFileSync('/tmp/poc37-sighup.pid', String(child.pid))
console.log(`CHILD_PID=${child.pid}`)
process.exit(0)
