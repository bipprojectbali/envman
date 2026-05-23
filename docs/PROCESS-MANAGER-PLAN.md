# Process Manager (envman pm) — Plan & Bug Mitigation

Status: **Draft v1 — Plan Approved**. Belum mulai implementasi (menunggu hasil Phase 0 POC).

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

**Authentication**:

1. **Header token**: Setiap request wajib `X-Envman-Daemon-Auth: <token>`. Token di-generate sekali saat daemon pertama start, disimpan di `~/.config/envman/daemon.token` mode 0600.
2. **Peer credential check** (defense-in-depth): Linux `SO_PEERCRED` / macOS `LOCAL_PEERCRED` validasi UID = daemon UID. Tanpa ini, siapapun yang bisa baca socket bisa kill daemon — bug yang ada di bm2.

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
| D6 | Socket file readable orang lain di shared host | Setelah `Bun.serve({ unix })`, `chmod(socketPath, 0o600)`. Plus SO_PEERCRED check di handler. | Test: jalan sebagai user A, user B `curl --unix-socket` → expect 403. |
| D7 | Resurrect tidak validasi child masih hidup → double-spawn | Saat resurrect, untuk setiap process record: cek `pid + startEpoch` di filesystem. **Decision: kill orphan + respawn**, bukan adopt (adopt mustahil tanpa kehilangan stdout/stderr handle child orphan). Trade-off: kehilangan sedikit uptime untuk gain reliability besar. | Test: kill daemon dengan child masih hidup, restart, expect kill+respawn. |

### 3.2 IPC

| # | Bug | Mitigasi |
|---|---|---|
| I1 | Siapapun yang bisa akses socket bisa kirim kill command | Header token `X-Envman-Daemon-Auth` + SO_PEERCRED. Kombinasi defense-in-depth. |
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
| P7 | `treeKill` pakai `pgrep` subprocess (bm2 `utils.ts:97`) lambat + Linux-only | MVP: tidak treeKill. Phase 2+: cross-platform via `/proc/<pid>/task/<tid>/children` (Linux) + `ps -o pid,ppid -ax` (macOS). |
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

## 4. Implementasi Bertahap

Total estimasi: **22-28 hari kerja** (bukan kalender). Setiap phase punya **exit criteria yang harus PASS sebelum lanjut**.

### Phase 0 — Spike & POC (3 hari) — **CURRENT**

**Tujuan**: validasi asumsi teknis sebelum commit ke desain.

**Tasks**:
1. POC `Bun.spawn` detached — spawn child, exit parent, cek child hidup setelah terminal close (Linux + macOS).
2. POC Unix socket + flock + permissions.
3. POC SO_PEERCRED via Bun atau fallback `node:net`.
4. POC `fs.watch` reliability untuk log tail.

**Exit criteria**:
- [ ] Spawn daemon yang survive terminal close di Linux + macOS
- [ ] PID file flock berfungsi (50 paralel spawn → 1 daemon)
- [ ] Permission socket 0600 + SO_PEERCRED check works (atau decide fallback)
- [ ] fs.watch reliability documented
- [ ] Hasil POC ter-document di Section 11 dokumen ini

### Phase 1 — Daemon Skeleton (5 hari)

**Tujuan**: daemon process hidup, terima IPC, shutdown clean. **Belum bisa start child process apapun**.

**Tasks**:
1. `src/pm/daemon/main.ts` — entry point
2. `src/pm/daemon/server.ts` — Bun.serve unix socket + auth + SO_PEERCRED
3. `src/pm/daemon/pidfile.ts` — flock, atomic write, validate alive
4. `src/pm/daemon/router.ts` — endpoint registry, validation, error handling
5. `src/pm/daemon/shutdown.ts` — graceful shutdown
6. `src/pm/cli/client.ts` — HTTP client over unix socket
7. `src/pm/cli/daemon-control.ts` — `envman daemon start/stop/status`
8. Endpoint `GET /v1/daemon/health`
9. Unit tests untuk pidfile, server, client

**Exit criteria**:
- [ ] `envman daemon start` spawn daemon, write PID file, bind socket
- [ ] `envman daemon status` return uptime, version
- [ ] `envman daemon stop` graceful shutdown
- [ ] Kill -9 daemon → next start cleanup stale pid+socket
- [ ] 100 paralel daemon start → exactly 1 success (flock test)
- [ ] Coverage minimal 70%

### Phase 2 — Process Supervisor (5 hari)

**Tujuan**: daemon bisa spawn, supervise, restart child processes.

