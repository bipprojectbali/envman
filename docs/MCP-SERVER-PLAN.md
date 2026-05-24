# MCP Server (envman mcp) — Plan & Bug Mitigation

Status: **PLANNING** — Dokumen ini single source of truth untuk fitur `envman mcp`
(stdio MCP server di CLI binary). Primary client: Claude Code. Goal: tiap fitur
yang sudah ada di CLI bisa di-introspect dan dioperasikan oleh AI agent tanpa shell exec.

---

## 1. Filosofi & Konstrain Mutlak

1. **stdio only.** Tidak ada HTTP/SSE transport. Claude Code spawn `envman mcp`
   sebagai child process. JSON-RPC 2.0 di stdin/stdout. Logging ke stderr.
2. **Primary client = Claude Code.** Tool ergonomics dioptimasi untuk agent:
   deskripsi kaya, schema strict, annotations lengkap, output structured.
3. **Reuse, jangan rewrite.** `@modelcontextprotocol/sdk ^1.29.0` sudah di
   dependencies project (dari `scripts/mcp/server.ts`). Pola `ToolModule` di
   `scripts/mcp/tools/shared.ts` diadopsi. Zod 3.25.76 sudah tersedia transitively.
4. **Default readonly.** Write tools opt-in via flag `--write`. Default safe
   untuk autonomous agent. Destructive ops butuh explicit user-intent.
5. **Auth chain identik CLI.** Tidak ada credential system baru. Re-use
   `resolveAuth()` chain (local env → process.env → config.json).
6. **Zero new runtime dep.** SDK + zod sudah ada. Tidak nambah package.
7. **Stability > completeness.** Bug catalog dibuat dulu, mitigasi di desain,
   bukan ditemukan saat user pakai.

### Keputusan yang sudah disetujui

| # | Keputusan | Alasan |
|---|---|---|
| K1 | Subcommand `envman mcp` (sejajar `pm`), bukan `envman pm mcp` | Scope lebih luas dari pm — mencakup projects/vars/aliases/files juga |
| K2 | Default readonly, `--write` untuk full set | Aman didelegasikan ke autonomous agent |
| K3 | Tidak ada hidden subcommand (langsung inline, tidak fork) | Stdio process = MCP loop itu sendiri, tidak perlu child |
| K4 | Server name: `envman-mcp-server` (Anthropic naming convention `{service}-mcp-server`) | Standar registry, tidak collision |
| K5 | Audit semua write tool calls ke endpoint baru `POST /api/envman/mcp/audit` | Track AI agent actions di dashboard envman |

---

## 2. Arsitektur

### 2.1 Topologi

```
┌──────────────┐  spawn       ┌────────────────────┐  HTTPS  ┌──────────────┐
│ Claude Code  │ ───stdio────►│  envman mcp        │ ───────►│ envman server│
│  (host)      │ ◄JSON-RPC───►│  (McpServer @stdio)│         │  (HTTP API)  │
└──────────────┘              │                    │         └──────────────┘
                              │                    │  unix    ┌──────────────┐
                              │                    │ socket  ►│  pm daemon   │
                              │                    │ ◄───────│  (HTTP+SSE)  │
                              └────────────────────┘         └──────────────┘
                                       │
                                  stderr (logs)
```

Server jalan inline (bukan fork ke child). Stdin EOF → graceful shutdown. SIGTERM/SIGINT → drain in-flight + exit.

### 2.2 File Layout

```
src/mcp/
  index.ts              ← entry: parse args (--write, --debug), boot server
  server-factory.ts     ← buat McpServer + register module sesuai mode
  api-client.ts         ← apiCall() non-exiting (variant of apiFetch)
  daemon-client.ts      ← thin wrapper di atas existing DaemonClient
  errors.ts             ← mapping HTTP error → MCP error response
  logger.ts             ← stderr-only structured logger
  pagination.ts         ← shared pagination helper + truncation message
  shared.ts             ← jsonText(), errText(), markdownText(), ToolModule type
  schemas/
    common.ts           ← Pagination, ResponseFormat enum, slug regex, dll
    projects.ts
    vars.ts
    aliases.ts
    files.ts
    pm.ts
  tools/
    meta.ts             ← whoami, server_info
    projects.ts         ← projects_list, project_get
    vars.ts             ← vars_list, vars_export, var_set, var_delete
    aliases.ts          ← aliases_list, alias_resolve, alias_create/update/delete
    files.ts            ← files_list, file_resolve, file_create
    pm-readonly.ts      ← pm_daemon_status, pm_list, pm_describe, pm_logs
    pm-write.ts         ← pm_start, pm_stop, pm_restart, pm_delete, pm_sync, pm_daemon_start/stop

src/routes/envman/mcp-audit.ts  ← server endpoint POST /api/envman/mcp/audit

tests/mcp/
  schema.test.ts        ← validasi semua zod schemas (strict, describe, error msg)
  api-client.test.ts    ← apiCall throw typed errors, no process.exit
  errors.test.ts        ← HTTP status → MCP error mapping
  tools/                ← per-module integration tests (mock server)
  smoke.test.ts         ← spawn `envman mcp`, JSON-RPC handshake + list_tools
```

### 2.3 CLI subcommand

```
envman mcp                Start MCP server in stdio mode (readonly tools)
envman mcp --write        Include write tools (mutate vars, pm, aliases)
envman mcp --debug        Verbose stderr logging
envman mcp --version      Print MCP server version + tool count, exit
```

Routing di `src/cli.ts`:

```ts
case 'mcp': {
  const { runMcpServer } = await import('./mcp')
  await runMcpServer(args.slice(1))
  return
}
```

