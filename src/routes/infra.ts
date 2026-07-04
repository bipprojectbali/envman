import { Elysia } from 'elysia'
import { addConnection, broadcastToAdmins, removeConnection } from '../lib/presence'
import { requireAuth } from '../lib/auth-middleware'
import pkg from '../../package.json'

// Bridge between beforeHandle and open() on WS presence — one Request lives only
// during handshake so WeakMap is safe and auto-GC'd.
const presenceAuth = new WeakMap<Request, { userId: string; role: string }>()

// Infrastructure routes: WebSocket presence, version endpoint
export const infraRouter = new Elysia()

  // WS /ws/presence — real-time presence with role-based admin broadcast
  .ws('/ws/presence', {
    async beforeHandle({ request, set }) {
      const caller = await requireAuth(request)
      if (!caller) {
        set.status = 401
        return 'Unauthorized'
      }
      presenceAuth.set(request, caller)
    },
    open(ws) {
      const req = (ws.data as { request: Request }).request
      const caller = presenceAuth.get(req)
      presenceAuth.delete(req)
      if (!caller) {
        ws.close()
        return
      }
      const isAdmin = caller.role === 'ADMIN' || caller.role === 'SUPER_ADMIN'
      ;(ws.data as { userId?: string }).userId = caller.userId
      addConnection(ws, caller.userId, isAdmin)
    },
    close(ws) {
      const userId = (ws.data as { userId?: string }).userId
      if (userId) removeConnection(ws, userId)
    },
  })

  .get('/api/version', () => ({ name: pkg.name, version: pkg.version }))
