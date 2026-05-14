# API Reference

## Admin API (SUPER_ADMIN only)

- `GET /api/admin/users` — list all users with role, blocked status, createdAt
- `PUT /api/admin/users/:id/role` — change role to USER or ADMIN (cannot change self or to SUPER_ADMIN)
- `PUT /api/admin/users/:id/block` — block/unblock user (deletes all sessions on block)
- `GET /api/admin/presence` — list online user IDs
- `GET /api/admin/logs/app` — app logs from Redis (filter: level, limit, afterId)
- `GET /api/admin/logs/audit` — audit logs from DB (filter: userId, action, limit)
- `DELETE /api/admin/logs/app` — clear all app logs from Redis
- `DELETE /api/admin/logs/audit` — clear all audit logs from DB
- `GET /api/admin/routes` — all routes metadata (method, path, auth level, category, description)
- `GET /api/admin/project-structure` — scans `src/`, `prisma/`, `tests/` — files with line counts, exports, imports
- `GET /api/admin/env-map` — environment variables with set/unset status, required/optional, consuming files
- `GET /api/admin/test-coverage` — source files + test files mapping, coverage status
- `GET /api/admin/dependencies` — NPM packages with version, type, importing files
- `GET /api/admin/migrations` — Prisma migration timeline with parsed SQL changes
- `GET /api/admin/sessions` — all active sessions with user info, online status, expiry, role breakdown
- `GET /api/admin/schema` — parses `prisma/schema.prisma` → models/fields/relations/enums JSON

## Tickets API

Status machine: `OPEN → IN_PROGRESS → READY_FOR_QC → CLOSED` with `REOPENED` branch.

- `GET /api/tickets` — list (QC users see only QC-scope tickets)
- `POST /api/tickets` — create (any authed user)
- `GET /api/tickets/:id` — detail with comments + evidence
- `PATCH /api/tickets/:id` — update status/priority/assignee (role-gated transitions)
- `POST /api/tickets/:id/comments` — add comment
- `POST /api/tickets/:id/evidence` — attach evidence (url + kind)

Frontend: `src/frontend/components/TicketsPanel.tsx` — shared between `/dev` and `/dashboard`.

## Envman API

Auth: session cookie (browser) or `Authorization: Bearer <token>` (CLI). `requireEnvAuth()` in `src/app.ts`.

### Projects
- `GET /api/envman/projects` — list projects (only accessible ones); returns `tags[]` per project
- `POST /api/envman/projects` — create project (ADMIN+); body: `{slug, name, description?, tags?[]}`
- `PATCH /api/envman/projects/:slug` — update project (OWNER); body: `{name?, description?, tags?[]}`
- `GET /api/envman/projects/:slug` — project detail + members + environments
- `GET /api/envman/projects/:slug/environments/:env/vars` — list vars (VIEWER: secrets masked as `***`)
- `GET /api/envman/projects/:slug/environments/:env/vars/export` — all vars decrypted (EDITOR+)
- `POST /api/envman/projects/:slug/environments/:env/vars` — create/update var (EDITOR+)
- `PUT /api/envman/projects/:slug/environments/:env/vars/:key` — update var (EDITOR+)
- `DELETE /api/envman/projects/:slug/environments/:env/vars/:key` — delete var (EDITOR+)
- `POST /api/envman/projects/:slug/environments` — add environment (EDITOR+)
- `DELETE /api/envman/projects/:slug/environments/:env` — delete environment (OWNER+)
- `PUT /api/envman/projects/:slug/members/:userId/role` — change member role (OWNER)
- `DELETE /api/envman/projects/:slug/members/:userId` — remove member (OWNER)

### Portainer
- `GET /api/envman/portainer/connections` — list global connections
- `POST /api/envman/portainer/connections` — create connection
- `PUT /api/envman/portainer/connections/:id` — update connection
- `DELETE /api/envman/portainer/connections/:id` — delete connection
- `POST /api/envman/portainer/connections/:id/probe` — test + fetch stacks
- `GET /api/envman/projects/:slug/environments/:env/portainer` — get portainer config
- `PUT /api/envman/projects/:slug/environments/:env/portainer` — save config (connectionId + stackId)
- `DELETE /api/envman/projects/:slug/environments/:env/portainer` — remove config
- `POST /api/envman/projects/:slug/environments/:env/portainer/sync` — push vars to stack

### Tokens
- `GET /api/envman/tokens` — list your tokens
- `POST /api/envman/tokens` — create token
- `DELETE /api/envman/tokens/:id` — delete token
- `GET /api/envman/whoami` — verify token, return user info

## Auth Endpoints

- `POST /api/auth/login` — email/password login, creates Session record
- `GET /api/auth/google` → `GET /api/auth/callback/google` — OAuth flow
- `GET /api/auth/session` — returns current user or 401
- `POST /api/auth/logout` — deletes session
- `GET /api/dev-auth/login-as/:email?redirect=/path` — dev only, for Playwright testing

## WebSocket

- `WS /ws/presence` — real-time presence. Auth via session cookie. Broadcasts online user list to admin subscribers.