### 2.4 Naming convention

| Item | Konvensi | Contoh |
|---|---|---|
| Tool name | `<resource>_<action>` (snake_case, no envman prefix) | `vars_list`, `pm_start`, `whoami` |
| Schema export | `<Resource><Action>Input` / `<Resource><Action>Output` | `VarsListInput`, `PmStartInput` |
| Tool module | `<resource>.ts` | `tools/vars.ts` |
| Server name | `{service}-mcp-server` | `envman-mcp-server` |

Tidak prefix `envman_` di nama tool karena server name sudah `envman` — Claude Code render-nya `envman:vars_list` otomatis.

### 2.5 Mode resolution flow

```
envman mcp [--write] [--debug] starts
   ↓
1. Parse flags → opts = { write: bool, debug: bool }
   ↓
2. resolveAuth() — fail-fast kalau token tidak ada (stderr + exit 1 SEBELUM
   handshake; Claude Code akan tampilkan error di /mcp)
   ↓
3. Probe /api/envman/whoami → dapat { user, canWrite, scopes }
   - 401 → exit 1 dengan pesan "Token invalid"
   - Network error → exit 1 dengan pesan "Cannot reach envman server"
   ↓
4. Probe daemon (optional) — set hasDaemon flag, jangan exit kalau down
   ↓
5. Buat McpServer({ name: "envman-mcp-server", version: PKG_VERSION })
   ↓
6. Register modules berdasarkan opts.write + canWrite:
   - Always: meta, projects, vars (readonly), aliases (readonly), files (readonly), pm-readonly
   - Kalau opts.write && canWrite: + vars-write, aliases-write, files-write, pm-write
   - Kalau opts.write && !canWrite: WARN ke stderr, skip write modules
   ↓
7. transport = new StdioServerTransport()
   ↓
8. server.connect(transport) → JSON-RPC loop dimulai
   ↓
9. process.stdin.on('end') → graceful shutdown
   process.on('SIGTERM' | 'SIGINT') → graceful shutdown
```

---

## 3. Tool Catalog (final list)

### 3.1 Read tools (always loaded)

| Tool | Annotations | Input | Output |
|---|---|---|---|
| `whoami` | RO, idempotent, openWorld | (none) | `{ user, email, role, canWrite, scopes[], tokenName }` |
| `server_info` | RO, idempotent | (none) | `{ envmanServer, daemonRunning, daemonVersion?, toolsCount, mode }` |
| `projects_list` | RO, idempotent, openWorld | `{ search?, tag?, limit, offset }` | paginated `Project[]` |
| `project_get` | RO, idempotent, openWorld | `{ slug }` | `Project + members[] + environments[]` |
| `vars_list` | RO, idempotent, openWorld | `{ slug, env, search?, limit, offset }` | `Var[]` (secrets masked `***`) |
| `vars_export` | RO, idempotent, openWorld | `{ slug, env, revealSecrets: bool (default false) }` | `{ KEY: value }` (server requires `canWrite`/`OWNER`) |
| `vars_diff` | RO, idempotent, openWorld | `{ slug, env, dotenvContent: string }` | categorized diff |
| `aliases_list` | RO, idempotent, openWorld | `{ slug }` | `Alias[]` |
| `alias_resolve` | RO, idempotent, openWorld | `{ ref: "slug:name" }` | `{ args[], project, alias }` |
| `files_list` | RO, idempotent, openWorld | `{ slug, search?, tag?, limit, offset }` | paginated `File[]` (metadata) |
| `file_resolve` | RO, idempotent, openWorld | `{ slug, prefix, filename? }` | `{ content, filename, language, entryTitle }` |
| `pm_daemon_status` | RO, idempotent | (none) | `DaemonHealth` |
| `pm_list` | RO, idempotent | (none) | `ProcessSnapshot[]` |
| `pm_describe` | RO, idempotent | `{ name }` | `ProcessSnapshot` |
| `pm_logs` | RO, idempotent | `{ name, lines?, stream? }` | `{ out: string[], err: string[] }` (TAIL ONLY, no follow) |

### 3.2 Write tools (only with `--write` + token canWrite)

| Tool | Annotations | Notes |
|---|---|---|
| `var_set` | NOT RO, idempotent, NOT destructive, openWorld | Upsert single var. If isSecret=true, value encrypted server-side. |
| `var_delete` | NOT RO, idempotent, **destructive**, openWorld | 404 if not exist (still idempotent in effect). |
| `alias_create` | NOT RO, NOT idempotent, NOT destructive, openWorld | 409 if name exists. |
| `alias_update` | NOT RO, idempotent, NOT destructive, openWorld | Update args/description/tags. |
| `alias_delete` | NOT RO, idempotent, **destructive**, openWorld | |
| `file_create` | NOT RO, NOT idempotent, NOT destructive, openWorld | 409 if prefix duplicate. |
| `pm_start` | NOT RO, NOT idempotent, NOT destructive | 409 if name exists. |
| `pm_stop` | NOT RO, idempotent, NOT destructive | Already stopped → no-op success. |
| `pm_restart` | NOT RO, NOT idempotent, NOT destructive | Atomic stop+start. |
| `pm_delete` | NOT RO, idempotent, **destructive** | Stop + remove from management + delete logs. |
| `pm_sync` | NOT RO, idempotent, NOT destructive | Re-fetch env from server, restart changed processes. |
| `pm_reset` | NOT RO, idempotent, NOT destructive | Reset quarantine flag. |
| `pm_daemon_start` | NOT RO, idempotent, NOT destructive | No-op if already running. |
| `pm_daemon_stop` | NOT RO, idempotent, **destructive** | All managed processes stop. |

