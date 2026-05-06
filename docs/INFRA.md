# Infrastructure

## Redis

Bun native `Bun.RedisClient` — no external package needed.

- Client singleton: `src/lib/redis.ts` — connects to `REDIS_URL`
- App logs: Redis List `app:logs`, max 500 entries via `LTRIM`, persists across restarts
- App log module: `src/lib/applog.ts` — `appLog(level, message, detail?)`, `getAppLogs(options?)`, `clearAppLogs()`

## Logging

**App Logs** (`src/lib/applog.ts`) — Redis-backed ring buffer (500 entries). Logs API requests (via `onAfterResponse`), errors, auth events. Cleared manually.

**Audit Logs** (DB `AuditLog` table) — Persistent trail. Actions: `LOGIN`, `LOGOUT`, `LOGIN_FAILED`, `LOGIN_BLOCKED`, `ROLE_CHANGED`, `BLOCKED`, `UNBLOCKED`. Auto-cleanup > `AUDIT_LOG_RETENTION_DAYS` (default 90) on startup + every 24h.

**Pagination** — Dev Console logs use client-side pagination (25 per page), polling every 5s. Page resets on filter change.

## MCP Server

Local MCP server lets Claude drive the app. `.mcp.json` registers `app-mcp` (runs `scripts/mcp/server.ts`) + `playwright`.

- Entry: `scripts/mcp/server.ts`
- Tool modules (`scripts/mcp/tools/`): `admin`, `code`, `db`, `dev`, `health`, `logs`, `presence`, `project`, `redis`, `tickets`, `shared`
- `MCP_SECRET` — grants readonly tools
- `MCP_SECRET_ADMIN` — grants write + dev automation tools
- HTTP fallback: `POST /mcp`

## Dev Tools

**Click-to-source**: `Ctrl+Shift+Cmd+C` toggles inspector. `inspectorPlugin` in `src/vite.ts` injects `data-inspector-*` attributes. `REACT_EDITOR` env var controls editor (`zed`/`subl` use `file:line:col`, others use `--goto`).

**HMR**: Vite 8 + `@vitejs/plugin-react` v6. `dedupeRefreshPlugin` fixes double React Refresh injection.

**Dev server entry**: `src/serve.ts` — `bun --watch src/serve.ts`. Dynamic import workaround for Bun EADDRINUSE race.
