// Minimal interface — works with both raw Bun ServerWebSocket and Elysia's ElysiaWS wrapper.
interface SendableWS {
  send(data: string): unknown
}

// userId → Set of WebSocket connections (one user can have multiple tabs)
const connections = new Map<string, Set<SendableWS>>()

// Admin subscribers — get notified of all presence changes
const adminSubs = new Set<SendableWS>()

export function getOnlineUserIds(): string[] {
  return Array.from(connections.keys())
}

function broadcast() {
  const online = getOnlineUserIds()
  const msg = JSON.stringify({ type: 'presence', online })
  for (const ws of adminSubs) {
    ws.send(msg)
  }
}

export function addConnection(ws: SendableWS, userId: string, isAdmin: boolean) {
  let set = connections.get(userId)
  if (!set) {
    set = new Set()
    connections.set(userId, set)
  }
  set.add(ws)

  if (isAdmin) {
    adminSubs.add(ws)
    ws.send(JSON.stringify({ type: 'presence', online: getOnlineUserIds() }))
  }

  broadcast()
}

export function broadcastToAdmins(message: object) {
  const msg = JSON.stringify(message)
  for (const ws of adminSubs) {
    ws.send(msg)
  }
}

export function removeConnection(ws: SendableWS, userId: string) {
  const set = connections.get(userId)
  if (set) {
    set.delete(ws)
    if (set.size === 0) {
      connections.delete(userId)
    }
  }
  adminSubs.delete(ws)
  broadcast()
}