### 3.3 Annotation semantik

| Annotation | Effect di Claude Code | Kapan true |
|---|---|---|
| `readOnlyHint` | Auto-approve eligible (config user) | Tidak modify state di server/daemon/disk |
| `destructiveHint` | Always-ask di approval prompt | Hapus / overwrite / irreversible |
| `idempotentHint` | Claude boleh retry on transient fail | Sama input + sama waktu = sama hasil |
| `openWorldHint` | "Tool ini akses dunia luar" | Akses envman server (HTTP) ATAU daemon (IPC) — semua envman tools = true |

### 3.4 Tool description template (penting untuk agent ergonomics)

Setiap tool wajib punya description format ini:

```
<One-line summary>

ARGS:
  - field: type — description (constraint, example)

RETURNS:
  - field: type — description

EXAMPLES:
  - <scenario 1>: { input } → { output sketch }
  - <scenario 2>: ...

ERRORS:
  - 404: <when>
  - 403: <when, what scope/permission needed>
  - 409: <conflict scenarios>

NOTES:
  - <gotchas, side effects, security implications>
```

**Alasan**: Claude pakai description untuk decide call yang mana + bagaimana
recover dari error. Description kaya = agent autonomy lebih tinggi + lebih sedikit
silly mistakes.

---

## 4. Schema & Validation Convention

### 4.1 Style canonical

**WAJIB pakai `z.object({...}).strict()` + per-field `.describe()`.** Tidak boleh
raw field map (style lama di scripts/mcp/server.ts adalah deprecated — kita
modernize).

```ts
// src/mcp/schemas/vars.ts
import { z } from 'zod'
import { SlugRef, EnvName, Pagination } from './common'

export const VarsListInputSchema = z.object({
  slug: SlugRef,
  env: EnvName,
  search: z.string().optional()
    .describe('Substring match on KEY (case-insensitive). Omit to list all.'),
  ...Pagination.shape,
}).strict()

export type VarsListInput = z.infer<typeof VarsListInputSchema>
```

`.strict()` → reject unknown keys = mitigasi rug-pull (server tiba-tiba kirim
extra param) dan typo dari Claude.

### 4.2 Common building blocks (`src/mcp/schemas/common.ts`)

```ts
export const SlugRef = z.string()
  .min(1).max(64)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/, 'Slug must be lowercase alphanumeric with optional hyphens')
  .describe('Project slug (URL-safe identifier, e.g., "my-app").')

export const EnvName = z.string()
  .min(1).max(50)
  .regex(/^[a-z0-9][a-z0-9_-]*$/i, 'Env name must be alphanumeric')
  .describe('Environment name within the project (e.g., "production", "dev").')

export const Pagination = z.object({
  limit: z.number().int().min(1).max(200).default(50)
    .describe('Max items per page (default 50, max 200).'),
  offset: z.number().int().min(0).default(0)
    .describe('Items to skip (for pagination).'),
})

export const ResponseFormat = z.enum(['markdown', 'json'])
  .default('markdown')
  .describe('Output format. markdown for human reading, json for structured parsing.')
```

### 4.3 Output schema

Tools yang return structured data WAJIB declare `outputSchema` juga. Ini agar
Claude Code render output dengan tepat dan validation roundtrip.

```ts
server.registerTool('vars_list', {
  title: 'List environment variables',
  description: ...,
  inputSchema: VarsListInputSchema,
  outputSchema: VarsListOutputSchema,  // ← penting!
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
}, handler)
```

---

## 5. Response Format Convention

### 5.1 Dual content (structured + text)

```ts
return {
  content: [{ type: 'text', text: humanReadable }],   // markdown atau JSON string
  structuredContent: typedData,                        // raw typed object
}
```

Claude consume `structuredContent` untuk reasoning, `content[].text` untuk display.

### 5.2 Character limit + pagination

`src/mcp/constants.ts`:

```ts
export const CHARACTER_LIMIT = 25_000   // per response (Anthropic ref)
export const MAX_PAGE_SIZE = 200
export const DEFAULT_PAGE_SIZE = 50
```

Helper:

```ts
function truncated<T>(items: T[], total: number, offset: number, limit: number, render: (t: T) => string) {
  const rendered: string[] = []
  let bytes = 0
  let count = 0
  for (const item of items) {
    const s = render(item)
    if (bytes + s.length > CHARACTER_LIMIT) break
    rendered.push(s)
    bytes += s.length
    count++
  }
  const has_more = count < items.length || (offset + limit) < total
  return {
    text: rendered.join('\n'),
    truncated: count < items.length,
    truncation_message: count < items.length
      ? `Showing ${count} of ${items.length} items. Use offset=${offset + count} or add filters.`
      : undefined,
    structured: { items: items.slice(0, count), total, count, offset, has_more, next_offset: has_more ? offset + count : undefined },
  }
}
```

### 5.3 Error response

Pakai SDK convention: throw → SDK wrap jadi MCP error. Untuk semantic error,
return content dengan `isError: true`:

```ts
return {
  isError: true,
  content: [{ type: 'text', text: 'Error: Project "xxx" not found. Use projects_list to see available slugs.' }],
}
```

Format ini Claude bisa parse dan recover. Throw raw exception = JSON-RPC error,
Claude tidak dapat hint cara fix.

---

## 6. Katalog Bug + Mitigasi

50+ bug scenarios, dikategorikan. Setiap entry: severity, akar masalah,
mitigasi konkret, cara verifikasi.