**Tasks**:
1. `src/pm/daemon/process-container.ts` — single child wrapper (state machine, restart, signal)
2. `src/pm/daemon/process-manager.ts` — collection, lookup by id/name
3. `src/pm/daemon/backoff.ts` — exponential + sliding window crash-loop detection
4. `src/pm/daemon/env-resolver.ts` — env allowlist + merge (static env only, belum fetch server)
5. Endpoints: `POST /v1/process/start`, `stop`, `restart`, `GET /v1/process`, `GET /v1/process/:id`
6. Unit tests untuk backoff, env-resolver, state machine

**Exit criteria**:
- [ ] `envman pm start "sleep 30" --name test` jalan, terlihat di `pm ls`
- [ ] Process crash → restart dengan exponential backoff teramati di log
- [ ] 5 crash dalam 60s → quarantined
- [ ] `pm stop` → SIGTERM → SIGKILL setelah 5s
- [ ] `pm restart` → stop + start atomic
- [ ] Daemon's env tidak leak ke child

### Phase 3 — Log Management (3 hari)

**Tujuan**: child stdout/stderr di-capture, rotated, gzipped, tail-able via SSE.

**Tasks**:
1. `src/pm/daemon/log-writer.ts` — persistent fd, append, line splitting BENAR
2. `src/pm/daemon/log-rotator.ts` — size check 60s, rotate + background gzip atomic
3. `src/pm/daemon/log-tailer.ts` — fs.watch + polling fallback, multi-subscriber broadcaster
4. Endpoint `GET /v1/process/:id/logs?stream=true` (SSE) dan `?tail=100`
5. CLI: `envman pm logs <name> [-f] [-n 100]`
6. Unit tests untuk remainder buffer logic (PENTING — bm2 punya bug di sini)

**Exit criteria**:
- [ ] Child output >10MB → rotate ke `.1`, file baru created
- [ ] Setelah 5 rotate → `.6.gz` tidak ada
- [ ] `pm logs -f` real-time, no missing lines
- [ ] Chunk boundary di tengah baris tidak split jadi 2 log entry
- [ ] Disk full → daemon health report, child tetap jalan

### Phase 4 — State Persistence + Resurrect (3 hari)

**Tujuan**: daemon restart tidak kehilangan process list.

**Tasks**:
1. `src/pm/daemon/state-store.ts` — atomic write, .bak fallback, schema version, debounced auto-save
2. `src/pm/daemon/resurrect.ts` — load state, validate per-process (PID + start_epoch), kill orphan + respawn
3. CLI: `envman pm save`, `envman pm resurrect`
4. Tests: corrupt file scenarios, schema migration, atomic write interrupted

**Exit criteria**:
- [ ] State auto-save 1s setelah perubahan
- [ ] Daemon restart → semua proses kembali dengan status sama
- [ ] Corrupt `processes.json` → fallback ke `.bak`
- [ ] Both corrupt → daemon refuse start dengan error jelas
- [ ] Orphan child terdeteksi → killed + respawn

### Phase 5 — envman Integration (5 hari)

**Tujuan**: tight integration dengan envman server — env resolve, sync, alias-aware, audit.

**Tasks**:
1. `src/pm/daemon/envman-client.ts` — HTTP client ke server (pakai token dari `~/.config/envman/config.json`)
2. `src/pm/daemon/env-syncer.ts` — fetch env source, normalize, hash, diff
3. `src/pm/daemon/alias-resolver.ts` — resolve via `/api/envman/aliases/resolve/:ref`
4. Endpoint `POST /v1/sync` — bulk sync semua proses dengan `watchSync: true`
5. Per-process auto-sync poller (default 60s)
6. Audit endpoint baru di server: `POST /api/envman/pm/audit` — log lifecycle events
7. CLI: `envman pm sync [name]`, support `envman pm start <alias>` dengan alias resolution
8. Strip `ENVMAN_TOKEN`, `ENVMAN_SERVER` dari child env

**Exit criteria**:
- [ ] `envman pm start myapp:deploy --name api` (via alias) jalan
- [ ] Ubah env di UI → `pm sync` → proses restart dengan env baru
- [ ] Audit log di DB envman: started, stopped, crashed, restarted
- [ ] Server unreachable → retry exponential, proses tetap jalan
- [ ] Token expired → semua sync paused, user notif

### Phase 6 — Web UI Integration (deferred) — **NOT IN MVP**

Per keputusan K2, defer pasca-MVP. Catatan untuk masa depan:
- Backend bridge `envman server ↔ daemon` punya threat model unik (kalau dashboard diakses dari mesin lain)
- Untuk self-host single-host: bisa langsung pakai unix socket di server
- Tab "Processes" di project detail
- Real-time status via existing WebSocket presence channel
- Logs viewer (read-only)

### Phase 7 — Hardening & Testing (5 hari)

**Tujuan**: stress test, chaos test, production hardening.

