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

# Extra -e di-merge (alias sources menang — posisi terakhir)
envman run -e .env.local myapp:deploy

# Args tambahan setelah --
envman run myapp:deploy -- --dry-run
envman run myapp:seed -- --count 50 --reset

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

