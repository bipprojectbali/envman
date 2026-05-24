# Envman CLI

Standalone CLI for injecting env vars at runtime. Built with `bun build --compile` into self-contained binaries.

- Entry: `src/cli.ts`
- Build: `bun run build:cli` → `dist/cli/envman-{platform}` + `.gz` variant (level 9)
- Platforms: `linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`, `windows-x64`
- Served at: `/download/cli/<platform>`

## Download Endpoint

`GET /download/cli/:platform` melakukan **content negotiation** berdasarkan `Accept-Encoding`:

- Client kirim `Accept-Encoding: gzip` (mis. `curl --compressed`, browser modern) → server return `.gz` file dengan header `Content-Encoding: gzip`. Payload ~60% lebih kecil dari raw binary (~25MB vs ~63MB).
- Tanpa `Accept-Encoding: gzip` → server return raw binary (legacy fallback).
- Response selalu set `Vary: Accept-Encoding` agar cache (Cloudflare, browser) tahu ada varian.

## Install Script (`/install`)

Script bash yang di-curl pipe ke bash punya **retry + transparent gzip**:

- `curl --compressed` → otomatis pakai gzip transport saat tersedia.
- `curl --retry 3 --retry-all-errors --retry-delay 2` → handle transient HTTP errors di dalam satu invocation.
- Outer loop di shell → re-invoke curl up to 5x jika curl exit (mis. connection reset by peer dari proxy/CF).
- Resume (`-C -`) **tidak dipakai** karena Range request + `Content-Encoding: gzip` tidak interoperable di mayoritas server/proxy.

## Auth Resolution (priority: highest → lowest)

1. `ENVMAN_SERVER` + `ENVMAN_TOKEN` in a local `-e` file
2. `ENVMAN_SERVER` + `ENVMAN_TOKEN` as system env vars (process.env / ~/.bashrc / CI)
3. Config file at `~/.config/envman/config.json` (saved by `envman login`)

`ENVMAN_SERVER` and `ENVMAN_TOKEN` are always stripped from the child process env.

## Commands

```bash
envman login <server-url> --token <token>   # Save to ~/.config/envman/config.json
envman logout                                # Remove config file
envman whoami                                # Show authenticated user
envman run [-e <source>]... <project>:<alias> # Expand alias + merge extra sources
envman [options] -- <command>               # Inject vars and run command
envman pm daemon <start|stop|status>        # Manage pm daemon (supervisor)
envman pm <subcommand>                       # Manage long-running processes
envman mcp [--write] [--debug]               # MCP server for AI agents (Claude Code)
```

## Process Manager (`envman pm`)

