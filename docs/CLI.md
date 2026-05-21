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
```

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