### 6.1 IPC / Transport Bugs (B-series)

| # | Bug | Severity | Mitigasi | Verifikasi |
|---|---|---|---|---|
| B1 | `console.log` corrupt stdout → handshake fail | CRITICAL | Lint rule: ban `console.log` di `src/mcp/`. Gunakan `logger.ts` yang hanya tulis ke `process.stderr`. CI grep. | Test: spawn `envman mcp`, parse stdin → harus JSON-RPC valid line per line |
| B2 | Dependency tidak sengaja tulis stdout (`prisma` warning, `dotenv` info) | HIGH | Tidak import `prisma` atau library noisy di MCP path. Lazy import + redirect `process.stdout.write` override (defensive) | Snapshot stdout output → 100% valid JSON-RPC |
| B3 | Payload >800-1100 bytes silently dropped di Claude Desktop versi tertentu | MEDIUM | CHARACTER_LIMIT 25KB conservative; chunked output via `truncation_message` untuk list besar. Single var detail OK karena <1KB | Manual test di Claude Code latest + Desktop |
| B4 | Stdin EOF tidak handled → zombie process | HIGH | `process.stdin.on('end', () => server.close().then(() => process.exit(0)))` | Test: spawn, close stdin, `ps` → process gone within 1s |
| B5 | Unhandled exception/rejection kill server (stdio no auto-reconnect) | CRITICAL | `process.on('uncaughtException' / 'unhandledRejection', ...)` → log stderr + send MCP error if mid-call + JANGAN exit | Test: inject error in handler → server tetap respond next call |
| B6 | SIGTERM/SIGINT tidak graceful → in-flight call lost | MEDIUM | Signal handler: stop accepting new, await in-flight (max 5s), then exit | Test: send SIGTERM mid-call, expect response sebelum exit |
| B7 | EPIPE saat stdout closed by parent | MEDIUM | Catch EPIPE di process.on('error') → log stderr + exit clean | Test: kill parent, child exit code 0 |
| B8 | Buffer melebihi pipe limit (macOS 64KB) | LOW | `outputSchema` validasi size + truncation helper sebelum return | Unit test render() never exceed 25KB |
| B9 | JSON-RPC ID collision saat parallel calls | LOW | SDK handle ini, tapi sanity check: tidak ada shared mutable state cross-handler | Concurrent test 50 calls bersamaan |

### 6.2 Auth / Authorization (A-series)

| # | Bug | Severity | Mitigasi | Verifikasi |
|---|---|---|---|---|
| A1 | `apiFetch` panggil `process.exit(1)` saat 401 → kill seluruh MCP server | CRITICAL | New `src/mcp/api-client.ts:apiCall()` throw typed errors (`AuthError`, `NotFoundError`, `ApiError`). Tidak pernah exit. | Test: 401 response → throw, server tetap hidup |
| A2 | Token expired saat session berjalan | HIGH | Cache whoami result. Tiap 401 → invalidate cache + return helpful error. Tidak refresh token (envman pakai static tokens). | Test: revoke token mid-session → tool return descriptive error |
| A3 | `canWrite=false` token tapi user pakai `--write` flag | MEDIUM | Probe whoami di startup, kalau `!canWrite && --write` → WARN ke stderr "Token is readonly, write tools skipped". Tidak register write tools. | Test: readonly token + --write → list_tools tidak include write tools |
| A4 | Token scopes restrict project access — tool list project yang tidak accessible | MEDIUM | Tidak filter di MCP side (mahal). Tergantung server 403 enforcement. Tool description jelaskan: "Returns only accessible projects." | Test: scoped token call projects_list → server return subset |
| A5 | Daemon token mismatch (config corrupt) | LOW | DaemonClient sudah throw `DaemonAuthError` → return MCP error dengan hint "restart daemon" | Test: corrupt daemon.token → tool return clear error |
| A6 | ENVMAN_TOKEN/SERVER bocor ke tool response (mis. dari env list) | HIGH | Tidak ada tool yang return env vars dari `process.env`. Strip eksplisit di logger. | Audit semua tool: no `process.env` leak |
| A7 | Server URL berubah saat session (config.json edited) | LOW | Read config sekali di startup, cache. Restart MCP untuk pickup change. Doc note. | — |
| A8 | Multiple `envman mcp` instances concurrent (Claude Code restart) | LOW | Tidak ada lock — masing-masing instance independent, baca config sama. Aman karena read-mostly. Daemon HTTP handle concurrent. | Test: spawn 3 instance paralel → semua respond |

### 6.3 Schema / Input Validation (S-series)

| # | Bug | Severity | Mitigasi | Verifikasi |
|---|---|---|---|---|
| S1 | Schema field map style (raw zod) vs `z.object().strict()` inconsistent | HIGH | Lint convention: SEMUA schema pakai `z.object().strict()`. Type test snapshot. | Test contract: tiap tool's inputSchema instanceof ZodObject + has `.strict()` |
| S2 | `.strict()` missing → silently accept unknown keys | HIGH | Same as S1 + ESLint custom rule `mcp-schemas-strict` (optional) | Schema test asserts `unknownKeys === 'strict'` |
| S3 | `.describe()` missing → Claude tidak tahu field semantics | MEDIUM | Code review checklist. Snapshot test: tiap field punya description non-empty. | Test: for each tool, schema.shape iterate, assert describe |
| S4 | Constraint validation absent (mis. limit > 200) | MEDIUM | Zod `.min().max()` di Pagination + per-field. Test boundary. | Unit test invalid input → ZodError dengan pesan jelas |
| S5 | Zod error message generic ("invalid") tidak instruktif | MEDIUM | Per-validator pass message: `.min(2, "Query must be at least 2 chars")` | Sample error message review |
| S6 | Optional vs nullable confusion (`undefined` vs `null`) | LOW | Konvensi: optional fields = `.optional()`, jangan pakai `.nullable()` | Schema review |
| S7 | Output tidak match outputSchema → SDK silent atau drop | HIGH | `outputSchema` di semua tools + runtime validate output sebelum return (defensive) | Test: handler return invalid shape → caught + return isError |
| S8 | Default value missing untuk field optional dengan semantic non-zero (mis. limit=0) | MEDIUM | Sentinel: optional fields punya `.default(50)` yang masuk akal | Schema review |

