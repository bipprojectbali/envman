<!-- GENERATED FILE — do not edit. Source: src/lib/cli-docs/*.ts. Regenerate: bun run scripts/gen-cli-docs.ts -->
# envman CLI — Referensi Lengkap

> Dokumentasi khusus CLI. Untuk referensi API server dan konfigurasi self-hosting, lihat `{{SERVER}}/api/docs.md`.


## Instalasi

```bash
# Auto-detect platform (Linux & macOS)
curl -fsSL {{SERVER}}/install | bash

# Manual per platform
curl -sL {{SERVER}}/download/cli/linux-x64   -o envman && chmod +x envman && sudo mv envman /usr/local/bin/
curl -sL {{SERVER}}/download/cli/linux-arm64 -o envman && chmod +x envman && sudo mv envman /usr/local/bin/
curl -sL {{SERVER}}/download/cli/darwin-arm64 -o envman && chmod +x envman && sudo mv envman /usr/local/bin/
curl -sL {{SERVER}}/download/cli/darwin-x64  -o envman && chmod +x envman && sudo mv envman /usr/local/bin/

# Windows (PowerShell)
Invoke-WebRequest -Uri "{{SERVER}}/download/cli/windows-x64" -OutFile "envman.exe"

# Verifikasi
envman --version
envman update   # update ke versi terbaru
```

Binary standalone — tidak butuh Node.js, npm, atau runtime lain.

---

## Autentikasi

### Login interaktif (sekali per mesin)

```bash
envman login {{SERVER}} --token <api-token>
envman whoami   # verifikasi login berhasil
envman logout   # hapus credentials tersimpan
```

Credentials disimpan di `~/.config/envman/config.json`.

### Prioritas auth (tertinggi → terendah)

```
1. ENVMAN_SERVER + ENVMAN_TOKEN di dalam file -e (e.g. .env.deploy)
2. ENVMAN_SERVER + ENVMAN_TOKEN sebagai system env / shell export
3. ~/.config/envman/config.json (dari envman login)
```

### Auth via env var (tanpa login — untuk CI/CD)

```bash
ENVMAN_SERVER={{SERVER}} ENVMAN_TOKEN=em_xxx envman -e myapp:production -- bun start
```

### Auth via file lokal (credentials per-project)

```bash
# .env.deploy berisi:
# ENVMAN_SERVER={{SERVER}}
# ENVMAN_TOKEN=em_xxx

envman -e .env.deploy -e myapp:production -- bun start
```

> **Catatan:** `ENVMAN_SERVER` dan `ENVMAN_TOKEN` selalu di-strip dari child process — tidak bocor ke aplikasi.

---

## Buat API Token

Buka browser → Profile → API Tokens → New Token. Centang scope yang dibutuhkan, set expiry jika perlu.

Token value hanya ditampilkan **sekali** saat pembuatan — simpan segera.

---


## Projects — Daftar Project & Environment

Lihat project yang bisa kamu akses dan environment di dalamnya, langsung dari
terminal (tanpa buka UI).

### Daftar project

```bash
envman projects ls                # semua project: slug, nama, jumlah env, role, pembuat
envman projects ls --me           # hanya project yang kamu buat
envman projects ls -q             # slug polos saja (pipe-friendly, mis. | fzf)
```

### Environment sebuah project

```bash
envman projects envs myapp        # env: nama, role akses, jumlah var
envman projects myapp             # shortcut, sama dengan "projects envs myapp"
envman projects envs myapp -q     # nama env polos saja (pipe-friendly)
```

Alias: `envman project ...` = `envman projects ...`. Semua perintah CLI-only
(memakai endpoint `GET /projects` yang sudah ada); menampilkan hanya yang boleh
kamu akses.


## Inject Vars ke Command

### Sintaks dasar

```bash
envman [flag...] -- <command> [args...]
```

### Flag inject

| Flag | Format | Keterangan |
|------|--------|-----------|
| `-e project:env` | `project:environment` | Fetch vars dari server |
| `-e file` | path tanpa titik dua | Load dari file lokal |
| `--server-wins` | — | System env menang atas vars yang di-fetch (default: fetch menang) |

---

### Pola inject — dari yang paling sederhana ke kompleks

```bash
# 1. Single environment
envman -e myapp:production -- bun start

# 2. Fallback layering: base di-override oleh production
envman -e myapp:base -e myapp:production -- bun dev

# 3. Mix server + file lokal (file lokal menang — posisi terakhir)
envman -e myapp:production -e .env.local -- bun dev

# 4. Dua project berbeda sekaligus
envman -e backend:production -e frontend:production -- bun start

# 5. Base project A + override dari project B
envman -e shared:secrets -e myapp:production -- bun start

# 6. System env menang (kocok urutan prioritas)
envman -e myapp:production --server-wins -- bun start

# 7. Tanpa login — auth via env var
ENVMAN_SERVER=https://envman.example.com \
ENVMAN_TOKEN=em_xxx \
  envman -e myapp:production -- bun start

# 8. Credentials dari file lokal
envman -e .env.secrets -e myapp:production -- bun dev
# (di .env.secrets: ENVMAN_SERVER=... ENVMAN_TOKEN=...)
```

---

### Berbagai runtime

```bash
# Node.js / Bun
envman -e myapp:production -- bun start
envman -e myapp:production -- node dist/index.js
envman -e myapp:production -- bun run build

# Docker
envman -e myapp:production -- docker run --env-file <(cat) myimage
# (Catatan: gunakan envman -- env untuk print ke env file)

# Print vars (debug)
envman -e myapp:production -- env | grep -E "^(API|DB|REDIS)"
envman -e myapp:production -- printenv DATABASE_URL

# Python
envman -e myapp:production -- python3 src/main.py
envman -e myapp:production -- uvicorn app.main:app --host 0.0.0.0

# Go binary
envman -e myapp:production -- ./server

# Make target
envman -e myapp:production -- make migrate

# pnpm / npm / yarn
envman -e myapp:production -- pnpm start
envman -e myapp:production -- npm run migrate
```

---

### Aturan merge (urutan prioritas)

```
System env (terendah)
  ↓
-e flag pertama
  ↓
-e flag berikutnya (menang atas sebelumnya)
  ↓ (default)
Hasil akhir (tertinggi)
```

Dengan `--server-wins`:
```
-e vars (terendah)
  ↓
System env (tertinggi, menang)
```

---


## Env — Sinkron .env dengan Environment

Push sebuah file `.env` lokal ke environment project (upsert per key), atau pull
vars sebuah environment menjadi `.env`. Referensikan environment sebagai
`project:env`.

### Push (.env → server)

```bash
envman env push myapp:prod .env          # dari file
envman env push myapp:prod < .env        # dari stdin
cat .env | envman env push myapp:prod    # pipe
envman env push myapp:prod .env --dry-run    # pratinjau tanpa mengubah apa pun
```

Perilaku **upsert**: key yang sudah ada diperbarui nilainya, key baru dibuat.
Key yang ada di server tapi **tidak** ada di file **dibiarkan** (tidak dihapus).
Environment yang belum ada akan dibuat otomatis.

**Auto-deteksi secret** dari nama key (case-insensitive): key yang mengandung
`SECRET`, `TOKEN`, `PASSWORD`, `PRIVATE_KEY`, `API_KEY`, `CREDENTIAL`,
`DATABASE_URL`, `_DSN`, atau berakhiran `_KEY` akan ditandai secret (dienkripsi
di server). Pengecualian: `PUBLIC_KEY` tetap plaintext.

Key yang **sudah** secret di server tetap secret walau heuristik meleset
(server menang). Override per key:

```bash
envman env push myapp:prod .env --plain PUBLIC_URL,BUILD_KEY   # paksa plaintext
envman env push myapp:prod .env --secret LICENSE               # paksa secret
envman env push myapp:prod .env --no-detect                    # matikan auto-deteksi
```

Gunakan `--dry-run` untuk melihat mana yang akan `create`/`update` dan mana yang
jadi `[secret]` sebelum benar-benar push — disarankan sebelum push ke produksi.

### Pull (server → .env)

```bash
envman env pull myapp:prod                # cetak ke stdout
envman env pull myapp:prod > .env         # redirect ke file
envman env pull myapp:prod -o .env        # tulis ke file (atomic)
envman env pull myapp:prod -o .env --force    # timpa file yang sudah ada
```

Nilai yang mengandung spasi, `=`, `#`, atau newline otomatis dikutip
(`KEY="..."`). Dengan `-o`, penulisan bersifat atomik dan **menolak menimpa**
file yang sudah ada kecuali `--force`.

Secret yang **tidak bisa kamu reveal** (akses VIEWER menerima `***`) akan
**dilewati** dan dilaporkan ke stderr — sehingga `.env` yang dihasilkan tetap
valid. Untuk mengambil nilai secret asli, kamu butuh akses EDITOR/OWNER.

### Keys (nama key saja, tanpa value)

Cetak **hanya nama key** dari sebuah `.env` lokal atau environment server —
tanpa value sama sekali. Berguna untuk memberi tahu AI agent *bentuk* sebuah env
tanpa membocorkan rahasia: tinggal paste daftar key-nya.

```bash
envman env keys .env                      # dari file lokal → KEY=
envman env keys myapp:prod                # dari server → KEY=
envman env keys myapp:prod --names        # nama saja: DATABASE_URL (tanpa =)
envman env keys .env | pbcopy             # ke clipboard OS
envman env keys myapp:prod | envman clip set   # ke clipboard akun (lintas device)
```

Sumber dideteksi otomatis: argumen dengan pola `project:env` diambil dari server,
selain itu dianggap path file. Output default adalah template `KEY=` (siap diisi,
sama dengan tombol "Copy keys" di UI); `--names` mencetak nama key polos. Value
**tidak pernah** dikeluarkan — aman dibagikan ke agent atau sebagai dokumentasi.
Karena hanya nama key, akses VIEWER pun cukup.


## Clip — Clipboard Akun Lintas Device

Clipboard slot-tunggal yang menempel di **akun** (bukan device), tersinkron via
server — seperti `pbcopy`/`pbpaste` tapi bisa diakses dari mesin lain dengan
akun yang sama. Berguna saat kamu berpindah antara server dan lokal.

Konten **dienkripsi at-rest** (AES-256-GCM) dan **kedaluwarsa otomatis** setelah
24 jam (default).

### Copy di satu mesin, paste di mesin lain

```bash
# di server (tak ada pbcopy):
cat .env | envman clip set

# di laptop:
envman clip get > .env
```

### Set

```bash
cat .env | envman clip set              # dari stdin
envman clip set .env                     # dari file
envman clip set --ttl 1h < notes.txt     # TTL kustom (30m, 2h, 7d; default 24h)
echo "catatan cepat" | envman clip set   # teks bebas apa saja
```

`set` menimpa isi sebelumnya (slot tunggal). Nilai `--ttl` menerima durasi
(`30m`, `2h`, `7d`) atau angka detik. Server membatasi TTL maksimum (default
7 hari) dan ukuran konten (default 1 MB) — bisa diubah SUPER_ADMIN di
`/dev > Settings`.

### Get

```bash
envman clip get                # cetak ke stdout
envman clip get > .env         # redirect ke file
envman clip get -o .env        # tulis ke file (atomic)
envman clip get -o .env --force    # timpa file yang sudah ada
```

Jika clipboard kosong atau sudah kedaluwarsa, `get` mengembalikan error (exit
code non-nol) — aman dipakai di skrip.

### Clear

```bash
envman clip clear              # kosongkan clipboard
```


## Gists — Kelola Snippet dari CLI

Gist adalah kumpulan file (snippet) yang menempel di **akun**. Kelola dari CLI:
list, cari, ambil, push, pull, dan hapus. Satu gist bisa berisi **banyak file**.

Gist dirujuk lewat **judul** (unik per akun) atau **UUID**-nya. Judul jadi kunci
stabil sehingga `push <judul>` bisa membuat lalu memperbarui gist yang sama.

### List

```bash
envman gists ls                     # sampai 100 gist (milik sendiri + public)
envman gists ls --limit 50
envman gists ls --public            # hanya gist public
envman gists ls -q | fzf            # judul polos, pipe-friendly
envman gists ls --cursor <id>       # halaman berikutnya
```

Tabel: judul, jumlah file, visibility, kapan terakhir diubah, pemilik. Bila ada
halaman berikutnya, cursor dicetak ke **stderr** (`--cursor <id>`).

### Find

```bash
envman gists find docker            # cocokkan judul/deskripsi (case-insensitive)
envman gists find deploy --tags ci,devops
```

Mencari lintas gist milik sendiri **dan** public.

### Get

```bash
envman gists get 'Docker setup'     # detail + daftar file (nama, bahasa, ukuran)
envman gists get 'Docker setup' --json
envman gists get <uuid>             # by UUID
```

### Push (buat / perbarui)

```bash
envman gists push mycfg ./a.ts ./b.json           # 1 gist, 2 file
envman gists push mycfg ./a.ts --force            # timpa a.ts saja — file lain aman
envman gists push mycfg ./a.ts ./b.json --clean   # gist jadi PERSIS file ini
envman gists push notes ./README.md --public --tags docs --desc "catatan"
```

Menggabungkan file lokal ke dalam **satu** gist berjudul `<judul>`. Bahasa tiap
file dideteksi otomatis dari ekstensi.

**Push = upsert per-file** — hanya menyentuh file yang kamu sebut:
- Judul belum ada → gist baru dibuat.
- Nama file baru → **ditambahkan** ke gist.
- Nama file yang **sudah ada** → dibiarkan kecuali kamu beri `--force` (menimpa
  hanya file itu). **File lain tak pernah dihapus.**

Untuk mengganti seluruh isi gist (membuang file yang tak kamu sebut) → `--clean`.
Untuk menghapus satu file → `envman gists rm <judul>:<file>`.

`--public`/`--desc`/`--tags` hanya mengubah field itu **bila kamu menyebutkannya** —
update tak pernah diam-diam mereset metadata. Membuat gist butuh capability
`gist:create`. Token **read-only** (`canWrite=false`) tak bisa push/hapus — hanya
membaca (ls/find/get/pull).

### Pull

```bash
envman gists pull mycfg             # 1 file → stdout
envman gists pull mycfg -o ./out/   # semua file → folder ./out/
envman gists pull mycfg -o ./out/ --force   # timpa file yang sudah ada
```

Tanpa `-o` dan gist berisi **satu** file, isinya dicetak ke stdout. Untuk gist
multi-file, wajib `-o <dir>` — tiap file ditulis atomik ke folder itu.

**Ambil satu file** dari gist multi-file (pipe-friendly) — pakai `--file <name>`
atau ref `judul:namafile`:

```bash
envman gists pull mycfg --file a.ts        # isi a.ts → stdout
envman gists pull mycfg:a.ts               # sama, via ref judul:namafile
envman gists pull mycfg:a.ts | grep KEY    # langsung di-pipe
envman gists pull mycfg --file a.ts -o a.ts   # tulis 1 file ke path
```

`--file` menang atas ref (berguna bila judul mengandung `:`). File tak ditemukan →
error yang menampilkan daftar file tersedia.

### Remove

```bash
envman gists rm mycfg               # hapus seluruh gist (by judul)
envman gists rm <uuid>              # by UUID
envman gists rm mycfg:b.json        # hapus SATU file, sisanya tetap
envman gists rm mycfg --file b.json # sama, via --file
```

Menghapus satu file via ref `judul:namafile` atau `--file` — file lain di gist
dipertahankan. File **terakhir** tak bisa dihapus dengan cara ini (akan menyisakan
gist kosong) — hapus seluruh gist saja. Hanya pemilik (atau SUPER_ADMIN) yang bisa
menghapus.


## Health — Cari File yang Terlalu Besar untuk Konteks AI

`envman health` memindai sebuah project (lokal, tak perlu login) dan melaporkan
file yang jumlah baris/karakternya mendekati atau melewati batas — persis file
yang membludakkan context window agent AI.

### Scan

```bash
envman health                     # scan folder saat ini
envman health ./src               # scan folder tertentu
envman health --status critical   # tampilkan hanya yang kritis
envman health --ext ts,tsx,go     # batasi ke ekstensi tertentu
```

Status file: **ok** (<80% batas), **warning** (80–99%), **critical** (≥100%).
Batas default 500 baris / 20.000 karakter — ubah dengan `--max-lines` /
`--max-chars`. Direktori dependency & build (`node_modules`, `.git`, `dist`,
`vendor`, dll) dan file biner otomatis dilewati. Traversal berhenti di kedalaman
20 (`--depth 0` = tanpa batas; `--depth N` = batas kustom).

### Kirim daftar file bermasalah ke agent

Gunakan `--copy <status>` untuk mencetak **hanya path** (satu per baris) supaya
bisa langsung di-pipe — tinggal tempel ke agent AI dan minta di-split:

```bash
envman health --copy critical | pbcopy          # ke clipboard OS
envman health --copy all | envman clip set      # ke clipboard akun (lintas device)
envman health --copy warning                    # cukup yang warning
```

`--copy all` = warning + critical (semua yang perlu ditindak). `-q` mencetak
semua path polos (opsional dengan `--status`).

### Flag

```
--status ok|warning|critical    filter tampilan
--copy critical|warning|all     cetak path saja (pipe-friendly)
--ext ts,tsx,go                 hanya ekstensi ini (default: semua file teks)
--max-lines N                   batas baris (default 500)
--max-chars N                   batas karakter (default 20000)
--depth N                       kedalaman maksimum (0 = tanpa batas; default 20)
--all                           ikutkan folder tersembunyi (diawali titik)
-q, --quiet                     path polos untuk semua file
```


## Sys — Snapshot Kesehatan Mesin Lokal

`envman sys` menampilkan gambaran cepat kesehatan mesin **tempat CLI dijalankan**:
host & uptime, user & sesi login aktif, alamat jaringan, CPU + load, memory &
swap, dan penggunaan disk per filesystem. Tak perlu login — semua dibaca lokal
**tanpa jaringan keluar**, kecuali `--public-ip` (opt-in).

```bash
envman sys              # ringkasan berwarna
envman sys --json       # snapshot mesin-readable (pipe ke agent / monitor)
envman sys --du .       # + ukuran footprint project (cwd)
envman sys --public-ip  # + IP publik (menghubungi layanan eksternal)
```

### User & jaringan

Blok `user` menampilkan akun yang menjalankan CLI (`username@hostname (uid)`).
Blok `sessions` mendaftar login aktif (mirip `who`) — **disembunyikan** bila hanya
diri sendiri di konsol lokal, ditampilkan bila ada beberapa sesi, sesi remote
(kolom `from <host>`), atau user lain. Blok `net` mendaftar alamat interface
non-loopback (IPv4/IPv6).

`--public-ip` menambah baris IP publik dengan menghubungi layanan eksternal
(default `api.ipify.org`, override via env `ENVMAN_PUBLIC_IP_URL`) — **satu-satunya**
bagian `sys` yang menyentuh jaringan, karena itu opt-in. Gagal fetch → warning di
stderr, snapshot tetap tampil.

### Ukuran project (--du)

`--du <dir>` menambah blok **footprint disk** sebuah direktori: total ukuran +
rincian per entri top-level (mis. `node_modules`, `.git`, `dist`) diurutkan dari
terbesar — langsung kelihatan subdir mana yang bikin project membengkak. Berbeda
dari `envman health` yang justru **melewati** dir dependency; di sini mereka
sengaja **ditampilkan**. Symlink tak diikuti (aman dari loop); entri tak terbaca
dilewati. Maks 12 baris teratas, sisanya dilipat jadi "(N entri lainnya)".

### Status

Memory, swap, dan disk ditandai **warning** pada penggunaan ≥80% dan **critical**
pada ≥90%. Load average dinilai relatif jumlah core logis (load per-core ≥1.0 =
warning, ≥1.5 = critical). Header baris pertama membawa **verdict keseluruhan**
(status terparah di antara memory/swap/CPU/disk).

Filesystem virtual (`tmpfs`, `proc`, `overlay`, dll) dilewati. Mount yang
berbagi pool fisik sama (mis. volume sintetis APFS di macOS) diringkas jadi satu
baris agar tetap enak dibaca sekilas.

### Di dalam container (Docker/cgroup)

Bila `sys` berjalan **di dalam container**, `/proc` melaporkan angka **host**
(memory, CPU cores, uptime, swap) yang menyesatkan — mis. 31 GiB RAM & 8 core
padahal cgroup membatasi 8 GiB & 4 core. Saat container terdeteksi
(`/.dockerenv` atau cgroup PID 1), `sys` membaca batas sebenarnya dari **cgroup**
(v1 & v2) dan menampilkan **limit + host** berdampingan:

```
cpu   ... · 4 of 8 cores · 22% busy · load 0.67 / 0.65 / 0.58
mem   [██········]  25%   2.0 GiB / 8.0 GiB   · host 31.4 GiB
swap  [··········]   0%   2.8 MiB / 8.0 GiB   · host 16.0 GiB
psi   cpu pressure  0.3% / 0.1% / 0.1%  (10s / 60s / 300s stalled)
```

- **memory & swap** dibaca dari cgroup (`memory.max`/`current`, `memory.swap.max`/
  `current`; v1: `limit_in_bytes`/`memsw`). `max` = tak dibatasi → pakai host.
- **CPU cores** = jatah cgroup (`cpu.max` atau `cfs_quota/period`) ditampilkan
  sebagai `N of M cores`; load dinilai relatif jatah ini, bukan core host.
- **uptime** dihitung dari start PID 1 container, bukan uptime host.
- **PSI** (`cpu.pressure`) — persen waktu ter-stall (10s/60s/300s), sinyal
  saturasi per-container yang lebih jujur daripada load average host-wide.
- **verdict** keseluruhan menilai batas cgroup, bukan headroom host.

Di bare metal (bukan container) output tak berubah.

### Kirim ke agent atau monitor

```bash
envman sys --json | envman clip set     # ke clipboard akun (lintas device)
envman sys --json | jq '.disks[]'       # olah lebih lanjut
```

### Flag

```
--json       cetak snapshot sebagai JSON
--du <dir>   tambah footprint disk direktori (total + rincian subdir)
--public-ip  tambah IP publik (menghubungi layanan eksternal, opt-in)
```

> Membaca **mesin lokal saja**. Untuk memeriksa stack remote, pakai `envman pt`
> (`envman portainer status <project>:<env>`).


## Eksekusi File Project (tanpa simpan ke disk)

File yang tersimpan di project (tab Files) bisa langsung dieksekusi — content di-stream ke interpreter via stdin, tidak pernah ditulis ke disk.

### Sintaks

```bash
envman [flag...] -- <interpreter> <project>:<path/file.ext>
```

### Contoh berbagai interpreter

```bash
# Bash script
envman -- bash myapp:scripts/deploy.sh
envman -- bash myapp:scripts/migrate.sh

# Shell script dengan vars inject
envman -e myapp:production -- bash myapp:scripts/deploy.sh

# Bun / TypeScript (npm install otomatis tanpa node_modules)
envman -- bun myapp:scripts/seed.ts
envman -- bun myapp:jobs/process-queue.ts
envman -e myapp:production -- bun myapp:scripts/migrate.ts

# Node.js
envman -- node myapp:scripts/cleanup.js
envman -e myapp:staging -- node myapp:scripts/verify.js

# Python
envman -- python3 myapp:scripts/etl.py
envman -e myapp:production -- python3 myapp:jobs/sync.py

# Deno
envman -- deno myapp:scripts/fetch-data.ts

# Dengan args tambahan
envman -- bash myapp:scripts/deploy.sh --env production --dry-run
envman -e myapp:production -- bun myapp:scripts/seed.ts --count 100
```

### Interpreter stdin (zero disk write)

| Interpreter | Metode |
|-------------|--------|
| `bash`, `sh`, `zsh` | pipe via `-s` |
| `bun` | `bun run -` + `--install=fallback` |
| `node` | `--input-type=module` |
| `python3`, `python` | pipe via `-` |
| `deno` | `deno run -` |
| lainnya | temp file 0600 (auto-delete) |

### Bun scripts — import npm inline

```typescript
// myapp:scripts/send-email.ts — tidak butuh node_modules
import { Resend } from "resend@^2.0"
import { z } from "zod@^3.22"
// envman otomatis inject --install=fallback ke bun
```

### Disambiguasi path vs env name

Setelah titik dua (`:`):
- Ada `/` → file reference (misal: `scripts/deploy.sh`)
- Ekstensi dikenal (`sh`, `ts`, `py`, `yaml`, `sql`, dll.) → file reference
- Sisanya → nama environment (termasuk `staging.v2`, `env.local`)

```bash
envman -- bash myapp:scripts/deploy.sh    # file (ada /)
envman -- bun  myapp:seed.ts              # file (ekstensi .ts)
envman -e myapp:staging.v2 -- bun start  # environment (bukan file)
envman -e myapp:env.local -- bun dev     # environment
```

---

## Alias Expansion (envman run)

Alias menyimpan command + sources di server. `envman run` fetch, parse ulang, lalu execute.

```bash
envman run myapp:deploy              # ekspansi alias "deploy"
envman run myapp:migrate             # ekspansi alias "migrate"
envman run myapp:seed                # ekspansi alias "seed"

# Extra -e di-merge (alias sources menang — posisi terakhir).
# -e wajib SEBELUM ref alias.
envman run -e .env.local myapp:deploy

# Flag tambahan setelah ref diteruskan langsung ke command alias
envman run myapp:deploy --dry-run
envman run claude:malik-opus --resume
envman run myapp:seed --count 50 --reset

# -- masih valid sebagai pemisah eksplisit (mis. arg yang bentrok dengan flag envman)
envman run myapp:deploy -- --dry-run

# Auth via file
envman run -e .env.secrets myapp:deploy
```

### Alias vs langsung

| Situasi | Rekomendasi |
|---------|------------|
| Command yang sering dipakai tim | `envman run project:alias` |
| Script sekali pakai / debug | `envman -- bash project:scripts/x.sh` |
| Inject vars ke dev server | `envman -e project:env -- bun dev` |

---

## Fetch docs ke AI context

```bash
envman docs              # print ke stdout
envman docs | pbcopy     # salin ke clipboard (macOS)
envman docs > context.md # simpan ke file, attach ke AI agent

# Fetch dari server langsung (tanpa envman terinstall)
curl -s {{SERVER}}/api/cli-docs.md -H "Authorization: Bearer <token>"
```

---


## Storage — File per Project

Simpan dan ambil file (skrip, config, gambar, backup) yang terikat ke project.

### List file

```bash
envman storage ls myapp                      # list semua di root
envman storage ls myapp --prefix assets/     # list folder assets/
envman storage ls myapp --prefix scripts/    # list folder scripts/
envman storage ls myapp --page 2             # halaman berikutnya (50/halaman)
```

Output: kuota terpakai, daftar folder, daftar file (path · ukuran · MIME · public).

### Upload

```bash
# Path remote = basename file lokal
envman storage upload myapp compose.yml
envman storage upload myapp ./nginx.conf
envman storage upload myapp database.sql

# Path remote eksplisit
envman storage upload myapp ./compose.yml --path infra/compose.yml
envman storage upload myapp ./logo.png     --path assets/images/logo.png
envman storage upload myapp ./seed.sql     --path backup/2026-07-04.sql

# Upload dari script (CI/CD)
envman storage upload myapp ./dist/report.html --path reports/$(date +%F).html

# Upload seluruh folder (rekursif)
envman storage upload myapp ./assets/              # → assets/logo.png, assets/sub/icon.svg, ...
envman storage upload myapp ./dist/ --path static  # → static/index.html, static/bundle.js, ...

# Jangan timpa file yang sudah ada (--no-clobber / -n)
envman storage upload myapp ./logo.png -n          # error + exit 1 jika logo.png sudah ada
envman storage upload myapp ./assets/ -n           # lewati file yang sudah ada, upload sisanya
```

**Default: overwrite.** Upload ke path yang sudah terisi akan **menimpa** file lama (upsert). Pakai `--no-clobber` (`-n`) untuk mencegah: file tunggal → error + exit 1; folder → file yang sudah ada dilewati, sisanya tetap diupload (seperti `cp -n`).

**File ≤ 50 MB** — upload langsung via server, progress bar realtime.

**File > 50 MB** — otomatis memakai **chunked multipart upload**: file dipecah jadi chunk 50 MB, dikirim satu per satu melalui server → MinIO. Aman melewati Cloudflare (batas 100 MB per request tidak berlaku karena setiap chunk kecil).

Fitur resume: jika koneksi putus atau Ctrl+C, state disimpan ke `~/.cache/envman/upload-*.json`. Jalankan perintah yang sama untuk melanjutkan dari chunk terakhir — tidak perlu mulai dari awal.

```bash
# File besar — CLI otomatis pakai chunked (tidak perlu flag khusus)
envman storage upload myapp ./model-weights.bin --path ml/weights.bin
# [envman] File besar (2.1 GB) — memakai chunked upload (43 chunk × 50 MB)
# weights.bin  [████████░░░░░░░░░░░░]  38%  800.0/2100.0 MB  12.3 MB/s  ~1m51s
```

Upload folder menampilkan progress `[N/total]` per file.

### Download — streaming ke stdout

```bash
# Stream langsung ke tool (composable)
envman storage download myapp:infra/compose.yml  | docker compose -f - up -d
envman storage download myapp:infra/compose.yml  | docker compose -f - pull
envman storage download myapp:scripts/setup.sh   | bash
envman storage download myapp:scripts/migrate.sh | bash -s -- --env production
envman storage download myapp:backup/dump.sql     | psql mydb
envman storage download myapp:backup/dump.sql     | mysql -u root mydb
envman storage download myapp:config/nginx.conf   | sudo tee /etc/nginx/nginx.conf
envman storage download myapp:config/grafana.ini  | sudo tee /etc/grafana/grafana.ini

# Simpan ke file (-o)
envman storage download myapp:assets/logo.png      -o logo.png
envman storage download myapp:infra/compose.yml    -o /tmp/compose.yml
envman storage download myapp:backup/latest.sql    -o /var/backups/restore.sql

# Inject vars + download + execute sekaligus
envman -e myapp:production -- bash -c "$(envman storage download myapp:scripts/deploy.sh)"

# Verifikasi konten tanpa simpan
envman storage download myapp:config/nginx.conf | nginx -t -c /dev/stdin
```

Download stream langsung dari MinIO — tidak melewati server envman (presigned URL).

### Exec — download binary lalu jalankan langsung (cached)

Untuk file **binary** (bukan script teks), `storage exec` menjalankannya langsung.
Binary di-cache di `~/.cache/envman/exec` (mode 0700) dan dipakai ulang selama tidak
berubah — run berulang jadi **instan** (hanya request metadata kecil untuk cek kesegaran,
nol transfer byte). Argumen setelah `--` diteruskan; exit code program dipropagasi.

```bash
envman storage exec myapp:bin/tts-go                       # run 1: download+cache; run berikutnya: instan
envman storage exec myapp:bin/tts-go -- --port 8080        # teruskan argumen
envman storage exec --offline myapp:bin/tts-go             # pakai cache tanpa hubungi server
envman storage exec --no-cache myapp:bin/tts-go            # paksa download ulang
envman -e myapp:prod -- envman storage exec myapp:bin/tts-go  # inject vars + jalankan
```

Cache tervalidasi via `size` + `updatedAt` dari server — file di-replace di server →
otomatis download ulang (tidak menjalankan versi basi). Cache dipisah per server+project+path
(hash), jadi binary bernama sama di project berbeda (mis. `a:tts-go` vs `b:tts-go`)
tidak pernah bertabrakan. Total cache dibatasi 500 MB (prune LRU).

Binary tidak bisa di-pipe ke `| bash` (hanya script teks yang bisa) — pakai `exec` untuk binary.

### Hapus folder

```bash
envman storage rm myapp:assets/            # hapus folder assets/ dan semua isinya
envman storage rm myapp:backup/2026-01/    # hapus subfolder spesifik
```

Hanya OWNER project yang bisa menghapus folder. Operasi tidak bisa dibatalkan.

### Pattern CI/CD dengan storage

```bash
# Deploy: ambil compose + jalankan
envman storage download myapp:infra/compose.yml | docker compose -f - up -d --pull always

# Backup database, upload ke storage
pg_dump mydb | gzip > /tmp/backup.sql.gz
envman storage upload myapp /tmp/backup.sql.gz --path backup/$(date +%F).sql.gz

# Restore backup terbaru
envman storage download myapp:backup/latest.sql.gz | gunzip | psql mydb

# Sync config ke server
envman storage download myapp:config/app.json -o /etc/myapp/config.json
systemctl restart myapp
```

---


## Portainer — Kontrol Stack per Environment

Operasikan stack Portainer yang terikat ke sebuah environment project. Server
menyimpan detail connection, stack, dan endpoint per-env, jadi kamu cukup
mereferensikan environment sebagai `project:env` — tidak perlu tahu ID stack.

Alias perintah: `envman pt ...` = `envman portainer ...`.

### Status & container

```bash
envman portainer status myapp:prod          # ringkasan stack + tabel container (state · status · image · ports)
envman portainer ps myapp:prod              # daftar container ringkas (id · state · nama · image)
envman portainer inspect myapp:prod web     # detail 1 container
```

`status` menampilkan header stack (nama, aktif/inaktif) lalu satu baris per
container: short-id, state, status/uptime Docker, nama, dan port mapping.

`inspect <container>` memberi detail mendalam satu container: state + health
check, uptime (`Started`), jumlah restart, exit code (bila mati), port, mount,
dan penggunaan CPU/memori real-time (saat container berjalan).

### Logs — snapshot & live

```bash
envman portainer logs myapp:prod web              # snapshot: 200 baris terakhir
envman portainer logs myapp:prod web --tail 500   # snapshot: 500 baris terakhir (maks 1000)
envman portainer logs myapp:prod web -f           # live: stream sampai Ctrl+C
envman portainer logs myapp:prod web -f --tail 50 # 50 baris awal lalu ikut live
```

Tanpa `-f` → cetak N baris terakhir lalu keluar. Dengan `-f` (follow) → stream
baris baru secara real-time (SSE) sampai diinterupsi. `<container>` = ID/short-ID
dari `ps`.

### Restart — tiga tingkatan

```bash
envman portainer restart-soft myapp:prod      # stop→start stack, TANPA pull image
envman portainer restart-recreate myapp:prod  # recreate stack (redeploy compose)
envman portainer restart-repull myapp:prod    # pull image terbaru lalu recreate
```

- `restart-soft` — restart paling ringan (butuh capability `stack:power` atau role EDITOR/OWNER).
- `restart-recreate` / `restart-repull` — redeploy (butuh `stack:deploy` atau EDITOR/OWNER).

### Maintenance

```bash
envman portainer sync-repull myapp:prod   # push env vars project ke stack lalu repull
envman portainer prune myapp:prod         # prune dangling image di endpoint stack
```

### Izin

Perintah baca (`status`, `ps`, `logs`) butuh akses environment (VIEWER+ / capability
`stack:operate`). Perintah tulis di-gate per-capability atau role env — lihat tabel
Portainer Capabilities di referensi API server. Env yang aksesnya ditolak →
`[envman] Akses ditolak untuk env ...` + exit 1.

---


## CI/CD — Integrasi

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install envman
        run: curl -fsSL {{SERVER}}/install | bash

      - name: Deploy
        env:
          ENVMAN_SERVER: {{SERVER}}
          ENVMAN_TOKEN: ${{ secrets.ENVMAN_TOKEN }}
        run: envman -e myapp:production -- bun run deploy

      - name: Run migration
        env:
          ENVMAN_SERVER: {{SERVER}}
          ENVMAN_TOKEN: ${{ secrets.ENVMAN_TOKEN }}
        run: envman -e myapp:production -- bun run db:migrate

      - name: Upload build artifact
        env:
          ENVMAN_SERVER: {{SERVER}}
          ENVMAN_TOKEN: ${{ secrets.ENVMAN_TOKEN }}
        run: envman storage upload myapp ./dist/app.tar.gz --path releases/$(date +%F)-${{ github.sha }}.tar.gz
```

### GitLab CI

```yaml
# .gitlab-ci.yml
variables:
  ENVMAN_SERVER: "{{SERVER}}"
  # ENVMAN_TOKEN: set di GitLab CI/CD Variables (masked)

before_script:
  - curl -fsSL {{SERVER}}/install | bash

deploy:
  script:
    - envman -e myapp:production -- bun run deploy
    - envman storage download myapp:scripts/post-deploy.sh | bash
```

### Docker — inject vars ke container

```bash
# Cara 1: lewat env langsung
envman -e myapp:production -- docker run --rm \
  -e DATABASE_URL -e REDIS_URL -e SECRET_KEY \
  myimage:latest bun start

# Cara 2: env file sementara
envman -e myapp:production -- env > /tmp/prod.env
docker run --env-file /tmp/prod.env myimage:latest
rm /tmp/prod.env

# Cara 3: docker compose dengan override
envman storage download myapp:infra/compose.yml | \
  docker compose -f - -e DATABASE_URL=$DATABASE_URL up -d
```

### Shell script automation

```bash
#!/usr/bin/env bash
# deploy.sh — template script tanpa hardcode credentials

set -euo pipefail

# Auth dari env var (set oleh CI/CD atau .bashrc)
: "${ENVMAN_SERVER:?set ENVMAN_SERVER}"
: "${ENVMAN_TOKEN:?set ENVMAN_TOKEN}"

echo "Fetching latest config..."
envman storage download myapp:infra/compose.yml -o /tmp/compose.yml

echo "Pulling latest images..."
docker compose -f /tmp/compose.yml pull

echo "Restarting services..."
envman -e myapp:production -- docker compose -f /tmp/compose.yml up -d

echo "Running migrations..."
envman -e myapp:production -- bun run db:migrate

echo "Done."
```

### Kubernetes / Helm

```bash
# Generate env file dari server, inject ke kubectl
envman -e myapp:production -- env > .k8s.env
kubectl create secret generic myapp-secrets --from-env-file=.k8s.env --dry-run=client -o yaml | kubectl apply -f -
rm .k8s.env

# Atau lewat Helm values
envman -e myapp:production -- helm upgrade myapp ./chart \
  --set "config.databaseUrl=$DATABASE_URL" \
  --set "config.redisUrl=$REDIS_URL"
```

---


## Troubleshooting

### Error umum

```
[envman] not logged in: run 'envman login <server> --token <token>'
```
**Penyebab**: Tidak ada credentials tersimpan dan ENVMAN_SERVER/ENVMAN_TOKEN tidak di-set.
**Fix**: `envman login <server-url> --token <token>` atau set env var.

---

```
[envman] API error 401: Unauthorized
```
**Penyebab**: Token expired, revoked, atau salah.
**Fix**: Buat token baru di Profile → API Tokens, lalu `envman login` ulang.

---

```
[envman] API error 403: Forbidden
[envman] Akses ditolak untuk env: myapp:production
```
**Penyebab**: Token tidak punya akses ke project/environment tersebut. Member baru di-DENY secara default.
**Fix**: Minta OWNER project untuk grant akses env via Members → matrix view.

---

```
[envman] API error 404: Not Found
```
**Penyebab**: Slug project atau nama environment salah.
**Fix**: Cek nama di browser → URL project adalah slugnya.

---

```
[envman] file not found: myapp:scripts/deploy.sh
```
**Penyebab**: File belum diupload ke project, atau path salah.
**Fix**: Upload file via UI (tab Files) atau `envman storage upload myapp ./deploy.sh --path scripts/deploy.sh`.

---

```
[envman] open ./compose.yml: no such file or directory
```
**Penyebab**: File lokal tidak ditemukan saat upload.
**Fix**: Cek path file, jalankan dari direktori yang benar.

---

```
[envman] chunk N/M gagal setelah 3 percobaan: ...
Jalankan perintah yang sama untuk melanjutkan.
```
**Penyebab**: Koneksi ke server envman terputus saat chunked upload (file >50 MB).
**Fix**: Jalankan perintah upload yang sama persis — CLI otomatis lanjut dari chunk terakhir yang berhasil (state tersimpan di `~/.cache/envman/upload-*.json`).

---

```
[envman] File terlalu besar (maks X MB)
```
**Penyebab**: Ukuran file melebihi batas per-project atau global default.
**Fix**: Minta SUPER_ADMIN menaikkan batas via Settings project, atau kompres file terlebih dahulu.

---

```
envman: command not found
```
**Fix**: Pastikan `/usr/local/bin` ada di `PATH`, atau jalankan dengan path penuh: `/usr/local/bin/envman`.

---

### Debug vars yang terinjeksi

```bash
# Print semua vars yang akan diinjeksi (tanpa jalankan app)
envman -e myapp:production -- env | sort

# Cek satu var spesifik
envman -e myapp:production -- printenv DATABASE_URL

# Bandingkan dua environment
diff <(envman -e myapp:staging -- env | sort) <(envman -e myapp:production -- env | sort)
```

### Cek apakah token valid

```bash
envman whoami
# Output: User: user@example.com (ADMIN)
#         Token: my-deploy-token
#         Server: https://envman.example.com
```

---

## Referensi Commands

```bash
envman login <server-url> --token <token>        # simpan credentials
envman logout                                     # hapus credentials
envman whoami                                     # cek status & token aktif
envman update                                     # update binary ke versi terbaru
envman docs                                       # print CLI reference ini ke stdout

envman -e project:env -- <command>               # inject & run
envman run project:alias                          # ekspansi alias & run
envman -- <interpreter> project:path/file.ext    # eksekusi file project

envman storage ls <project>                       # list files
envman storage ls <project> --prefix folder/
envman storage upload <project> <file|dir>        # upload file atau folder (auto chunked >50 MB)
envman storage upload <project> <file> --path remote/path
envman storage upload <project> <dir> --path remote/prefix
envman storage download <project>:<path>          # download ke stdout
envman storage download <project>:<path> -o file  # download ke file
envman storage rm <project>:<folder>/             # hapus folder beserta isinya (OWNER)
```

---

