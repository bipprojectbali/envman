# Process Manager (envman pm) — Plan & Bug Mitigation

Status: **MVP IMPLEMENTED** — Phase 0-5 + 7 selesai. 160/160 tests pass. Branch `feature/pm`.

Dokumen ini adalah single source of truth untuk fitur `envman pm` (process manager native). Setiap keputusan, mitigasi bug, dan urutan kerja didokumentasikan di sini agar implementasi tidak ada surprise.

---

## 1. Filosofi & Konstrain Mutlak

1. **Build sendiri, bukan wrap.** [bm2](https://github.com/bun-bm2/bm2) (GPL-3.0) adalah study material. Tidak ada `import` atau copy code dari bm2.
2. **POSIX-only.** Linux + macOS. Windows tidak didukung — sederhanakan signal, fork, socket semantics.
3. **Pure Bun native.** Tidak ada dependency runtime baru (`chalk`, `cli-table3`, `pidusage`, `ws`). Pakai `Bun.spawn`, `Bun.serve`, `Bun.file`, `node:fs/promises`, `node:net`.
4. **Tight integration dengan envman.** Process knows source env, support sync from server, audit trail di DB, web UI di dashboard.
5. **Stability > speed.** Setiap bug yang ditemukan di bm2 sudah harus dimitigasi di desain — bukan ditemukan saat runtime.

### Keputusan yang sudah disetujui

| # | Keputusan | Alasan |
|---|---|---|
| K1 | Daemon embed di CLI dengan subcommand `envman daemon start/stop/status` (bukan binary terpisah `envmand`) | Sederhanakan distribusi — satu binary `envman` saja |
| K2 | Phase 6 (Web UI integration) **deferred** ke pasca-MVP | Fokus ke CLI dulu, validate core kerja stabil |
| K3 | Audit endpoint baru di server: `POST /api/envman/pm/audit` | Process lifecycle terlihat di existing audit log dashboard |
| K4 | Plan tersimpan sebagai `docs/PROCESS-MANAGER-PLAN.md` (file ini) | Reference yang bisa di-update saat implementasi berlangsung |

---

## 2. Arsitektur

### 2.1 Topologi

```
┌──────────────┐  Unix domain socket  ┌─────────────────┐  spawn  ┌───────────┐
│  envman CLI  │ ───────HTTP+SSE────► │  envman daemon  │ ───────►│  child A  │
│  (envman pm) │                      │  (envman daemon)│         │  child B  │
└──────────────┘                      │                 │         │  child C  │
                                      │ - supervisor    │         └───────────┘
                                      │ - log manager   │
                                      │ - state store   │
                                      │ - env syncer    │ ──HTTP──► envman server API
                                      └─────────────────┘            (re-fetch env)
```

### 2.2 File Layout

```
~/.config/envman/
  config.json                    ← (existing) server + token
  daemon.token                   ← shared secret for IPC auth (mode 0600)
  run/
    daemon.pid                   ← PID + start_epoch + socket_path (flock)
    daemon.sock                  ← Unix domain socket (mode 0600)
    daemon.log                   ← daemon's own stdout/stderr
    processes.json               ← state (atomic write tmp+rename)
    processes.json.bak           ← previous-version backup
    logs/
      <name>-<id>.out.log        ← stdout (O_APPEND, rotate 10MB × 5)
      <name>-<id>.err.log        ← stderr
      <name>-<id>.out.log.1.gz   ← rotated + gzipped
      ...
```

### 2.3 IPC Protocol

**Transport**: HTTP/1.1 over Unix domain socket (mengikuti pola bm2 — terbukti bekerja dengan `Bun.serve({ unix })` dan `fetch({ unix })`).

**Authentication** (lihat hasil POC #39 — SO_PEERCRED tidak supported di Bun 1.3.14):

1. **Primary: Unix socket file permission `0600`** — kernel-level enforcement, hanya UID owner yang bisa `open(2)` socket. Cukup untuk threat model personal/self-host.
2. **Secondary: Header token** `X-Envman-Daemon-Auth: <token>` — defense-in-depth. Token di-generate sekali saat daemon pertama start, disimpan di `~/.config/envman/daemon.token` mode 0600.

Catatan: kalau di future Bun expose peer credentials, bisa ditambah sebagai defense ketiga.

**API versioning**: `/v1/` prefix dari awal — siap untuk breaking changes future.

| Method | Path | Purpose | Response |
|---|---|---|---|
| `POST` | `/v1/process/start` | Spawn new process | `{ id, status }` |
| `POST` | `/v1/process/:id/stop` | Stop (SIGTERM → SIGKILL) | `{ status }` |
| `POST` | `/v1/process/:id/restart` | Restart (re-fetch env if synced) | `{ status }` |
| `POST` | `/v1/process/:id/reload` | Graceful reload | `{ status }` |
| `DELETE` | `/v1/process/:id` | Delete from management | `{ status }` |
| `GET` | `/v1/process` | List all | `{ processes: [...] }` |
| `GET` | `/v1/process/:id` | Detail | `{ process }` |
| `GET` | `/v1/process/:id/logs?stream=true` | Tail (SSE) | SSE `data: <line>` |
| `POST` | `/v1/sync` | Re-fetch env, restart affected | `{ updated: [...] }` |
| `POST` | `/v1/daemon/shutdown` | Graceful shutdown | `{ ok: true }` |
| `GET` | `/v1/daemon/health` | Status (heartbeat) | `{ uptime, processes }` |

**Correlation**: Setiap request body punya `requestId` (UUID), response echo. Memudahkan debug log.

### 2.4 Data Model

```typescript
interface ProcessesFile {
  version: 1
  processes: ProcessRecord[]
}

interface ProcessRecord {
  id: string                                    // UUID
  name: string                                  // user-given, unique
  command: string[]                             // ["bun", "index.js"]
  cwd: string
  envSources: EnvSource[]                       // ["myapp:prod", "/path/.env"]
  envHash: string                               // sha256 of resolved env (untuk detect change)
  staticEnv: Record<string, string>             // user-set, bukan dari envman
  pid: number | null
  startEpoch: number | null                     // untuk PID-hijack guard
  status: 'starting' | 'online' | 'stopping' | 'stopped' | 'errored' | 'quarantined'
  restartCount: number
  restartWindow: number[]                       // timestamps untuk sliding window
  lastExitCode: number | null
  lastError: string | null
  createdAt: number
  options: ProcessOptions
}

interface EnvSource {
  type: 'envman' | 'file'
  ref: string                                   // "myapp:prod" atau "/path/.env"
}

interface ProcessOptions {
  autorestart: boolean                          // default true
  maxRestarts: number                           // default 16
  restartWindowSec: number                      // default 60
  minUptimeMs: number                           // default 1000
  startupGraceMs: number                        // default 30000
  killTimeoutMs: number                         // default 5000
  cwd?: string
  logMaxSize: number                            // default 10MB
  logMaxFiles: number                           // default 5
  healthCheck?: { url: string; intervalMs: number; timeoutMs: number; maxFails: number }
  watchSync: boolean                            // default false (poll envman server)
  syncIntervalSec: number                       // default 60
}
```

---

## 3. Katalog Bug + Mitigasi

Disusun per kategori. **Setiap bug yang ditemukan di bm2 di-mitigasi eksplisit, plus bug-bug klasik daemon yang tidak terlihat di bm2.**

### 3.1 Daemon Lifecycle

| # | Bug | Mitigasi | Validasi |
|---|---|---|---|
| D1 | Daemon kena SIGHUP saat terminal close (bm2 hanya pakai `unref()`) | `Bun.spawn` dengan `detached: true` + `stdio: ['ignore', outFd, errFd]`. Investigate via Phase 0 POC. Fallback `setsid bun run daemon.ts` di POSIX. | Test: spawn daemon, `exec bash`, close terminal, cek daemon masih hidup. |
| D2 | Dua CLI race spawn dua daemon → PID file di-overwrite, socket di-overwrite, daemon pertama yatim | `flock` (advisory lock) pada PID file via `node:fs.open` dengan `O_CREAT \| O_EXCL`. Yang dapat lock = daemon resmi. | Stress test: 50 paralel `envman pm start`, expect exactly 1 daemon spawned. |
| D3 | PID file menunjuk PID yang sudah recycled untuk proses random (PID hijack) | Simpan `(pid, start_epoch)` di PID file. `start_epoch` dibaca dari `/proc/<pid>/stat` btime (Linux) atau `ps -o lstart` (macOS). Cek dua-duanya saat verify daemon alive. | Unit test: mock `/proc/<pid>/stat` dengan epoch berbeda → return "not our daemon". |
| D4 | Daemon crash di tengah supervisi → children jadi orphan | Child di-spawn tanpa detached → kena SIGHUP saat daemon mati. Acceptable: daemon resurrect detect dan kill orphan dulu sebelum respawn (lihat D7). | Test: kill daemon dengan SIGKILL, restart daemon, expect proses ter-resurrect dengan validasi. |
| D5 | Stale socket file tidak ter-cleanup setelah daemon crash | Sebelum `Bun.serve({ unix })`: (a) cek PID file alive, (b) kalau tidak alive → unlink socket+pid, (c) bind. Kalau bind gagal EADDRINUSE → daemon lain race-bind, exit dengan error jelas. | Test: kill -9 daemon, restart, expect bind success. |
| D6 | Socket file readable orang lain di shared host | Setelah `Bun.serve({ unix })`, `chmod(socketPath, 0o600)` segera. Plus header token sebagai defense kedua. (SO_PEERCRED tidak supported di Bun, lihat POC #39.) | Test: jalan sebagai user A, user B coba connect → expect EACCES dari kernel. |
| D7 | Resurrect tidak validasi child masih hidup → double-spawn | Saat resurrect, untuk setiap process record: cek `pid + startEpoch` di filesystem. **Decision: kill orphan + respawn**, bukan adopt (adopt mustahil tanpa kehilangan stdout/stderr handle child orphan). Trade-off: kehilangan sedikit uptime untuk gain reliability besar. | Test: kill daemon dengan child masih hidup, restart, expect kill+respawn. |

### 3.2 IPC

| # | Bug | Mitigasi |
|---|---|---|
| I1 | Siapapun yang bisa akses socket bisa kirim kill command | Socket `chmod 0600` + header token `X-Envman-Daemon-Auth`. Defense-in-depth tanpa SO_PEERCRED (lihat POC #39). |
| I2 | CLI hang menunggu response dari daemon yang stuck | Semua `fetch({ unix })` dari CLI pakai `AbortSignal.timeout(5000)`. Untuk SSE streaming, no timeout tapi handle abort dari Ctrl+C. |
| I3 | Daemon crash di tengah handle request → CLI hang | CLI deteksi `ECONNRESET`/`socket closed` → exit error. |
| I4 | Multiple subscribers ke SSE log stream → daemon buffer growth | Setiap subscriber punya queue terpisah dengan cap (1000 lines), oldest dropped. Notice "log truncated, reconnect" dikirim. |
| I5 | Request body sangat besar (mis. corrupted JSON) → daemon OOM | Override `Bun.serve` default body limit ke 1MB. |

### 3.3 Process Supervisor

| # | Bug | Mitigasi |
|---|---|---|
| P1 | Crash-loop instant (script syntax error) → 100% CPU hammering | Exponential backoff: `delay = min(60_000, 1000 * 2^restartCount)`. Reset restartCount setelah child uptime ≥ `minUptimeMs * 10` (= 10s default). |
| P2 | Crash-loop absolute counter (bm2 max 16) → permanent dead setelah lifetime accumulation | Sliding window: `5 restart dalam 60s = quarantined`. User harus eksplisit `envman pm reset <name>` untuk keluar quarantine. |
| P3 | PID-hijack saat kirim signal (bm2 `graceful-reload.ts:58` kirim SIGTERM ke PID number) | Simpan reference ke `Bun.Subprocess` object (bukan PID number). Pakai `subprocess.kill(signal)`. Fallback ke PID + start_epoch validation untuk orphan kill saat resurrect. |
| P4 | Zombie children kalau daemon crash | Acceptable: di Linux PID1=systemd reap. Di macOS launchd. Untuk envman use case (user shell), tidak masalah. |
| P5 | Daemon's `process.env` leak ke child (bm2 leak semua env) | **Explicit allowlist** untuk inherited env: `PATH`, `HOME`, `LANG`, `LC_*`, `TZ`, `USER`, `SHELL`, `TERM`. Lainnya **strip**. Child env = `[allowlist] + [resolved sources] + [ENVMAN_PM_ID, ENVMAN_PM_NAME]`. **Strip `ENVMAN_TOKEN`, `ENVMAN_SERVER`**. |
| P6 | Force kill timeout race antara `process.exited` dan `setTimeout` | Adopt pola bm2 (yang sudah benar): `Promise.race([process.exited, sleep(killTimeoutMs)])`, kalau timeout → SIGKILL. |
| P7 | `treeKill` pakai `pgrep` subprocess (bm2 `utils.ts:97`) lambat + Linux-only | ✅ ADDRESSED via **process group kill**: child di-spawn dengan `detached: true` (POC #41 confirmed), `stop()` kirim signal ke `process.kill(-pid, sig)` → kena seluruh tree atomic (kernel-enforced, no race). Tidak butuh `pgrep`/`ps` parsing, tidak platform-specific. |
| P8 | Watch mode trigger restart storm (bm2 sudah debounce 1s) | Adopt: debounce file watch events 1 detik. |

### 3.4 Log Management

| # | Bug | Mitigasi |
|---|---|---|
| L1 | `Bun.write` baca + rewrite seluruh file (bm2 sudah migrate ke `appendFile`) | Pakai `node:fs/promises.appendFile` O_APPEND. Lebih bagus: keep `fd` open via `fs.open(path, 'a')` reuse antar flush — hindari open/close tiap 100ms. |
| L2 | Pipe stream remainder buffer broken (bm2 `process-container.ts:226-266`) | Implementasi BENAR: `const lines = (remainder + chunk).split('\n'); remainder = lines.pop() ?? ''; for (line of lines) writeLine(line)`. |
| L3 | Inode race saat rotate | Pattern: (a) close fd lama, (b) rename file → `.1`, (c) buat file baru, (d) open fd baru. Buffered writes ditahan di memory antara (a)-(d). |
| L4 | Gzip rotation bisa interrupted → corrupt `.gz` | `rename file.log.1 → file.log.1.tmp.gz`, `gzip in-place tmp`, `rename .tmp.gz → final.gz`. Atomic per file. |
| L5 | Tail polling 500ms = wakeup storm + latency tinggi | `fs.watch(path, { persistent: false })` dengan fallback 1s polling kalau watch tidak supported. |
| L6 | Disk full → write fail silently (bm2 catch-all) | Catch ENOSPC eksplisit, set daemon flag `diskFull = true`, hentikan disk logging, log ke memory ring buffer, expose via `/v1/daemon/health`. |
| L7 | Log file permission saat shared user | Mode 0640 saat create. Direktori `logs/` mode 0750. |
| L8 | `tail -n 100` pakai shell subprocess (bm2 `log-manager.ts:155`) | Implementasi pure JS: `Bun.file(path).slice(...)` baca dari belakang, split newline. |

### 3.5 State Persistence

| # | Bug | Mitigasi |
|---|---|---|
| S1 | `dump.json` non-atomic write (bm2) | Atomic: write to `processes.json.tmp`, `fsync`, copy old ke `.bak`, `rename` ke `processes.json`. |
| S2 | Manual-only save (bm2) → state hilang kalau crash sebelum save | Auto-save on every state change, debounced 1s. Manual `save` command tetap ada. |
| S3 | Corrupt file → silent empty resurrect (bm2 catch-all `return []`) | Kalau parse fail: (a) coba `.bak`, (b) kalau juga fail → log error eksplisit, **STOP daemon** dengan error code, jangan silent empty. |
| S4 | Schema migration future | Field `version: 1` di top-level. Migration function chain. Test setiap version tetap loadable. |

### 3.6 Env Integration (envman-specific)

| # | Bug | Mitigasi |
|---|---|---|
| E1 | Token expired / revoked saat process long-running | Daemon track `lastTokenCheck`. Dapat 401: tandai `tokenInvalid: true`, hentikan auto-sync, broadcast event. **Proses yang sudah jalan tidak diganggu**. |
| E2 | Server envman unreachable saat sync | Retry 3× exponential (1s, 2s, 4s), kalau tetap fail: log warning, schedule next attempt di interval × 2 (max 1 jam). **Tidak restart proses**. |
| E3 | Encryption master key berubah di server → decrypt fail | Server return error JSON. Daemon tampilkan eror jelas, tidak restart dengan env corrupt. |
| E4 | Network call blocking daemon event loop | Semua HTTP ke server pakai `AbortSignal.timeout(10_000)` dan async. |
| E5 | Sync timing race: `pm restart api` dan `pm sync` bersamaan | State machine per-process dengan lock: `{ phase: 'starting' \| 'online' \| 'syncing' \| 'restarting' \| 'stopping' }`. |
| E6 | Env hash collision (sha256 berbeda untuk env yang identik karena key order) | Normalize: sort keys alphabetically, serialize JSON canonical form sebelum hash. |

### 3.7 Race Conditions

| # | Race | Mitigasi |
|---|---|---|
| R1 | Dua `pm start` dengan nama sama bersamaan | Per-name lock di daemon. Second request → 409 Conflict. |
| R2 | Daemon receive `stop` saat proses masih `starting` | State machine: di phase `starting`, stop request → tunggu sampai `online` (max 30s), baru SIGTERM. |
| R3 | File lock contention pada `processes.json` saat banyak operasi paralel | Tidak pakai file lock. Single source of truth = in-memory Map. Disk write debounced 1s, single writer queue. |

### 3.8 Resource Leaks

| # | Leak | Mitigasi |
|---|---|---|
| RL1 | File descriptor exhaustion (log fd tidak ditutup) | Setiap process punya 2 fd (out, err) persistent. Saat deleted: close. Daemon shutdown: close semua. |
| RL2 | Metrics ring buffer tumbuh tanpa batas | Hard cap: per process 60 snapshot (1 menit @ 1s). Worst-case 100 proses × 60 × 100B = 600KB. |
| RL3 | `setInterval` overlap kalau pidusage lambat | Self-rescheduling: `async function loop() { try { await poll() } finally { setTimeout(loop, interval) } }`. |
| RL4 | SSE subscriber tidak unsubscribe saat client disconnect | `request.signal.addEventListener('abort', () => unsubscribe())`. |

### 3.9 Cross-Platform Quirks

| # | Quirk | Mitigasi |
|---|---|---|
| C1 | `/proc/<pid>/stat` Linux only | Detect platform startup. macOS pakai `ps -o pid,etime -p <pid>` parse. |
| C2 | SIGTERM behavior di shell scripts | Tidak ada perbedaan signifikan POSIX. |
| C3 | `Bun.spawn detached` semantics Linux vs macOS | Phase 0 POC eksplisit kedua platform. |
| C4 | `fs.watch` reliability di macOS FSEvents | Fallback polling 1s. |

---

## 4. Status Implementasi

Semua phase selesai. Detail per phase lihat Section 12.

| Phase | Status | Tests |
|---|---|---|
| Phase 0 — POC | ✅ Selesai | 4/4 POC pass |
| Phase 1 — Daemon Skeleton | ✅ Selesai | 61 tests |
| Phase 2 — Process Supervisor | ✅ Selesai | +39 tests |
| Phase 3 — Log Management | ✅ Selesai | +26 tests |
| Phase 4 — State Persistence | ✅ Selesai | +12 tests |
| Phase 5 — envman Integration | ✅ Selesai | +22 tests |
| Phase 6 — Web UI | ⏸️ Deferred (K2) | — |
| Phase 7 — Hardening + MCP | ✅ Selesai | chaos tests + docs |

**Total: 165/165 tests pass.** Typecheck clean. Smoke test end-to-end verified.

---

## 5. Rollback Strategy

Fitur ini **opt-in**. Tidak mengubah perilaku existing CLI/server.

- Phase 5 bermasalah → revert ke Phase 4 (standalone PM), tetap usable
- Seluruh feature problematic → develop di branch `feature/pm`, tidak commit ke main
- Production rollback: hapus binary subcommand `pm`, daemon orphan di-stop manual

---

## 9. Yang TIDAK Termasuk MVP

Jangan tergoda tambah di awal:

- ❌ Cluster mode (Bun.serve reusePort)
- ❌ Prometheus metrics export
- ❌ Web dashboard process UI (Phase 6 deferred)
- ❌ Cron-style scheduling
- ❌ Deployment dengan releases directory
- ❌ Modules system
- ❌ Health check via custom command (HTTP only di MVP)
- ❌ Watch mode dengan file change detection

---

## 10. Referensi

- [bm2 repo](https://github.com/bun-bm2/bm2) — Bun-native PM2 alternative (study material, GPL-3.0)
- [PM2 docs](https://pm2.keymetrics.io/docs/usage/process-management/) — referensi command ergonomics
- [Bun Subprocess docs](https://bun.sh/docs/api/spawn) — runtime primitive
- [GNU GPL FAQ — Mere Aggregation](https://www.gnu.org/licenses/gpl-faq.html#MereAggregation) — license interpretation

---

## 11. Phase 0 POC Results

Dijalankan 2026-05-24 di macOS arm64 (Bun v1.3.14). Scripts di `scripts/poc/pm/`.

| POC | Status | Konsekuensi |
|---|---|---|
| #37 Bun.spawn detached | ✅ LULUS | Pakai `detached: true` native, no fallback needed |
| #38 Socket + flock | ✅ LULUS | O_EXCL + chmod 0600 = sufficient |
| #39 SO_PEERCRED | ❌ NOT SUPPORTED | Drop requirement, chmod 0600 + header token cukup |
| #40 fs.watch | ⚠️ HYBRID | fs.watch + 1s polling, idempotent delta read |

**Tidak ada blocker untuk lanjut ke Phase 1.** Plan doc Section 2.3 perlu diperbarui kecil untuk hapus mention SO_PEERCRED.

---

## 12. Completion Summary (MVP v2.0 — 2026-05-24)

### Yang sudah dikerjakan

| Phase | Status | Commit |
|---|---|---|
| Phase 0 — POC | ✅ Selesai 4/4 | `5d01c47` |
| Phase 1 — Daemon Skeleton | ✅ Selesai 61 tests | (Phase 1 commit) |
| Phase 2 — Process Supervisor | ✅ Selesai +39 tests | (Phase 2 commit) |
| Phase 3 — Log Management | ✅ Selesai +26 tests | (Phase 3 commit) |
| Phase 4 — State Persistence | ✅ Selesai +12 tests | (Phase 4 commit) |
| Phase 5 — envman Integration | ✅ Selesai +22 tests | (Phase 5 commit) |
| Phase 6 — Web UI | ⏸️ Deferred (per K2) | — |
| Phase 7 — Docs + MCP | ✅ docs + MCP tools selesai | (Phase 7 commit) |

**Total**: 160/160 tests pass. Typecheck clean. Smoke test end-to-end verified untuk start/stop/restart/logs/save/sync/resurrect.

### File structure final

```
src/pm/
  shared/
    paths.ts            — file paths (~/.config/envman/run/)
    token.ts            — daemon auth token + safeEqual
    types.ts            — DaemonHealth, ApiResponse, ErrorCode
  daemon/
    pidfile.ts          — O_EXCL atomic + PID+start_epoch validation
    server.ts           — Bun.serve unix + chmod 0600 + auth middleware
    router.ts           — path matching + JSON body + 1MB limit
    logger.ts           — structured stdout logging
    backoff.ts          — exponential + sliding window quarantine
    env-resolver.ts     — allowlist inherit + strip secrets
    process-container.ts — state machine per child + signal handling
    process-manager.ts  — collection + audit hook + auto-save trigger
    log-writer.ts       — O_APPEND fd + remainder buffer (bm2 L2 fix)
    log-rotator.ts      — size-based N-shifting + background gzip atomic
    log-tailer.ts       — multi-subscriber SSE + tailFile pure JS
    state-store.ts      — atomic tmp+rename + .bak fallback + schema version
    resurrect.ts        — orphan detection + kill + respawn
    envman-client.ts    — HTTP client ke envman server (retry + 401 handling)
    env-syncer.ts       — source resolve + diff + restart-on-change
    main.ts             — daemon entry point (semua wiring di sini)
  cli/
    client.ts           — IPC client (HTTP over unix socket)
    daemon-control.ts   — envman daemon start/stop/status
    pm-commands.ts      — envman pm start/stop/ls/logs/sync/save/...

tests/pm/                — 14 test files, 160 tests, no fixtures (in-memory)
scripts/poc/pm/          — 4 POC scripts + run-all.sh
scripts/mcp/tools/pm.ts  — readonly + admin tools untuk Claude MCP

src/routes/envman/pm-audit.ts — server endpoint untuk audit events
```

### Bug mitigations addressed (50+)

Semua bug class dari Section 3 catalog ter-cover di code dengan inline jsdoc reference:

| Class | Items | Status |
|---|---|---|
| D — Daemon lifecycle | D1-D7 | ✅ all addressed |
| I — IPC | I1-I5 | ✅ all addressed |
| P — Process supervisor | P1-P8 | ✅ all addressed (P7 via process group kill, POC #41 + 3 chaos tests) |
| L — Log management | L1-L8 | ✅ all addressed |
| S — State persistence | S1-S4 | ✅ all addressed |
| E — Env integration | E1-E6 | ✅ all addressed |
| R — Race conditions | R1-R3 | ✅ all addressed |
| RL — Resource leaks | RL1-RL4 | ✅ all addressed |
| C — Cross-platform | C1-C4 | ✅ (Linux validation TBD via run-all.sh) |

### Yang belum (Phase 6 + advanced features)

Tidak masuk MVP — bisa dibangun nanti kalau perlu:

- Web UI tab "Processes" di project detail
- Cluster mode (Bun.serve reusePort)
- Prometheus metrics export
- Health check via custom command (HTTP only saat ini)
- Cron-style scheduling
- File watch mode untuk auto-restart on code change
- treeKill subprocess hierarchy (acceptable: child fork = child's responsibility)

### Validasi Linux yang harus dilakukan

POC #37 (Bun.spawn detached) divalidasi di macOS. Behavior di Linux Debian/Ubuntu diharapkan
identik karena POSIX-standard, tapi harus tetap diverifikasi:

```bash
git checkout feature/pm
bash scripts/poc/pm/run-all.sh
# → output ke /tmp/poc-report-<timestamp>.txt
```

Selain itu run full test suite:

```bash
bun test tests/pm/
# Expected: 160 pass, 0 fail
```

Plus smoke test daemon lifecycle:

```bash
ENVMAN_PM_HOME=/tmp/envman-linux-test bun src/cli.ts daemon start
ENVMAN_PM_HOME=/tmp/envman-linux-test bun src/cli.ts pm start --name test -- sleep 30
ENVMAN_PM_HOME=/tmp/envman-linux-test bun src/cli.ts pm ls
ENVMAN_PM_HOME=/tmp/envman-linux-test bun src/cli.ts daemon stop
```

### Lessons learned

1. **POC dulu pays off**. 1 hari riset menemukan bahwa Bun's `detached: true` cukup tanpa `setsid` wrapper, SO_PEERCRED tidak supported (drop dari design), macOS FSEvents agresif coalesce (hybrid approach diperlukan). Ketiga finding ini menghemat ~3 hari debug saat implementasi.

2. **bm2 study material bagus** — codebase kecil, Bun-native, semua pattern relevant. Tapi ada 5+ bugs yang ditemukan dari source code review (broken remainder buffer, non-atomic state write, PID-number signal, dll) yang semuanya di-mitigasi di envman pm.

3. **Test discipline membantu**. 160 tests berarti refactor aman. Bug `LogWriter.close() set closed=true sebelum flush` ketangkap segera oleh test 'multiple chunks with mixed boundaries' — andai tidak ada test, bug ini hanya akan muncul saat user delete process dengan partial line di buffer.

4. **Schema versioning sejak awal** menghindari technical debt nanti. `STATE_SCHEMA_VERSION = 1` + migration function chain siap untuk perubahan struct future.

5. **Defense-in-depth tetap relevant** meski beberapa layer tidak available di Bun (SO_PEERCRED). `chmod 0600` + header token = sufficient untuk personal/self-host threat model.

---

## 13. Changelog Plan

| Tanggal | Versi | Perubahan |
|---|---|---|
| 2026-05-24 | v1 (draft) | Initial plan, approved, ready for Phase 0 POC |
| 2026-05-24 | v1.1 | Phase 0 POC selesai (4/4). Hasil di Section 11. Section 2.3 + D6 + I1 di-update: drop SO_PEERCRED (tidak supported di Bun), pakai chmod 0600 + header token saja. |
| 2026-05-24 | v2.0 | **MVP COMPLETE**. Phase 1-5 + 7 selesai dalam 1 sesi (estimasi awal 22-28 hari → aktual 1 hari karena AI pair programming). 160/160 tests pass. Lihat Section 12 untuk completion summary. |
| 2026-05-24 | v2.1 | **P7 addressed via process group kill** (Opsi A). Child spawn `detached:true`, stop pakai `process.kill(-pid, sig)`. +5 chaos tests (`tests/pm/tree-kill-and-zombies.test.ts`): multi-grandchild kill, SIGKILL escalation untuk trap TERM, 30-cycle no-zombie. Total: 165/165 tests. POC #41 di `scripts/poc/pm/41-process-group.ts`. |