### 6.4 Error Handling (E-series)

| # | Bug | Severity | Mitigasi | Verifikasi |
|---|---|---|---|---|
| E1 | Throw generic `Error` di handler → SDK wrap jadi -32603 internal error, Claude tidak dapat info | HIGH | Semua handler wrap di try/catch + return `{ isError: true, content: [...] }` dengan pesan instruktif | Test: trigger known error path, response punya isError dan hint |
| E2 | HTTP 404 vs 401 vs 500 di server return error sama di tool | MEDIUM | `mapHttpError(status, body)` di `errors.ts`: 404 → "not found, list X to see available"; 403 → "permission denied, scope/canWrite needed"; 401 → "token invalid"; 500 → "server error, retry later" | Unit test mapping |
| E3 | Network error (envman server unreachable) tidak distinguishable dari 500 | MEDIUM | Catch `fetch` reject (TypeError) → spesific message "Cannot reach envman at <url>" | Test: bad URL → clear error |
| E4 | Timeout default Node fetch tidak terbatas → tool call hang | HIGH | Semua `fetch` pakai `AbortSignal.timeout(15_000)` (15s untuk read, 30s untuk pm operations) | Test: slow server (sleep 20s) → tool timeout dengan pesan |
| E5 | Daemon down saat tool pm_* dipanggil → exception propagate | HIGH | `buildClient()` pattern: catch `DaemonNotRunningError` → return `{ isError: true, text: "Daemon not running. Use pm_daemon_start." }` | Test: daemon down → pm_list return error helpful |
| E6 | Zod parse error di output validation = bug at developer, not user | LOW | Log to stderr verbose + return generic "Internal error, please report" — jangan expose stack trace ke Claude | Test |
| E7 | Audit POST gagal → tool execution gagal | MEDIUM | Audit fire-and-forget (catch silent), tidak block tool response | Test: audit endpoint 500 → tool tetap sukses |

### 6.5 Description Quality (D-series, agent ergonomics)

| # | Risk | Mitigasi | Verifikasi |
|---|---|---|---|
| D1 | Tool name generic → Claude bingung pilih | Naming: `<resource>_<verb>` consistent. No `query`, `find`, `do_thing`. | Code review checklist |
| D2 | Description hanya 1 baris → Claude tidak tahu kapan pakai | Description WAJIB minimal include: ARGS, RETURNS, EXAMPLES, ERRORS sections (template di §3.4) | Test: tiap tool's description ≥ 200 chars |
| D3 | Output format inconsistent antar tool | Konvensi: markdown default, json opt-in via `response_format` field common | Snapshot test |
| D4 | Error message tidak punya hint recovery | E2 mapping selalu kasih next action ("Use X to see Y") | Manual review |
| D5 | Annotation salah (mis. `pm_delete` readOnly=true) | Audit table di §3.1-3.2 sebagai ground truth + contract test compare | Test contract |
| D6 | Tools terlalu generic (mis. `query({entity, filter})`) | Spesifik: `vars_list`, `aliases_list`. Discoverable via list_tools. | Design review |
| D7 | Missing examples in description → Claude harus trial-and-error | Section EXAMPLES di tiap description, minimal 2 scenarios | Review |
| D8 | Conflicting hints (mis. destructiveHint=true + idempotentHint=true) | Allowed combination per spec (overwrite file = both). Doc clarify di description | — |

### 6.6 Security (Sec-series)

| # | Risk | Mitigasi | Verifikasi |
|---|---|---|---|
| Sec1 | `vars_list` accidentally reveal secrets (UI mask logic lompat) | Server-side: `requireEnvAuth` + role check, VIEWER mask `***`. MCP tidak override. | Test: VIEWER token + vars_list → all secrets `***` |
| Sec2 | `vars_export` reveal full secret tanpa user consent | `revealSecrets: true` flag explicit (default false) + destructiveHint=false but description WARN "secrets exposed in response" | Test: default → masked, explicit → revealed |
| Sec3 | Audit trail missing untuk write actions | Tiap write tool emit `POST /api/envman/mcp/audit` dengan action+detail | Integration test: var_set → AuditLog row |
| Sec4 | Tool input dari LLM untrusted (path traversal di file_resolve) | Zod regex strict + server-side validation (sudah ada) | Test: `prefix: "../etc/passwd"` → ZodError before fetch |
| Sec5 | Token leak di stderr log saat debug mode | Logger redact: pattern `Bearer .+`, `em_[a-f0-9]+` → `Bearer ***` | Test: log line with token → masked |
| Sec6 | Description return secret di error message | Server error body sometimes echo input. mapHttpError truncate body to 200 chars + redact patterns | Test: 400 error with secret → safe |
| Sec7 | Server returns 401 with token in URL (?token=...) | Tidak pakai query token, semua Bearer header. Audit semua tool. | Code grep |
| Sec8 | Rug-pull: server tiba-tiba return extra fields yang sensitif | `.strict()` di outputSchema reject + sanitize. Audit per response. | Test |

