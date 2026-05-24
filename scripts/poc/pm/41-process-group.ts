// POC #41: Verifikasi process group kill bekerja untuk child of supervisor.
// Skenario: spawn bash dengan sleep child, kill -PGID, expect bash + sleep mati.

import { writeFileSync } from 'fs'

const mode = process.env.POC_MODE ?? 'help'

if (mode === 'spawn-tree') {
  // Spawn bash yang spawn sleep — verify grandchild handling
  const child = Bun.spawn(['bash', '-c', 'sleep 60 & wait'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })

  writeFileSync('/tmp/poc41-parent.pid', String(child.pid))

  // Cari grandchild PID setelah 200ms
  await new Promise(r => setTimeout(r, 200))
  const grandPids = Bun.spawnSync(['pgrep', '-P', String(child.pid)])
  const grandPid = grandPids.stdout.toString().trim().split('\n')[0]
  writeFileSync('/tmp/poc41-grand.pid', grandPid)

  console.log(`PARENT_PID=${child.pid} GRAND_PID=${grandPid}`)
  console.log(`PARENT_PGID=${getInfo(child.pid).pgid} GRAND_PGID=${getInfo(Number(grandPid)).pgid}`)
  console.log(`PARENT_SID=${getInfo(child.pid).sid} GRAND_SID=${getInfo(Number(grandPid)).sid}`)

  // Wait sebentar lalu exit (jangan kill — biarkan test script yang kill)
  console.log('SPAWNED — waiting for external kill')

  // Tunggu sampai parent mati supaya kita bisa report
  await child.exited
  console.log('PARENT_EXITED')
  process.exit(0)
}

if (mode === 'kill-group-test') {
  // Standalone test: spawn tree, kill via -PGID, verify both dead
  const child = Bun.spawn(['bash', '-c', 'sleep 60 & wait'], {
    stdio: ['ignore', 'inherit', 'inherit'],
    detached: true,
  })
  console.log(`spawned parent PID=${child.pid}`)

  await new Promise(r => setTimeout(r, 300))

  // Cari grandchild
  const result = Bun.spawnSync(['pgrep', '-P', String(child.pid)])
  const grandPid = Number(result.stdout.toString().trim().split('\n')[0])
  console.log(`grandchild PID=${grandPid}`)

  if (!grandPid) {
    console.error('No grandchild found')
    process.exit(1)
  }

  console.log('killing -PGID...')
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch (e: any) {
    console.error(`kill failed: ${e.message}`)
    process.exit(1)
  }

  await new Promise(r => setTimeout(r, 500))

  // Verify both dead
  const parentAlive = isAlive(child.pid)
  const grandAlive = isAlive(grandPid)
  console.log(`After kill -PGID: parent_alive=${parentAlive} grand_alive=${grandAlive}`)

  if (parentAlive || grandAlive) {
    console.error('FAIL: process(es) still alive')
    if (parentAlive) try { process.kill(child.pid, 'SIGKILL') } catch {}
    if (grandAlive) try { process.kill(grandPid, 'SIGKILL') } catch {}
    process.exit(1)
  }

  console.log('PASS: both parent and grandchild killed via -PGID')
  process.exit(0)
}

if (mode === 'help' || true) {
  console.log('Usage: POC_MODE=spawn-tree|kill-group-test bun 41-process-group.ts')
}

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

function getInfo(pid: number): { pgid: string; sid: string } {
  const result = Bun.spawnSync(['ps', '-o', 'pgid=,sess=', '-p', String(pid)])
  const parts = result.stdout.toString().trim().split(/\s+/)
  return { pgid: parts[0] ?? '?', sid: parts[1] ?? '?' }
}
