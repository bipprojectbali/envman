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
\`\`\`

Upload **streaming** dari disk ke server — tidak di-buffer ke memori. Aman untuk file besar. Upload folder menampilkan progress \`[N/total]\` per file.

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