### 6.7 Performance (P-series)

| # | Risk | Mitigasi | Verifikasi |
|---|---|---|---|
| P1 | Startup latency >2s → Claude Code timeout (5s default) | Lazy import per module (sudah pattern di CLI). Probe whoami parallel dengan daemon probe. | Time `envman mcp` start → tools_list response: <1s |
| P2 | Tool response besar (1000 proses, 10K vars) | Pagination default 50, max 200. Truncation message wajib. | Test: pm_list 100 proses → paginated |
| P3 | SSE log follow tidak supported di MCP (stream-in-tool tidak fit JSON-RPC) | `pm_logs` TAIL ONLY (snapshot last N). Follow via CLI `envman pm logs -f`. Doc note. | — |
| P4 | Cold daemon probe lambat (3-5s) di startup | Probe optional, 1s timeout. Kalau gagal, `hasDaemon=false`, pm tools tetap registered (akan error at call time). | Test: daemon down → startup <2s |
| P5 | Concurrent tool calls saturate HTTP keepalive | Default Node fetch single connection per host, OK. Tidak pakai connection pool kustom. | Stress test 10 parallel calls |
| P6 | Repeated whoami per call → overhead | Cache whoami result 60s (memory), invalidate on 401 | Unit test cache hit |

### 6.8 Resource Leaks (R-series)

| # | Leak | Mitigasi | Verifikasi |
|---|---|---|---|
| R1 | HTTP keepalive connection idle leak | Bun's fetch handle ini; explicit `AbortController` per request | Test no leak after 100 calls |
| R2 | DaemonClient unix socket fd leak | DaemonClient sudah short-lived, fetch open+close per call | Test |
| R3 | Process listener accumulate (SIGTERM, SIGINT) | Register sekali di main, jangan per-call | Test: 100 calls → listenerCount stable |
| R4 | Logger fd kalau file logger (tidak pakai — kita stderr only) | N/A | — |
| R5 | Promise reject not caught → memory leak | `unhandledRejection` handler catch + log | Stress test |
| R6 | Zod schema compile cache grows | Schema module-scope, single compile. OK. | — |
| R7 | Auth cache map tidak bounded | Single user per session (1 whoami entry). OK. | — |

### 6.9 Concurrency (C-series)

| # | Race | Mitigasi | Verifikasi |
|---|---|---|---|
| C1 | Parallel tool calls modify shared state | Tidak ada shared mutable state lintas handler kecuali auth cache (read-mostly, ok) | Code review |
| C2 | `pm_start` racing dengan `pm_start` same name | Daemon-side per-name lock (sudah ada di pm) → 409 conflict | Test |
| C3 | `var_set` + `vars_list` race → stale list | Server transaction handle; MCP tidak buffer. Tool description note "after writes, list reflects latest". | — |
| C4 | `whoami` cache expired race (TOCTOU) | Best-effort, 401 next call → invalidate. Acceptable. | — |
| C5 | Stdin EOF saat tool call in-flight | Signal handler wait inflight max 5s | Test |

### 6.10 Compatibility (Compat-series)

| # | Issue | Mitigasi |
|---|---|---|
| Compat1 | Server name collision dengan built-in integration | Name `envman` cukup unik. Verify di Claude Code MCP registry tidak ada conflict. |
| Compat2 | Older Claude Code tidak support outputSchema | Set tetap, klien yang tidak support akan ignore. SDK fallback. |
| Compat3 | SDK breaking change saat upgrade | Pin `@modelcontextprotocol/sdk@^1.29.0` (caret). Contract test catch break. |
| Compat4 | Bun stdio behavior differ from Node | Smoke test: `bun run src/mcp/index.ts` valid JSON-RPC. Compiled binary `envman mcp` juga. |
| Compat5 | Windows compatibility | Out of scope (project POSIX-only) |

---

## 7. Audit Trail

### 7.1 Endpoint baru server

`src/routes/envman/mcp-audit.ts`:

```ts
const MCP_AUDIT_ACTIONS = new Set<string>([
  'MCP_SESSION_STARTED',
  'MCP_VAR_SET', 'MCP_VAR_DELETED',
  'MCP_ALIAS_CREATED', 'MCP_ALIAS_UPDATED', 'MCP_ALIAS_DELETED',
  'MCP_FILE_CREATED',
  'MCP_PM_START', 'MCP_PM_STOP', 'MCP_PM_RESTART', 'MCP_PM_DELETE',
  'MCP_PM_SYNC', 'MCP_PM_RESET',
  'MCP_PM_DAEMON_START', 'MCP_PM_DAEMON_STOP',
  'MCP_VARS_REVEALED',  // ← penting: track kapan secrets di-reveal
])

POST /api/envman/mcp/audit
  body: { action, detail?, slug?, env?, processName? }
  auth: requireEnvAuth
  rate-limit: 100 req/min/token
```

### 7.2 Client-side audit emission

```ts
// src/mcp/audit.ts
export function emitAudit(cfg, action, detail) {
  // fire-and-forget — never block tool response, never throw
  fetch(`${cfg.server}/api/envman/mcp/audit`, {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ action, detail }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {})
}
```

### 7.3 Audit view di UI

Dashboard `/dev` → Audit Logs sudah ada. Action prefix `MCP_` di-filter
otomatis. Tampilkan badge "AI" di sebelah entry MCP_*.

---

## 8. Implementasi Bertahap

