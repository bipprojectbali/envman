// POC #40: fs.watch reliability untuk log tail
// Goals:
//   1. Apakah fs.watch fire event untuk setiap append?
//   2. Berapa banyak coalescing yang terjadi pada burst write?
//   3. Latency event vs actual write
//   4. Apakah event hilang saat file di-rename (rotation scenario)?
//   5. Reliability rate (N append → M event)

import { watch, appendFileSync, unlinkSync, existsSync, renameSync, writeFileSync } from 'fs'

const action = process.env.POC_ACTION ?? 'help'

const LOG = '/tmp/poc40-test.log'

async function actionBurst() {
  // Test 1: append 1000 baris cepat, hitung event yang muncul
  if (existsSync(LOG)) unlinkSync(LOG)
  writeFileSync(LOG, '')

  let eventCount = 0
  const eventTypes = new Map<string, number>()
  const watcher = watch(LOG, (event, filename) => {
    eventCount++
    eventTypes.set(event, (eventTypes.get(event) ?? 0) + 1)
  })

  await new Promise(r => setTimeout(r, 100))  // tunggu watcher ready

  const N = 1000
  const start = Date.now()
  for (let i = 0; i < N; i++) {
    appendFileSync(LOG, `line ${i}\n`)
  }
  const writeMs = Date.now() - start

  await new Promise(r => setTimeout(r, 300))  // tunggu event terkumpul
  watcher.close()

  console.log(`BURST writes=${N} events=${eventCount} write_ms=${writeMs}`)
  console.log(`  event types: ${JSON.stringify(Object.fromEntries(eventTypes))}`)
  console.log(`  coalescing ratio: ${(N / eventCount).toFixed(1)}× (writes per event)`)

  unlinkSync(LOG)
}

async function actionPaced() {
  // Test 2: append 100 baris dengan 10ms delay antar baris
  if (existsSync(LOG)) unlinkSync(LOG)
  writeFileSync(LOG, '')

  let eventCount = 0
  const watcher = watch(LOG, () => { eventCount++ })
  await new Promise(r => setTimeout(r, 100))

  const N = 100
  for (let i = 0; i < N; i++) {
    appendFileSync(LOG, `line ${i}\n`)
    await new Promise(r => setTimeout(r, 10))
  }

  await new Promise(r => setTimeout(r, 200))
  watcher.close()

  console.log(`PACED (10ms delay) writes=${N} events=${eventCount} ratio=${(N / eventCount).toFixed(1)}×`)
  unlinkSync(LOG)
}

async function actionLatency() {
  // Test 3: latency antara write dan event fire
  if (existsSync(LOG)) unlinkSync(LOG)
  writeFileSync(LOG, '')

  const latencies: number[] = []
  let writeTime = 0
  const watcher = watch(LOG, () => {
    latencies.push(Date.now() - writeTime)
  })

  await new Promise(r => setTimeout(r, 100))

  for (let i = 0; i < 20; i++) {
    writeTime = Date.now()
    appendFileSync(LOG, `latency-test-${i}\n`)
    await new Promise(r => setTimeout(r, 100))  // gap besar agar event tidak coalesce
  }

  await new Promise(r => setTimeout(r, 200))
  watcher.close()

  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length
  const max = Math.max(...latencies)
  const min = Math.min(...latencies)
  console.log(`LATENCY (ms) samples=${latencies.length} avg=${avg.toFixed(1)} min=${min} max=${max}`)
  unlinkSync(LOG)
}

async function actionRename() {
  // Test 4: behavior saat file di-rename (simulasi log rotation)
  if (existsSync(LOG)) unlinkSync(LOG)
  if (existsSync(LOG + '.1')) unlinkSync(LOG + '.1')
  writeFileSync(LOG, 'before\n')

  const events: string[] = []
  const watcher = watch(LOG, (event, filename) => {
    events.push(`${Date.now()}: ${event} ${filename}`)
  })
  await new Promise(r => setTimeout(r, 100))

  // Rename file (rotation)
  renameSync(LOG, LOG + '.1')
  await new Promise(r => setTimeout(r, 100))

  // Buat file baru di path yang sama
  writeFileSync(LOG, 'new file\n')
  await new Promise(r => setTimeout(r, 100))

  // Append ke file baru — apakah watcher masih dapat event?
  appendFileSync(LOG, 'after rotation\n')
  await new Promise(r => setTimeout(r, 200))

  watcher.close()
  console.log('RENAME scenario events:')
  for (const e of events) console.log(`  ${e}`)
  console.log(`  total events: ${events.length}`)

  if (existsSync(LOG)) unlinkSync(LOG)
  if (existsSync(LOG + '.1')) unlinkSync(LOG + '.1')
}

async function actionPolling() {
  // Test 5: simulasi polling-based tail untuk bandingkan
  if (existsSync(LOG)) unlinkSync(LOG)
  writeFileSync(LOG, '')

  let lastSize = 0
  let pollEvents = 0

  const pollInterval = setInterval(async () => {
    try {
      const fs = await import('fs')
      const stat = fs.statSync(LOG)
      if (stat.size !== lastSize) {
        pollEvents++
        lastSize = stat.size
      }
    } catch {}
  }, 500)

  await new Promise(r => setTimeout(r, 100))

  const N = 1000
  for (let i = 0; i < N; i++) {
    appendFileSync(LOG, `line ${i}\n`)
  }

  await new Promise(r => setTimeout(r, 1500))  // tunggu beberapa interval polling
  clearInterval(pollInterval)

  console.log(`POLLING (500ms) writes=${N} poll_events=${pollEvents}`)
  unlinkSync(LOG)
}

switch (action) {
  case 'burst':
    await actionBurst()
    break
  case 'paced':
    await actionPaced()
    break
  case 'latency':
    await actionLatency()
    break
  case 'rename':
    await actionRename()
    break
  case 'polling':
    await actionPolling()
    break
  case 'all':
    await actionBurst()
    await actionPaced()
    await actionLatency()
    await actionRename()
    await actionPolling()
    break
  default:
    console.log('Usage: POC_ACTION=burst|paced|latency|rename|polling|all bun 40-fs-watch.ts')
}
