export function buildTroubleshootSection(): string {
  return `
## Troubleshooting

### Error umum

\`\`\`
[envman] not logged in: run 'envman login <server> --token <token>'
\`\`\`
**Penyebab**: Tidak ada credentials tersimpan dan ENVMAN_SERVER/ENVMAN_TOKEN tidak di-set.
**Fix**: \`envman login <server-url> --token <token>\` atau set env var.

---

\`\`\`
[envman] API error 401: Unauthorized
\`\`\`
**Penyebab**: Token expired, revoked, atau salah.
**Fix**: Buat token baru di Profile → API Tokens, lalu \`envman login\` ulang.

---

\`\`\`
[envman] API error 403: Forbidden
[envman] Akses ditolak untuk env: myapp:production
\`\`\`
**Penyebab**: Token tidak punya akses ke project/environment tersebut. Member baru di-DENY secara default.
**Fix**: Minta OWNER project untuk grant akses env via Members → matrix view.

---

\`\`\`
[envman] API error 404: Not Found
\`\`\`
**Penyebab**: Slug project atau nama environment salah.
**Fix**: Cek nama di browser → URL project adalah slugnya.

---

\`\`\`
[envman] file not found: myapp:scripts/deploy.sh
\`\`\`
**Penyebab**: File belum diupload ke project, atau path salah.
**Fix**: Upload file via UI (tab Files) atau \`envman storage upload myapp ./deploy.sh --path scripts/deploy.sh\`.

---

\`\`\`
[envman] open ./compose.yml: no such file or directory
\`\`\`
**Penyebab**: File lokal tidak ditemukan saat upload.
**Fix**: Cek path file, jalankan dari direktori yang benar.

---

\`\`\`
envman: command not found
\`\`\`
**Fix**: Pastikan \`/usr/local/bin\` ada di \`PATH\`, atau jalankan dengan path penuh: \`/usr/local/bin/envman\`.

---

### Debug vars yang terinjeksi

\`\`\`bash
# Print semua vars yang akan diinjeksi (tanpa jalankan app)
envman -e myapp:production -- env | sort

# Cek satu var spesifik
envman -e myapp:production -- printenv DATABASE_URL

# Bandingkan dua environment
diff <(envman -e myapp:staging -- env | sort) <(envman -e myapp:production -- env | sort)
\`\`\`

### Cek apakah token valid

\`\`\`bash
envman whoami
# Output: User: user@example.com (ADMIN)
#         Token: my-deploy-token
#         Server: https://envman.example.com
\`\`\`

---

## Referensi Commands

\`\`\`bash
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
envman storage upload <project> <file>            # upload (streaming)
envman storage upload <project> <file> --path remote/path
envman storage download <project>:<path>          # download ke stdout
envman storage download <project>:<path> -o file  # download ke file
\`\`\`

---
`
}