Total estimasi: 6-8 hari kerja (bisa lebih cepat dengan AI pair).

### Phase 0 — Skeleton (1 hari)

**Goal**: `envman mcp` start, handshake JSON-RPC, expose 1 tool (whoami).

Tasks:
1. `src/mcp/index.ts` — argv parse, lifecycle
2. `src/mcp/logger.ts` — stderr-only logger
3. `src/mcp/server-factory.ts` — McpServer instantiation
4. `src/mcp/api-client.ts` — non-exiting apiCall
5. `src/mcp/auth.ts` — wrap resolveAuth, probe whoami
6. `src/mcp/errors.ts` — mapHttpError
7. `src/mcp/tools/meta.ts` — whoami, server_info
8. `src/cli.ts` — add `case 'mcp'`
9. Smoke test: spawn `bun src/cli.ts mcp`, JSON-RPC init handshake, list_tools

**Exit criteria**:
- [ ] Spawn + handshake under 1s
- [ ] `whoami` tool returns user info
- [ ] stderr punya log, stdout PURE JSON-RPC
- [ ] SIGTERM graceful exit

### Phase 1 — Read tools (2 hari)

Tools: projects_list, project_get, vars_list, vars_export, vars_diff,
aliases_list, alias_resolve, files_list, file_resolve, pm_daemon_status,
pm_list, pm_describe, pm_logs.

Tasks:
1. Common schemas (Pagination, SlugRef, EnvName, ResponseFormat)
2. Per-resource schema files
3. Per-resource tool files
4. Pagination helper (truncated())
5. Audit emission untuk MCP_VARS_REVEALED
6. Tests per module

**Exit criteria**:
- [ ] Semua 13 readonly tools registered
- [ ] All inputSchema = z.object().strict() + outputSchema declared
- [ ] All descriptions ≥ 200 chars dengan template lengkap
- [ ] All tools handle daemon-down + envman-server-down gracefully

### Phase 2 — Write tools (2 hari)

Tools: var_set, var_delete, alias_create/update/delete, file_create,
pm_start, pm_stop, pm_restart, pm_delete, pm_sync, pm_reset,
pm_daemon_start, pm_daemon_stop.

Tasks:
1. `--write` flag parsing
2. Server endpoint `POST /api/envman/mcp/audit` + allowlist
3. Per-tool emit audit
4. Write tool schemas + handlers
5. canWrite probe + warning di startup
6. Tests + scope enforcement

**Exit criteria**:
- [ ] `--write` flag toggle write tools
- [ ] Readonly token + --write → skip + warn
- [ ] Tiap write call emit MCP_* audit event
- [ ] Tests: vars_set persist → vars_list reflect

### Phase 3 — Hardening (1-2 hari)

Tasks:
1. **Contract test**: snapshot semua tool shapes (name, annotations, schema)
2. **Stress test**: 100 parallel tool calls
3. **Chaos test**:
   - Daemon kill during pm_list → graceful error
   - envman server 500 → mapped error
   - Token revoke mid-session → 401 mapping
   - Stdin abrupt close → exit clean
   - Large response (10K vars) → truncated
4. **Description audit**: semua tool review, kekayaan deskripsi
5. **Documentation**:
   - `docs/MCP-SERVER.md` user guide (cara setup di Claude Code)
   - Update `CLAUDE.md` section
   - Update `docs/CLI.md` add mcp subcommand
6. **Manual verification**:
   - Test di Claude Code real (project-scoped `.mcp.json`)
   - Walkthrough scenarios di §9

**Exit criteria**:
- [ ] Contract test pass
- [ ] Chaos scenarios all green
- [ ] Manual test di Claude Code: 10 representative tool calls sukses
- [ ] Docs lengkap

### Phase 4 — Polish (deferred / nice-to-have)

- Resource exposure (`@envman:project:xxx` references)
- Prompts (slash-command templates)
- HTTP transport option untuk remote agent
- Rate limit di MCP client side

---

## 9. Strategi Testing

### 9.1 Unit tests

Per module:
- Schema validation (input valid/invalid, error messages)
- Error mapping (HTTP status → MCP error)
- Pagination + truncation
- Audit emission (mocked fetch)

Target coverage: 80%.

### 9.2 Integration tests

`tests/mcp/tools/<module>.test.ts`:
- Mock envman server via `createTestApp()` (existing pattern)
- Mock daemon via in-memory ProcessManager
- Call tool handler directly (bypass SDK transport)
- Assert response shape + isError + structuredContent

### 9.3 Smoke test (spawn real binary)

`tests/mcp/smoke.test.ts`:
- Spawn `bun src/cli.ts mcp` (NODE_ENV=test)
- Send JSON-RPC `initialize` → expect handshake response
- Send `tools/list` → expect tool array
- Send `tools/call` whoami → expect user info
- Close stdin → expect exit 0 within 1s

Patokan dari MCP Inspector: tools/list dan tools/call basic sufficient.

### 9.4 Contract tests

`tests/mcp/contract.test.ts`:
- For each tool: snapshot name, annotations, inputSchema shape, outputSchema shape
- Snapshot stored di `tests/mcp/__snapshots__/`
- Update snapshot HANYA bersama doc + version bump

### 9.5 Manual test di Claude Code

Setup `.mcp.json` di project envman sendiri:

```json
{
  "mcpServers": {
    "envman": {
      "command": "bun",
      "args": ["src/cli.ts", "mcp", "--write"]
    }
  }
}
```

