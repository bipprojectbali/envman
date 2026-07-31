export function buildClipboardSection(): string {
  return `
## Clipboard — \`--copy\` & \`envman install pbcopy\`

Perintah yang mengeluarkan rahasia bisa menyalurkannya **langsung ke clipboard**
alih-alih mencetaknya. Alasannya: nilai yang tercetak menempel di **scrollback
terminal** — terlihat saat screenshot, screen-share, atau sekadar orang lewat.

\`\`\`bash
envman env get myapp:prod DB_PASSWORD --copy    # nilai tak pernah tampil
envman env pull myapp:prod --copy               # seluruh .env
envman clip get --copy
envman transfer get <id> --copy
envman gists pull mycfg --file a.ts --copy
envman health --paths critical --copy           # daftar path
\`\`\`

Yang tercetak hanya konfirmasi ke stderr, jadi \`stdout\` benar-benar kosong:

\`\`\`
[envman] DB_PASSWORD disalin ke clipboard (23 karakter, via pbcopy)
\`\`\`

> ⚠️ **Clipboard bukan penyimpanan aman.** Aplikasi lain di mesinmu bisa
> membacanya, dan macOS menyinkronkannya ke iPhone lewat Universal Clipboard.
> \`--copy\` memindahkan risiko dari *"terlihat di layar & scrollback"* ke
> *"ada di clipboard sesaat"* — lebih baik, tapi bukan tanpa risiko. Tempel lalu
> salin hal lain bila isinya sensitif.

\`--copy\` tak bisa digabung dengan \`-o\` (dua tujuan output sekaligus).

### Bekerja juga lewat SSH

envman mencoba berurutan: \`pbcopy\` (macOS) → \`wl-copy\` (Wayland) →
\`xsel\`/\`xclip\` (X11) → **OSC 52**.

OSC 52 adalah escape sequence yang ditindaklanjuti oleh **terminal**, bukan
mesin remote — jadi menjalankan \`--copy\` di server SSH akan mengisi clipboard
**laptopmu**. Tak perlu X11, tak perlu paket tambahan.

\`\`\`bash
ssh server 'envman env get myapp:prod DB_PASSWORD --copy'
# → clipboard laptop terisi
\`\`\`

Syaratnya terminal mendukung OSC 52 (kitty, wezterm, iTerm2, alacritty, foot,
xterm dengan \`allowWindowOps\`). Di **tmux** aktifkan dulu:

\`\`\`
set -g set-clipboard on
\`\`\`

OSC 52 bersifat **kirim-lalu-lupa** — terminal yang mengabaikannya tak memberi
tanda apa pun, jadi envman memberitahu saat jalur ini dipakai. Khusus
\`transfer get\` (hangus-sekali-baca) peringatannya lebih keras, karena kiriman
sudah terbakar saat itu: **tempel segera untuk memastikan**.

### \`envman install pbcopy\` — untuk program selain envman

\`\`\`bash
envman install pbcopy          # pasang shim ke ~/.local/bin
envman install pbcopy --dry-run
\`\`\`

Memasang \`pbcopy\`/\`pbpaste\` berbasis OSC 52 yang sama, sebagai perintah biasa
di \`PATH\`. Gunanya untuk **output program lain**:

\`\`\`bash
cat ~/.ssh/id_ed25519.pub | pbcopy
docker logs app 2>&1 | tail -50 | pbcopy
\`\`\`

Untuk output envman sendiri, \`--copy\` lebih baik — tak ada pipe yang bisa lupa
diketik, dan tak butuh apa pun terpasang lebih dulu.

### Jangan tertukar: \`envman clip\` vs \`--copy\`

Dua clipboard yang namanya mirip tapi berbeda:

| | \`envman clip\` | \`--copy\` |
|---|---|---|
| Letak | **Server** (nempel akunmu) | **Clipboard OS** mesin ini |
| Lintas device | ✅ ambil dari mesin lain | ❌ lokal saja |
| Kedaluwarsa | ✅ TTL otomatis | ❌ sampai tertimpa |
| Untuk | memindahkan antar mesin | menempel di sini, sekarang |

Keduanya bisa dipakai bersama: \`envman clip get --copy\` mengambil dari clipboard
akun lalu menaruhnya di clipboard OS.
`
}
