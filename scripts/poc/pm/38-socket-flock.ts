// POC #38: Unix socket + flock + permissions
// Goals:
//   1. Bun.serve({ unix }) default permissions saat bind?
//   2. Bisa chmod 0600 setelah bind?
//   3. O_EXCL pada PID file untuk single-instance lock — apakah cukup?
//   4. Stress: 50 paralel spawn → expected 1 winner

import { existsSync, openSync, statSync, chmodSync, unlinkSync, writeSync, closeSync, constants as fsConstants } from 'fs'

const action = process.env.POC_ACTION ?? 'help'

const SOCKET = '/tmp/poc38-daemon.sock'
const PIDFILE = '/tmp/poc38-daemon.pid'

function fmt(mode: number): string {
  return '0' + (mode & 0o777).toString(8)
}

async function actionBind() {
  // Test 1: default socket permission
  if (existsSync(SOCKET)) unlinkSync(SOCKET)

  const server = Bun.serve({
    unix: SOCKET,
    fetch() {
      return new Response('ok')
    },
  })

  // wait sekejap supaya socket beneran ter-bind
  await new Promise(r => setTimeout(r, 50))

  const stat = statSync(SOCKET)
  console.log(`DEFAULT_MODE=${fmt(stat.mode)} UID=${stat.uid} GID=${stat.gid}`)

  // Test 2: chmod 0600
  chmodSync(SOCKET, 0o600)
  const stat2 = statSync(SOCKET)
  console.log(`AFTER_CHMOD_MODE=${fmt(stat2.mode)}`)

  // Test 3: fetch via unix socket
  try {
    const res = await fetch('http://localhost/', { unix: SOCKET } as any)
    console.log(`FETCH_OK status=${res.status} body=${await res.text()}`)
  } catch (e: any) {
    console.log(`FETCH_FAIL ${e.message}`)
  }

  server.stop()
  if (existsSync(SOCKET)) unlinkSync(SOCKET)
}

async function actionLock() {
  // Test 4: O_EXCL atomic create
  // IMPORTANT: jangan unlink di sini — itu bikin race. Parent yang cleanup.
  try {
    const fd = openSync(
      PIDFILE,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
      0o600,
    )
    writeSync(fd, `${process.pid}\n${Date.now()}\n${SOCKET}\n`)
    closeSync(fd)
    console.log(`LOCK_ACQUIRED pid=${process.pid}`)
  } catch (e: any) {
    if (e.code === 'EEXIST') {
      console.log(`LOCK_HELD by another process`)
    } else {
      console.log(`LOCK_ERROR ${e.message}`)
    }
  }

  // jangan unlink — biarkan untuk test concurrent
}

async function actionConcurrent() {
  // Test 5: 50 paralel — ekspektasi 1 winner, 49 EEXIST
  if (existsSync(PIDFILE)) unlinkSync(PIDFILE)

  const N = 50
  const procs: Promise<{ idx: number; result: string }>[] = []
  for (let i = 0; i < N; i++) {
    const child = Bun.spawn(['bun', __filename], {
      env: { ...process.env, POC_ACTION: 'lock' },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    procs.push(
      (async () => {
        const out = await new Response(child.stdout).text()
        return { idx: i, result: out.trim() }
      })(),
    )
  }
  const results = await Promise.all(procs)
  const winners = results.filter(r => r.result.startsWith('LOCK_ACQUIRED'))
  const losers = results.filter(r => r.result.startsWith('LOCK_HELD'))
  const errors = results.filter(r => !r.result.startsWith('LOCK'))

  console.log(`WINNERS=${winners.length} LOSERS=${losers.length} ERRORS=${errors.length}`)
  if (winners.length !== 1) {
    console.log('  FAIL: expected exactly 1 winner')
    for (const w of winners) console.log(`   winner[${w.idx}] = ${w.result}`)
  } else {
    console.log(`  ✓ exactly 1 winner = ${winners[0].result}`)
  }
  if (errors.length > 0) {
    console.log('  unexpected errors:')
    for (const e of errors) console.log(`   [${e.idx}] = ${e.result}`)
  }

  if (existsSync(PIDFILE)) unlinkSync(PIDFILE)
}

async function actionAlive() {
  // Test 6: simulasi PID hijack — cek dengan kill(pid, 0)
  // Pilih PID acak yang dijamin tidak exist
  const fakePid = 999999
  try {
    process.kill(fakePid, 0)
    console.log(`PID=${fakePid} ALIVE (unexpected)`)
  } catch (e: any) {
    console.log(`PID=${fakePid} DEAD (errno=${e.code})`)
  }

  // PID yang exist = process kita sendiri
  try {
    process.kill(process.pid, 0)
    console.log(`PID=${process.pid} (self) ALIVE`)
  } catch (e: any) {
    console.log(`PID=${process.pid} (self) FAIL: ${e.code}`)
  }
}

switch (action) {
  case 'bind':
    await actionBind()
    break
  case 'lock':
    await actionLock()
    break
  case 'concurrent':
    await actionConcurrent()
    break
  case 'alive':
    await actionAlive()
    break
  case 'help':
  default:
    console.log('Usage: POC_ACTION=bind|lock|concurrent|alive bun 38-socket-flock.ts')
}
