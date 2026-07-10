# envman

Self-hosted environment variable manager with CLI injection, secret encryption, Portainer sync, and team access control. Built with Bun, Elysia, React 19, and Vite.

## Tech Stack

- **Runtime**: [Bun](https://bun.com)
- **Server**: [Elysia.js](https://elysiajs.com) — API routes + Vite middleware (dev) / static serving (prod)
- **Frontend**: React 19 + [TanStack Router](https://tanstack.com/router) + [TanStack Query](https://tanstack.com/query)
- **UI**: [Mantine v8](https://mantine.dev) (dark/light mode) + [react-icons](https://react-icons.github.io/react-icons/)
- **Database**: PostgreSQL via [Prisma v6](https://www.prisma.io)
- **Cache/Logs**: Redis via Bun native `Bun.RedisClient`
- **Auth**: Session-based (bcrypt + HttpOnly cookies) + Google OAuth
- **Real-time**: WebSocket presence (Bun native)
- **MCP**: Local MCP server (`scripts/mcp/`) — lets Claude drive the app
- **Testing**: bun:test (unit + integration)

## Prerequisites

- [Bun](https://bun.sh) >= 1.3
- PostgreSQL running on `localhost:5432`
- Redis running on `localhost:6379`

## Setup

```bash
bun install
cp .env.example .env
# Edit .env with your DATABASE_URL, REDIS_URL, Google OAuth credentials, etc.
bun run db:migrate
bun run db:seed
```

## Development

```bash
bun run dev
```

Server starts at `http://localhost:3000` (configurable via `PORT` in `.env`).

## Production

```bash
bun run build
bun run start
```

## Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start dev server with HMR |
| `bun run build` | Build frontend for production |
| `bun run start` | Start production server |
| `bun run build:cli` | Build CLI binaries (all platforms) |
| `bun run test` | Run all tests |
| `bun run test:unit` | Run unit tests |
| `bun run test:integration` | Run integration tests |
| `bun run typecheck` | TypeScript type check |
| `bun run lint` | Lint with Biome |
| `bun run lint:fix` | Lint and auto-fix |
| `bun run db:migrate` | Run Prisma migrations |
| `bun run db:seed` | Seed demo users |
| `bun run db:studio` | Open Prisma Studio |
| `bun run db:generate` | Regenerate Prisma client |

## CLI

The `envman` CLI is written in Go (source in `cli-go/`, entry `cli-go/cmd/envman/main.go`). It injects environment variables at runtime from the server or local files.

```bash
# Install (copy binary to PATH)
curl -sL https://your-server/download/cli/linux-x64 -o envman && chmod +x envman

# Login
envman login https://your-server --token <api-token>

# Inject env vars and run a command
envman -e myapp:production -- bun run start

# Multiple sources (later -e overrides earlier)
envman -e myapp:base -e myapp:production -- bun dev
envman -e .env.local -e myapp:production -- bun dev
```

### Auth resolution (priority: highest → lowest)
1. `ENVMAN_SERVER` + `ENVMAN_TOKEN` in a local `-e` file
2. `ENVMAN_SERVER` + `ENVMAN_TOKEN` as system env vars
3. Config file at `~/.config/envman/config.json` (saved by `envman login`)

## Envman API

Auth: session cookie (browser) or `Authorization: Bearer <token>` (CLI).

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/envman/projects` | List your projects |
| `POST` | `/api/envman/projects` | Create project (ADMIN+) |
| `GET` | `/api/envman/projects/:slug` | Project detail + members + environments |
| `GET` | `/api/envman/projects/:slug/environments/:env/vars` | List vars (secrets masked for VIEWER) |
| `GET` | `/api/envman/projects/:slug/environments/:env/vars/export` | Export all vars decrypted (EDITOR+) |
| `POST` | `/api/envman/projects/:slug/environments/:env/vars` | Create/update var (EDITOR+) |
| `PUT` | `/api/envman/projects/:slug/environments/:env/vars/:key` | Update var (EDITOR+) |
| `DELETE` | `/api/envman/projects/:slug/environments/:env/vars/:key` | Delete var (EDITOR+) |
| `POST` | `/api/envman/projects/:slug/environments` | Add environment (EDITOR+) |
| `DELETE` | `/api/envman/projects/:slug/environments/:env` | Delete environment (OWNER+) |
| `PUT` | `/api/envman/projects/:slug/members/:userId/role` | Change member role (OWNER) |
| `DELETE` | `/api/envman/projects/:slug/members/:userId` | Remove member (OWNER) |
| `GET` | `/api/envman/tokens` | List your API tokens |
| `POST` | `/api/envman/tokens` | Create API token |
| `DELETE` | `/api/envman/tokens/:id` | Delete token |
| `GET` | `/api/envman/whoami` | Verify token, return user info |

## Secret Encryption

Vars marked as `isSecret` are encrypted with **AES-256-GCM** before storage.

- Set `MASTER_KEY` to a 64-char hex string: `openssl rand -hex 32`
- If unset, secrets are stored plaintext (backward compatible)
- VIEWER sees `***` in UI; EDITOR/OWNER can reveal (server-side decrypt)
- CLI and Portainer sync always decrypt automatically

## Portainer Sync

Push env vars directly to Portainer stacks.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/envman/portainer/connections` | List global connections |
| `POST` | `/api/envman/portainer/connections` | Create connection |
| `POST` | `/api/envman/portainer/connections/:id/probe` | Test + fetch stacks |
| `PUT` | `/api/envman/projects/:slug/environments/:env/portainer` | Save portainer config |
| `POST` | `/api/envman/projects/:slug/environments/:env/portainer/sync` | Push vars to stack |

## Roles & Routing

| Role | Default Route | Can Access |
|------|--------------|------------|
| `SUPER_ADMIN` | `/dev` | `/dev`, `/dashboard`, `/envmanager`, `/profile` |
| `ADMIN` | `/dashboard` | `/dashboard`, `/envmanager`, `/profile` |
| `QC` | `/dashboard` | `/dashboard` (QC-scoped tickets), `/profile` |
| `USER` | `/profile` | `/profile` |

## Auth

- **Email/password**: `POST /api/auth/login`
- **Google OAuth**: `GET /api/auth/google`
- **Session check**: `GET /api/auth/session`
- **Logout**: `POST /api/auth/logout`
- **Dev-auth** (development only): `GET /api/dev-auth/login-as/:email?redirect=/path`

Demo users (seeded):

| Email | Password | Role |
|-------|----------|------|
| `superadmin@example.com` | `superadmin123` | SUPER_ADMIN |
| `admin@example.com` | `admin123` | ADMIN |
| `user@example.com` | `user123` | USER |

## MCP Server

Local MCP server lets Claude Code drive the app. Configured in `.mcp.json`.

- `MCP_SECRET` — grants readonly tools
- `MCP_SECRET_ADMIN` — grants write + dev tools

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `MASTER_KEY` | No | 64-char hex key for AES-256-GCM secret encryption |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `SUPER_ADMIN_EMAIL` | No | Comma-separated emails to auto-promote to SUPER_ADMIN |
| `AUDIT_LOG_RETENTION_DAYS` | No | Days to keep audit logs (default: 90) |
| `PORT` | No | Server port (default: 3000) |
| `REACT_EDITOR` | No | Editor for click-to-source (default: code) |
| `MCP_SECRET` | No | Grants readonly MCP tools |
| `MCP_SECRET_ADMIN` | No | Grants write + dev MCP tools |
