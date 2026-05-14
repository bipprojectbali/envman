# Database

PostgreSQL via Prisma v6. Client generated to `./generated/prisma` (gitignored).

## Schema Models

- `User` (id, name, email, password, role, blocked, timestamps)
- `Session` (id, token, userId, expiresAt, createdAt)
- `AuditLog` (id, userId, action, detail, ip, createdAt)
- `Ticket` (id, title, description, status, priority, route, reporterId, assigneeId, timestamps, closedAt)
- `TicketComment` (id, ticketId, authorId, authorTag, body, createdAt)
- `TicketEvidence` (id, ticketId, kind, url, note, createdAt)
- `Project` (id, slug, name, description, tags[], timestamps)
- `Environment` (id, name, projectId, createdAt) — unique(projectId, name)
- `EnvVar` (id, key, value, isSecret, environmentId, timestamps) — unique(environmentId, key)
- `ProjectMember` (id, userId, projectId, role, createdAt) — unique(userId, projectId)
- `ApiToken` (id, userId, name, token, scopes[], canWrite, lastUsedAt?, expiresAt?, createdAt)
- `PortainerConnection` (id, name, portainerUrl, apiToken, createdById, timestamps) — global, reusable
- `PortainerConfig` (id, projectId, envName, connectionId?, portainerUrl?, apiToken?, stackId, stackName, endpointId, lastSyncAt?, lastSyncOk?, timestamps) — `connectionId` FK preferred; legacy fields nullable

## Enums

- `Role` = `USER | QC | ADMIN | SUPER_ADMIN` (default `USER`)
- `ProjectMemberRole` = `OWNER | EDITOR | VIEWER`
- `TicketStatus` = `OPEN | IN_PROGRESS | READY_FOR_QC | REOPENED | CLOSED`
- `TicketPriority` = `LOW | MEDIUM | HIGH | CRITICAL`

## Key Files

- `prisma/schema.prisma` — schema definition
- `src/lib/db.ts` — Prisma client singleton, import `{ prisma }` from here
- `prisma/seed-dev.ts` — demo users (superadmin, admin, user) with `Bun.password.hash` bcrypt. **Dev-only**: gitignored, guard `NODE_ENV !== 'development'` → exit 1. Tidak ikut ke image production.

## Commands

```bash
bun run db:migrate    # bunx prisma migrate dev
bun run db:seed       # bun run prisma/seed-dev.ts (dev only)
bun run db:generate   # bunx prisma generate
bun run db:studio     # bunx prisma studio
bun run db:push       # bunx prisma db push
```

## Secret Encryption

Vars marked `isSecret` are encrypted with **AES-256-GCM** before storage.

- `MASTER_KEY` — 64-char hex (32 bytes). Generate: `openssl rand -hex 32`
- If unset: secrets stored plaintext (backward compatible)
- Stored format: `enc:<iv_hex>:<ciphertext_hex>:<auth_tag_hex>`
- Implementation: `src/lib/crypto.ts` (`encryptSecret`, `decryptSecret`)
- VIEWER sees `***` in UI; EDITOR/OWNER can reveal (server-side decrypt)
- CLI export and Portainer sync always decrypt automatically

## Seed Users

| Email | Password | Role |
|-------|----------|------|
| `superadmin@example.com` | `superadmin123` | SUPER_ADMIN |
| `admin@example.com` | `admin123` | ADMIN |
| `user@example.com` | `user123` | USER |
