export function buildStorageSection(): string {
  return `
## Storage — File per Project

Simpan dan ambil file (skrip, config, gambar, backup) yang terikat ke project.

### List file

\`\`\`bash
envman storage ls myapp                      # list semua di root
envman storage ls myapp --prefix assets/     # list folder assets/
envman storage ls myapp --prefix scripts/    # list folder scripts/
envman storage ls myapp --page 2             # halaman berikutnya (50/halaman)
\`\`\`

Output: kuota terpakai, daftar folder, daftar file (path · ukuran · MIME · public).

### Upload

\`\`\`bash
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
\`\`\`

**Default: overwrite.** Upload ke path yang sudah terisi akan **menimpa** file lama (upsert). Pakai \`--no-clobber\` (\`-n\`) untuk mencegah: file tunggal → error + exit 1; folder → file yang sudah ada dilewati, sisanya tetap diupload (seperti \`cp -n\`).

**File ≤ 50 MB** — upload langsung via server, progress bar realtime.

**File > 50 MB** — otomatis memakai **chunked multipart upload**: file dipecah jadi chunk 50 MB, dikirim satu per satu melalui server → MinIO. Aman melewati Cloudflare (batas 100 MB per request tidak berlaku karena setiap chunk kecil).

Fitur resume: jika koneksi putus atau Ctrl+C, state disimpan ke \`~/.cache/envman/upload-*.json\`. Jalankan perintah yang sama untuk melanjutkan dari chunk terakhir — tidak perlu mulai dari awal.

\`\`\`bash
# File besar — CLI otomatis pakai chunked (tidak perlu flag khusus)
envman storage upload myapp ./model-weights.bin --path ml/weights.bin
# [envman] File besar (2.1 GB) — memakai chunked upload (43 chunk × 50 MB)
# weights.bin  [████████░░░░░░░░░░░░]  38%  800.0/2100.0 MB  12.3 MB/s  ~1m51s
\`\`\`

Upload folder menampilkan progress \`[N/total]\` per file.

### Download — streaming ke stdout

\`\`\`bash
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
\`\`\`

Download stream langsung dari MinIO — tidak melewati server envman (presigned URL).

### Exec — download binary lalu jalankan langsung (cached)

Untuk file **binary** (bukan script teks), \`storage exec\` menjalankannya langsung.
Binary di-cache di \`~/.cache/envman/exec\` (mode 0700) dan dipakai ulang selama tidak
berubah — run berulang jadi **instan** (hanya request metadata kecil untuk cek kesegaran,
nol transfer byte). Argumen setelah \`--\` diteruskan; exit code program dipropagasi.

\`\`\`bash
envman storage exec myapp:bin/tts-go                       # run 1: download+cache; run berikutnya: instan
envman storage exec myapp:bin/tts-go -- --port 8080        # teruskan argumen
envman storage exec --offline myapp:bin/tts-go             # pakai cache tanpa hubungi server
envman storage exec --no-cache myapp:bin/tts-go            # paksa download ulang
envman -e myapp:prod -- envman storage exec myapp:bin/tts-go  # inject vars + jalankan
\`\`\`

Cache tervalidasi via \`size\` + \`updatedAt\` dari server — file di-replace di server →
otomatis download ulang (tidak menjalankan versi basi). Cache dipisah per server+project+path
(hash), jadi binary bernama sama di project berbeda (mis. \`a:tts-go\` vs \`b:tts-go\`)
tidak pernah bertabrakan. Total cache dibatasi 500 MB (prune LRU).

Binary tidak bisa di-pipe ke \`| bash\` (hanya script teks yang bisa) — pakai \`exec\` untuk binary.

### Hapus folder

\`\`\`bash
envman storage rm myapp:assets/            # hapus folder assets/ dan semua isinya
envman storage rm myapp:backup/2026-01/    # hapus subfolder spesifik
\`\`\`

Hanya OWNER project yang bisa menghapus folder. Operasi tidak bisa dibatalkan.

### Pattern CI/CD dengan storage

\`\`\`bash
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
\`\`\`

---
`
}