**Tasks**:
1. **Chaos tests**:
   - Kill -9 daemon dengan 50 proses → restart, expect semua resurrect
   - Disk full → cek behavior
   - Network partition saat sync → cek retry
   - PID hijack simulation → cek detection
2. **Performance**:
   - 100 proses simultan, ukur memory daemon
   - 1000 log lines/sec per proses, ukur CPU + IO
3. **Documentation**:
   - `docs/PROCESS-MANAGER.md` — user guide
   - Update `CLAUDE.md` dengan section process management
   - Update `docs/CLI.md` dengan subcommand pm
4. **MCP tools** (per project rule):
   - `dev_pm_list`, `dev_pm_logs` di MCP dev server
   - `stg_pm_list`, `stg_pm_logs` di MCP stg (readonly)

**Exit criteria**:
- [ ] 100 proses idle, daemon memory < 50MB
- [ ] Chaos test scenarios pass
- [ ] User guide lengkap
- [ ] MCP tools terdaftar

---

## 5. Strategi Testing

### 5.1 Unit Tests (target coverage 80%)

Per module: backoff calculator, env-resolver, remainder buffer (log-writer), state-store atomic write, pidfile flock, request router.

### 5.2 Integration Tests (target coverage 60%)

Spin up real daemon di test env. Pattern: `tests/integration/pm-*.test.ts`.

Setup:
- `XDG_CONFIG_HOME` set ke tmp dir per test
- Daemon spawn dengan `--socket-path` override
- Cleanup: kill daemon + rm tmp dir

### 5.3 Chaos Tests

Folder `tests/chaos/`. Scenarios:
- `daemon-kill-9-recover.test.ts`
- `disk-full-simulation.test.ts`
- `concurrent-start-flock.test.ts`
- `pid-hijack-detection.test.ts`

### 5.4 Production Verification Checklist

Manual run sebelum release:
- [ ] Start daemon, 5 proses, restart laptop (systemd unit auto-start), semua resurrect
- [ ] Ubah env di UI → `pm sync` → restart smooth
- [ ] Tail logs >30 menit, no memory growth
- [ ] Force kill daemon, child orphan ter-kill saat restart
- [ ] Concurrent start 50 proses, semua sukses

---

## 6. Open Questions / Investigations

Diteliti di Phase 0 sebelum commit ke implementasi:

### 6.1 `Bun.spawn` detached behavior

Bun docs untuk `Subprocess` belum eksplisit mention `detached`. Investigate:
- Test: `Bun.spawn(["sleep", "60"], { detached: true, stdio: ["ignore", "ignore", "ignore"] })`, exit parent, `ps`.
- Test SIGHUP: close terminal parent, cek child status.
- Fallback: `Bun.spawn(["setsid", "bun", "run", daemonScript], ...)` di POSIX.

### 6.2 Unix Socket Permissions di Bun.serve

`Bun.serve({ unix })` — apakah ada opsi `mode`? Atau harus `chmod` setelah listen?
- Test: bind socket, cek default mode dengan `stat`.

### 6.3 SO_PEERCRED via Bun

Apakah Bun.serve fetch request expose peer credentials?
- Cek Bun.serve API reference.
- Fallback `node:net.createServer()`.

### 6.4 `Bun.Subprocess` reference setelah restart adopt

**Decision: tidak adopt** — kill orphan dan respawn. Lebih aman, lebih simpel.

---

## 7. Risk Register

| # | Risiko | Likelihood | Impact | Mitigasi |
|---|---|---|---|---|
| R1 | Bun.spawn detached tidak benar-benar detached | Med | High | Phase 0 POC, fallback `setsid` |
| R2 | Phase 5 envman integration kompleks > estimasi | Med | Med | Buffer di Phase 7, deprioritize Phase 6 |
| R3 | Daemon memory leak di long-running | Low | High | Phase 7 stress test, ring buffer caps |
| R4 | Race condition tidak ter-cover di unit test | Med | High | Chaos test mandatory |
| R5 | Schema processes.json v1 kurang fleksibel | Low | Low | Versioning siap, biaya migrasi murah |
| R6 | bm2 ada bug yang tidak terdeteksi di riset | Med | Med | Cross-check dengan PM2 patterns |

---

## 8. Rollback Strategy

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

_Section ini akan di-update selama Phase 0._

### 11.1 POC: `Bun.spawn` detached

Status: **belum dijalankan**.

### 11.2 POC: Unix socket + flock + permissions

Status: **belum dijalankan**.

### 11.3 POC: SO_PEERCRED

Status: **belum dijalankan**.

### 11.4 POC: fs.watch reliability

Status: **belum dijalankan**.

---

## 12. Changelog Plan

| Tanggal | Versi | Perubahan |
|---|---|---|
| 2026-05-24 | v1 (draft) | Initial plan, approved, ready for Phase 0 POC |
