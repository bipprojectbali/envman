// POC #39: SO_PEERCRED via Bun.serve vs node:net fallback
// Goals:
//   1. Apakah Bun.serve unix socket expose peer UID di handler?
//   2. Apakah node:net createServer expose peer UID?
//   3. Validasi fallback: chmod 0600 sebagai defense layer

import { existsSync, statSync, unlinkSync } from 'fs'
import net from 'net'

const action = process.env.POC_ACTION ?? 'help'

async function actionBunServe() {
  const SOCKET = '/tmp/poc39-bun.sock'
  if (existsSync(SOCKET)) unlinkSync(SOCKET)

  const server = Bun.serve({
    unix: SOCKET,
    fetch(req, server) {
      // cek property apa saja yang ada di req
      const reqKeys = Object.keys(req).join(',') || 'NONE'
      const reqAny = req as any
      // Try common peer cred properties
      const candidates = [
        'peerCredentials', 'peerCred', 'peer', 'credentials',
        'socket', 'connection', 'client',
      ]
      const found: string[] = []
      for (const key of candidates) {
        if (reqAny[key] !== undefined) found.push(`${key}=${typeof reqAny[key]}`)
      }
      return Response.json({
        reqKeys,
        candidatesFound: found,
        method: req.method,
        url: req.url,
        // server has API?
        serverKeys: server ? Object.keys(server).join(',') : 'no-server',
      })
    },
  })

  await new Promise(r => setTimeout(r, 50))
  const res = await fetch('http://localhost/', { unix: SOCKET } as any)
  const data = await res.json()
  console.log('BUN_SERVE result:')
  console.log(JSON.stringify(data, null, 2))

  server.stop()
  if (existsSync(SOCKET)) unlinkSync(SOCKET)
}

async function actionNodeNet() {
  const SOCKET = '/tmp/poc39-node.sock'
  if (existsSync(SOCKET)) unlinkSync(SOCKET)

  const server = net.createServer((socket) => {
    // socket adalah net.Socket, cek property yang ada
    const candidates = ['_handle', 'remoteAddress', 'remoteFamily', 'remotePort', 'address']
    const found: Record<string, any> = {}
    for (const key of candidates) {
      try {
        found[key] = (socket as any)[key]
      } catch {}
    }

    // Cek _handle (internal) untuk peer creds
    const handle = (socket as any)._handle
    let peerCred: any = null
    if (handle) {
      try {
        // Try common method names
        if (typeof handle.getPeerName === 'function') peerCred = handle.getPeerName()
      } catch (e: any) {
        peerCred = `error: ${e.message}`
      }
    }

    // socket.getsockopt — does it exist?
    const hasGetsockopt = typeof (socket as any).getsockopt === 'function'

    socket.write(JSON.stringify({
      found,
      hasGetsockopt,
      peerCred,
      socketKeys: Object.keys(socket).slice(0, 20).join(','),
    }))
    socket.end()
  })

  await new Promise<void>(r => server.listen(SOCKET, () => r()))

  // chmod biar punya 0600
  try {
    const fs = await import('fs')
    fs.chmodSync(SOCKET, 0o600)
  } catch {}

  // Connect dan baca response
  const client = net.connect(SOCKET)
  const data = await new Promise<string>((resolve, reject) => {
    let buf = ''
    client.on('data', (d) => { buf += d.toString() })
    client.on('end', () => resolve(buf))
    client.on('error', reject)
  })
  console.log('NODE_NET result:')
  try {
    console.log(JSON.stringify(JSON.parse(data), null, 2))
  } catch {
    console.log('  raw:', data)
  }

  server.close()
  if (existsSync(SOCKET)) unlinkSync(SOCKET)
}

async function actionPermissionDefense() {
  // Test: socket dengan mode 0600 — apakah user lain bisa connect?
  // (test sebagai user yang sama dulu, tidak bisa test cross-user di sini)
  const SOCKET = '/tmp/poc39-perm.sock'
  if (existsSync(SOCKET)) unlinkSync(SOCKET)

  const server = Bun.serve({
    unix: SOCKET,
    fetch() {
      return new Response('hello from daemon')
    },
  })
  await new Promise(r => setTimeout(r, 50))

  const fs = await import('fs')
  fs.chmodSync(SOCKET, 0o600)
  const stat = statSync(SOCKET)
  const mode = '0' + (stat.mode & 0o777).toString(8)
  console.log(`SOCKET_MODE=${mode}`)
  console.log(`OWNER UID=${stat.uid} (current process UID=${process.getuid?.() ?? 'n/a'})`)

  // Self can connect (because same UID)
  const res = await fetch('http://localhost/', { unix: SOCKET } as any)
  console.log(`SELF_CONNECT: status=${res.status}`)

  server.stop()
  if (existsSync(SOCKET)) unlinkSync(SOCKET)
}

switch (action) {
  case 'bun':
    await actionBunServe()
    break
  case 'node':
    await actionNodeNet()
    break
  case 'perm':
    await actionPermissionDefense()
    break
  default:
    console.log('Usage: POC_ACTION=bun|node|perm bun 39-peercred.ts')
}