Native Bun process manager built into the CLI binary. Single Unix-socket IPC + auth token. Daemon spawn pakai `Bun.spawn detached:true` (POC #37 validated).

### File layout

```
~/.config/envman/
  config.json                ← server + token (envman login)
  daemon.token               ← daemon IPC auth secret (0600, auto-generated)
  run/
    daemon.pid               ← O_EXCL + start_epoch (PID-hijack guard)
    daemon.sock              ← unix socket mode 0600
    daemon.log               ← daemon's own stdout/stderr
    processes.json           ← persisted state (atomic write tmp+rename)
    processes.json.bak       ← previous state backup
    logs/<name>-<id>.{out,err}.log   ← per-process logs, rotated 10MB × 5, gzipped
```

### Daemon

```bash
envman pm daemon start    # Spawn detached daemon, wait ready (5s timeout)
envman pm daemon stop     # Graceful shutdown via IPC
envman pm daemon status   # Show uptime, pid, version, processCount
```

### Process management

```bash
# Start managed process
envman pm start --name api -- bun index.js
envman pm start --name web --cwd /srv/app -- bun start
envman pm start --name worker -e PORT=3000 -- node worker.js

# Start with envman server env (sync-able)
envman pm start --name api -s myapp:production -- bun index.js
envman pm start --name api -s myapp:base -s myapp:prod -- bun index.js  # later wins
envman pm start --name api -s myapp:prod -s .env.local -- bun index.js  # file source

# Inspection
envman pm ls                      # Table view (ANSI colored status)
envman pm describe <name>         # Detail view (PID, uptime, env hash, etc)
envman pm logs <name>             # Snapshot last 100 lines (out + err)
envman pm logs <name> -f          # Follow live (SSE stream)
envman pm logs <name> -n 500 --out # Custom count, stdout only

# Lifecycle
envman pm restart <name>          # Stop + start atomic
envman pm stop <name>             # SIGTERM → SIGKILL after 5s
envman pm reset <name>            # Reset quarantine flag
envman pm delete <name>           # Stop + remove from management

# Persistence
envman pm save                    # Force persist state to disk
                                  # (auto-save debounced 1s on each change)

# Env sync from envman server
envman pm sync                    # Re-fetch env for all processes dengan envSources
envman pm sync <name>             # Sync hanya satu process
envman pm sync --dry-run          # Report changes without restarting
```

### Supervisor behavior

| Behavior | Default |
|---|---|
| Auto-restart on crash | enabled |
| Restart backoff | exponential 1s → 60s cap, reset setelah 10s uptime |
| Crash-loop quarantine | 5 restarts dalam 60s → `quarantined` |
| SIGTERM kill timeout | 5s → escalate ke SIGKILL |
| Env inherit | explicit allowlist: PATH, HOME, LANG, LC_*, TERM, TZ, USER, SHELL, LOGNAME |
| Env strip always | ENVMAN_TOKEN, ENVMAN_SERVER, ENVMAN_PM_HOME |
| Env metadata | ENVMAN_PM_ID, ENVMAN_PM_NAME injected |
| Log rotation | 10MB × 5 files, oldest gzipped background |
| State save | atomic tmp+rename, .bak fallback, both corrupt = refuse start |
| Resurrect on daemon start | kill orphan child + respawn (no adopt) |

### Audit trail

Daemon mengirim event lifecycle ke server envman via `POST /api/envman/pm/audit`:

- `PM_DAEMON_STARTED`, `PM_DAEMON_STOPPED`
- `PM_PROCESS_STARTED`, `PM_PROCESS_STOPPED`, `PM_PROCESS_RESTARTED`, `PM_PROCESS_DELETED`
- `PM_SYNC_TRIGGERED`

Event tampil di dashboard envman → audit logs view. Fire-and-forget (kegagalan tidak mengganggu lifecycle).

### Auth model (defense-in-depth)

1. **Primary**: socket file `chmod 0600` — kernel-enforced UID gating
2. **Secondary**: header token `X-Envman-Daemon-Auth` di setiap request (constant-time compare)

POC #39 confirmed Bun belum expose SO_PEERCRED. Kombinasi 1+2 cukup untuk threat model personal/self-host.

### Daemon control via API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/daemon/health` | uptime, pid, version, processCount, diskFull |
| `POST` | `/v1/daemon/shutdown` | graceful shutdown (drain in-flight) |
| `POST` | `/v1/process/start` | spawn new |
| `GET` | `/v1/process` | list all |
| `GET` | `/v1/process/:id` | detail |
| `POST` | `/v1/process/:id/{stop,restart,reset}` | lifecycle |
| `DELETE` | `/v1/process/:id` | remove |
| `GET` | `/v1/process/:id/logs/tail` | snapshot last 100 (out + err) |
| `GET` | `/v1/process/:id/logs/stream` | SSE live tail |
| `POST` | `/v1/state/save` | force persist |
| `POST` | `/v1/sync` | re-fetch env from server, restart changed |



### File Execution

Script di ProjectFiles bisa dieksekusi langsung dari CLI tanpa menyimpan ke disk — konten di-pipe ke stdin interpreter:

```bash
# Syntax baru: slug:path/file.ext — tidak perlu -e, slug embedded di arg
envman -- bash myapp:scripts/deploy.sh
envman -- bun myapp:utils/seed.ts

# Dengan inject env vars sekaligus
envman -e myapp:production -- bash myapp:scripts/deploy.sh

# Syntax lama (files:) — tetap didukung
envman -e open-marina:dev -- bash files:deploy        # prefix, project dari -e
envman -e open-marina:dev -- bun files:ts-utils/migrate.ts
envman -- bash files:open-marina/deploy/deploy.sh     # explicit slug di files:

# Via alias
envman run open-marina:dev
# stored: -e open-marina:dev -- bash myapp:scripts/deploy.sh
```

**Format referensi (command arg setelah --):**

| Syntax | Keterangan |
|--------|-----------|
| `slug:prefix/file.ext` | Slug eksplisit, ada `/` → **file** |
| `slug:file.ext` | Slug eksplisit, ada extension → **file** |
| `slug:env` | Tidak ada `/` dan tidak ada extension → **environment** (untuk -e) |
| `files:prefix[/file]` | Lama, project diinfer dari `-e project:env` |
| `files:slug/prefix[/file]` | Lama, slug eksplisit |

**Disambiguasi `slug:env` vs `slug:path`:** cukup lihat bagian setelah colon — ada `/` atau ada extension → file reference; sisanya → environment name.

**Interpreter support (zero disk write via stdin):** `bash`, `sh`, `zsh`, `bun`, `node`, `python3`, `python`, `deno`. Interpreter lain: fallback ke temp file dengan permission `0600`, dihapus segera setelah eksekusi.

**Prefix** diset per entry di UI (Files tab dalam project detail). Auto-generate dari judul, bisa diedit manual, tidak berubah saat rename judul.

### npm Imports untuk Bun Scripts

Script Bun di Files bisa langsung import dari npm tanpa setup `node_modules` di mesin user. CLI mendeteksi bare-name imports (bukan relative, bukan `bun:`/`node:`, bukan Node built-in) dan otomatis pass flag `--install=fallback` ke Bun.

**Cara kerja `--install=fallback`:**
- Bun resolve package yang **ada** di local `node_modules` (kalau user di dalam project) → pakai itu
- Package yang **tidak ada** di local `node_modules` → install ke global cache `~/.bun/install/cache`
- **Tidak pollute** local `node_modules` user
- Bekerja bahkan kalau user kebetulan punya `~/node_modules` (akibat global install accidental) atau di dalam project Node lain

```ts
// files:scripts/migrate.ts
import { z } from "zod@^3.22"                              // ✅ install ke global cache
import _ from "lodash@4.17.21"                             // ✅ pinned version
import fs from "node:fs"

const env = z.object({ DATABASE_URL: z.string() }).parse(process.env)
const cfg = await Bun.file("./config.json").json()         // ✅ baca file user CWD
const schema = await Bun.file("./prisma/schema.prisma").text()  // ✅
```

**Script jalan langsung di CWD user** — tidak ada workspace isolation, tidak ada symlink magic. Akses file relative path (`./config.json`) bekerja natural.

**Saat dependency conflict**: kalau user's local `node_modules` punya version yang beda dengan yang script expect (mis. user pakai zod@2 tapi script `import { z } from "zod@^3"`), Bun pakai inline version pin untuk resolve ke cache global. Best practice: **pin version inline**:

```ts
import { z } from "zod@^3.22"     // ✅ explicit, reproducible, bypass local version
import _ from "lodash"             // ⚠️ pakai apapun yang ada di local atau latest
```

**Cross-platform**: jalan di macOS/Linux/Windows tanpa perbedaan — tidak ada symlink permission issue.

### Alias Expansion

`envman run myapp:deploy` fetches stored args via `GET /api/envman/aliases/resolve/myapp:deploy`,
then re-parses them as if typed directly after `envman`. Auth resolution uses the same priority
chain (system env → config file).

Extra `-e` sources can be passed at runtime — they are merged **before** stored sources so
stored server sources take precedence (later `-e` wins):

```bash
# .env loads first, then stored server sources override
envman run -e .env open-marina:dev

# local file + extra server env + alias
envman run -e .env.local -e base:dev open-marina:dev
```

## Options

```
-e <project>:<env>   Fetch vars from server (contains ":")
-e <file>            Load vars from local file (no ":")
--server-wins        System env takes priority over merged vars (default: merged wins)
```

## Examples

```bash
# Single source
envman -e myapp:production -- bun run start

# Multiple sources (later -e overrides earlier)
envman -e myapp:base -e myapp:production -- bun dev

# Mix local + remote
envman -e .env.local -e myapp:production -- bun dev

# Auth from local file (ENVMAN_SERVER/TOKEN inside .env.local)
envman -e .env.local -e myapp:production -- bun dev
```

## MCP Server (`envman mcp`)

Stdio MCP (Model Context Protocol) server built into the CLI binary. Primary client: **Claude Code**. Lets AI agents introspect and operate envman without shell exec.

### Setup with Claude Code

Add to `.mcp.json` (project-scoped) or `~/.claude/mcp.json` (global):

```json
{
  "mcpServers": {
    "envman": {
      "command": "envman",
      "args": ["mcp"]
    }
  }
}
```

For write access (mutate vars, start/stop pm processes):

```json
{
  "mcpServers": {
    "envman": {
      "command": "envman",
      "args": ["mcp", "--write"]
    }
  }
}
```

Token resolution (highest priority first):
1. `ENVMAN_SERVER` + `ENVMAN_TOKEN` env vars (can set per-MCP via `"env": {...}` in mcp.json)
2. `~/.config/envman/config.json` (from `envman login`)

### Tools

**Readonly (always loaded)** — 15 tools:

- `whoami`, `server_info` — identity + MCP server self-description
- `projects_list`, `project_get` — project discovery
- `vars_list`, `vars_export`, `vars_diff` — environment variables (secrets masked by default)
- `aliases_list`, `alias_resolve` — CLI aliases
- `files_list`, `file_resolve` — project files (scripts)
- `pm_daemon_status`, `pm_list`, `pm_describe`, `pm_logs` — pm daemon introspection

**Write (requires `--write` AND token canWrite=true)** — 13 tools:

- `var_set`, `var_delete` — environment variables
- `alias_create`, `alias_update`, `alias_delete` — CLI aliases
- `file_create` — project files
- `pm_start`, `pm_stop`, `pm_restart`, `pm_reset`, `pm_delete`, `pm_sync` — process lifecycle
- `pm_daemon_start`, `pm_daemon_stop` — daemon control

All write tool calls emit `MCP_*` audit events to the envman server (visible in dashboard audit log with AI badge).

### Tool annotations (for Claude Code approval UX)

| Annotation | Effect |
|---|---|
| `readOnlyHint: true` | Eligible for auto-approve (user-configurable in Claude Code) |
| `destructiveHint: true` | Always-ask in approval prompt |
| `idempotentHint: true` | Claude may retry on transient failure |
| `openWorldHint: true` | Tool reaches an external system (envman server) |

Destructive tools: `var_delete`, `alias_delete`, `pm_delete`, `pm_daemon_stop`.

### Security

- Token resolution = same as CLI; MCP server does not generate or store credentials
- `vars_export` defaults to masked secrets — pass `revealSecrets: true` for plaintext (audit logged)
- All write tool calls audited (action prefix `MCP_*`)
- Server name `envman-mcp-server` advertised to client
- Stdout reserved for JSON-RPC; logs go to stderr (logger redacts `Bearer` + `em_*` tokens)

### Troubleshooting

```bash
# Smoke test (manual)
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}' \
  | envman mcp 2>/dev/null

# Verbose logging
envman mcp --debug

# Version + help
envman mcp --version
envman mcp --help
```

Logs always go to stderr — safe to redirect (`2>~/envman-mcp.log`) without breaking the protocol.