Scenarios:
1. List my projects → harus return semua project yang user akses
2. Compare PORT antara myapp:dev dan myapp:prod
3. Why is api-server crashing → pm_describe + pm_logs
4. Create alias `myapp:deploy` with args `-- bash myapp:scripts/deploy.sh` (canonical `slug:prefix/file` syntax)
5. Sync env after I update DATABASE_URL → pm_sync
6. Revoke wrong token + retry → expect graceful error

---

## 10. Open Questions

Diteliti sebelum/saat Phase 0:

### 10.1 SDK API stability

`@modelcontextprotocol/sdk` 1.29.0 → masih beta-ish. Cek changelog untuk
breaking change di registerTool, ToolAnnotations. Pin `^1.29.0` (caret) atau
exact `1.29.0`?

**Decision**: caret. Contract test akan catch break.

### 10.2 Outputs schema strict mode

Anthropic ref pakai `.strict()` di output juga. Kalau server tiba-tiba add field,
output validation fail. Trade-off: keamanan vs forward-compat.

**Decision**: `.passthrough()` di outputSchema (allow extra), `.strict()` di
inputSchema (reject extra dari Claude).

### 10.3 Pagination cursor vs offset

Server pakai offset di sebagian endpoint, cursor di yang lain (project files).
MCP tool consistent pakai apa?

**Decision**: ikuti server convention per-endpoint. Schema field jelas
(`offset` atau `cursor`). Tool description menyebutkan style.

### 10.4 Reveal secret confirmation

`vars_export revealSecrets: true` — perlu interaktif konfirmasi via MCP elicitation?

**Decision**: TIDAK di MVP. Annotation `destructiveHint: false` tapi description
WARN keras "secrets exposed". User-level approval di Claude Code config.
Phase 4 explore elicitation API.

### 10.5 `pm_logs` follow mode

SSE/streaming di JSON-RPC = complex. Sampling-based polling tool?

**Decision**: TAIL ONLY (snapshot last N) di MVP. Follow → CLI direct.

---

## 11. Risk Register

| # | Risk | Likelihood | Impact | Mitigasi |
|---|---|---|---|---|
| R1 | SDK breaking di versi minor | Med | High | Contract test, pin version |
| R2 | stdout contamination dari transitive dep | Med | High | Test boundary, defensive override |
| R3 | Description quality drop seiring waktu | High | Med | Code review checklist + template enforce |
| R4 | Token scope tidak konsisten antar tool | Med | Med | Probe whoami startup, register conditionally |
| R5 | Audit endpoint missing → no AI accountability | Low | High | Phase 2 wajib + integration test |
| R6 | Performance degrade dengan banyak tool | Low | Med | Lazy import + cold start budget <1s |
| R7 | Concurrent write race | Low | High | Server already handle (DB transaction + lock) |
| R8 | Compiled binary build break | Med | High | CI smoke test built binary |

---

## 12. Rollback Strategy

Fitur opt-in. Tidak ubah behavior existing CLI/server.

- Phase 0-1 bermasalah → revert branch, no production impact (belum di-ship)
- Phase 2 (write tools) problematic → ship read-only only, defer write
- Audit endpoint bug → audit fire-and-forget, won't break tool calls
- Worst case: hapus `case 'mcp'` di cli.ts → fitur disappear, sisa CLI utuh

---

## 13. Yang TIDAK Termasuk MVP

- ❌ Resources (`@envman:project:xxx`) — deferred Phase 4
- ❌ Prompts (slash-command templates) — deferred Phase 4
- ❌ HTTP/SSE transport — stdio cukup untuk Claude Code local
- ❌ SSE log streaming dalam tool call — gunakan CLI direct
- ❌ Multi-token / context switching dalam satu session
- ❌ Tool elicitation API (interactive confirmation di MCP)
- ❌ Custom plugins/hooks via tools (extension surface)
- ❌ Windows support (POSIX only)

---

## 14. Referensi

- [MCP Spec (Nov 2025)](https://modelcontextprotocol.io/specification/2025-11/) — tool annotations, structured content
- [Anthropic MCP Builder Skill](https://github.com/anthropics/skills/blob/main/skills/mcp-builder/reference/node_mcp_server.md) — canonical Node/TS reference
- [`@modelcontextprotocol/sdk` npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — SDK docs
- [Claude Code MCP docs](https://code.claude.com/docs/en/mcp) — host-specific behavior
- [MCP Cheat Sheet 2026](https://www.webfuse.com/mcp-cheat-sheet) — quick reference
- Internal: `scripts/mcp/server.ts` — existing pattern di repo
- Internal: `docs/PROCESS-MANAGER-PLAN.md` — pola plan doc + bug catalog yang diadopsi

---

## 15. Changelog Plan

| Tanggal | Versi | Perubahan |
|---|---|---|
| 2026-05-24 | v1 (draft) | Initial plan, ready for review |
| 2026-05-24 | v2.0 | **MVP COMPLETE**. Phase 0-3 selesai dalam 1 sesi (AI pair). 242/242 MCP tests pass + 580/580 full suite. 28 tools total (15 readonly + 13 write). Server endpoint `/api/envman/mcp/audit` dengan 16-action allowlist. Contract test 190 assertions snapshot tool surface. Chaos tests verify stdout purity, 401 cache invalidation, schema strict rejection, error redaction. CLI: `envman mcp [--write] [--debug] [--version] [--help]`. Smoke test spawn binary, JSON-RPC handshake under 1s. Mitigasi 60+ bug terverifikasi: B1 (stdout pure), B4 (stdin EOF graceful), B5 (unhandledRejection no exit), A1 (non-exit auth), E1-E4 (typed errors mapped), Sec3 (audit fire-and-forget). |
