# Fitur `pbcopy` / `pbpaste` di Devbox

Padanan `pbcopy`/`pbpaste` (macOS) untuk lingkungan **headless / SSH** seperti
devbox ini. Menyalin teks ke **clipboard mesin lokalmu** (laptop), bukan ke
clipboard di dalam container.

---

## Kenapa ini dibutuhkan

Di macOS ada `pbcopy`. Di Linux desktop biasanya pakai `xclip`, `xsel`, atau
`wl-copy`. **Tapi semua itu tidak berguna di devbox**, karena:

- Devbox ini **headless** — tidak ada X11 (`DISPLAY` kosong) maupun Wayland.
- `xclip`/`wl-copy` menyalin ke clipboard *display server*; tanpa display
  server, tidak ada tempat menaruh teks.
- Clipboard yang sebenarnya kamu pedulikan ada di **mesin lokal** (tempat kamu
  menjalankan terminal SSH), bukan di dalam container.

Solusinya: **OSC 52**, sebuah *escape sequence* terminal. Alih-alih menaruh
teks di clipboard container, kita mengirim urutan byte khusus ke terminal.
Terminal lokal (kitty, WezTerm, iTerm2, dst.) mengenali urutan itu dan menaruh
teksnya ke clipboard sistem lokalmu — menyeberang lewat koneksi SSH tanpa perlu
tool tambahan di sisi server.

```
[Helix / echo / cmd apa pun]
        │  teks
        ▼
   pbcopy  ── membungkus jadi OSC 52 ──►  /dev/tty
                                             │  (lewat pipe SSH)
                                             ▼
                                    Terminal LOKAL (kitty/wezterm/…)
                                             │
                                             ▼
                                   Clipboard sistem lokalmu ✔
```

---

## Skrip `pbcopy`

Lokasi: `~/.local/bin/pbcopy`

```bash
#!/usr/bin/env bash
# pbcopy ala macOS untuk terminal/SSH via OSC 52.
# Mengirim stdin ke clipboard mesin LOKAL lewat escape sequence terminal.
# Butuh terminal yang mendukung OSC 52 (kitty, wezterm, iTerm2, alacritty,
# foot, xterm allowWindowOps, tmux/screen dgn passthrough aktif).
buf=$(cat)
b64=$(printf %s "$buf" | base64 | tr -d '\n')
seq="\033]52;c;${b64}\a"
if [ -n "$TMUX" ]; then
  # tmux: bungkus dengan DCS passthrough
  seq="\033Ptmux;\033${seq}\033\\"
elif [ "${TERM%%-*}" = "screen" ]; then
  # GNU screen: passthrough serupa
  seq="\033P${seq}\033\\"
fi
# Kirim ke controlling terminal bila ada; jika tidak (mis. pipe/cron),
# jatuh ke stdout supaya tetap bisa di-redirect.
if { printf "%b" "$seq" > /dev/tty; } 2>/dev/null; then
  :
else
  printf "%b" "$seq"
fi
```

## Skrip `pbpaste`

Lokasi: `~/.local/bin/pbpaste`

```bash
#!/usr/bin/env bash
# pbpaste via OSC 52: minta terminal mengirim balik isi clipboard.
# Catatan: banyak terminal MENOLAK 'paste' OSC 52 demi keamanan
# (kitty & wezterm butuh diaktifkan; iTerm2 sering nonaktif).
# Kalau tidak ada balasan dalam 1 detik, keluar diam-diam.
old=$(stty -g 2>/dev/null)
stty -echo raw 2>/dev/null
printf "\033]52;c;?\a" > /dev/tty
resp=""
IFS= read -r -d $'\a' -t 1 resp < /dev/tty 2>/dev/null
[ -n "$old" ] && stty "$old" 2>/dev/null
b64=${resp##*;c;}
[ -n "$b64" ] && printf %s "$b64" | base64 -d 2>/dev/null
```

---

## Cara kerja (langkah demi langkah)

### `pbcopy`

1. **`buf=$(cat)`** — baca seluruh teks dari stdin.
2. **`base64`** — encode teksnya. OSC 52 mensyaratkan payload dalam base64
   (aman untuk teks apa pun, termasuk newline & karakter khusus). `tr -d '\n'`
   membuang baris baru dari output base64 agar jadi satu baris.
3. **Rakit escape sequence**: `\033]52;c;<base64>\a`
   - `\033` = `ESC`, `]52` = perintah OSC 52, `c` = target clipboard
     (`c` = clipboard, bisa juga `p` = primary selection),
     `\a` = `BEL` sebagai penutup.
4. **Pembungkus tmux/screen** — kalau berjalan di dalam multiplexer, escape
   sequence harus dibungkus *passthrough* agar diteruskan ke terminal luar,
   bukan ditelan oleh tmux/screen.
5. **Kirim ke `/dev/tty`** — ditulis langsung ke terminal (bukan stdout), supaya
   tetap bekerja walau output di-pipe. Kalau tidak ada tty (mis. dijalankan dari
   cron/pipe), jatuh ke stdout sebagai cadangan.

### `pbpaste`

1. Set terminal ke mode raw sementara (menyimpan state lama untuk dipulihkan).
2. Kirim query OSC 52 (`\033]52;c;?\a`) — tanda `?` meminta terminal
   **mengirim balik** isi clipboard.
3. Baca balasan hingga karakter `BEL`, dengan **timeout 1 detik** (kalau
   terminal menolak/menghiraukan, keluar diam-diam tanpa menggantung).
4. Ambil bagian base64 dari balasan lalu `base64 -d` untuk mengembalikan teks.

---

## Cara install

Skrip ini **sudah tertanam di `devbox-compose.yml`** dan otomatis terpasang saat
container dibangun dari volume kosong (COPY ke `~/.local/bin` dengan `chmod
0755`). Untuk kondisi lain, ada dua cara:

### A. Sudah ada di devbox (via compose)

Tidak perlu apa-apa. `~/.local/bin` sudah masuk `PATH`, jadi `pbcopy`/`pbpaste`
langsung tersedia setelah rebuild:

```bash
docker compose -f devbox-compose.yml up -d --build
```

### B. Pasang manual di mesin/host lain

```bash
mkdir -p ~/.local/bin

# --- pbcopy ---
cat > ~/.local/bin/pbcopy <<'SCRIPT'
#!/usr/bin/env bash
buf=$(cat)
b64=$(printf %s "$buf" | base64 | tr -d '\n')
seq="\033]52;c;${b64}\a"
if [ -n "$TMUX" ]; then
  seq="\033Ptmux;\033${seq}\033\\"
elif [ "${TERM%%-*}" = "screen" ]; then
  seq="\033P${seq}\033\\"
fi
if { printf "%b" "$seq" > /dev/tty; } 2>/dev/null; then :; else printf "%b" "$seq"; fi
SCRIPT

# --- pbpaste ---
cat > ~/.local/bin/pbpaste <<'SCRIPT'
#!/usr/bin/env bash
old=$(stty -g 2>/dev/null)
stty -echo raw 2>/dev/null
printf "\033]52;c;?\a" > /dev/tty
resp=""
IFS= read -r -d $'\a' -t 1 resp < /dev/tty 2>/dev/null
[ -n "$old" ] && stty "$old" 2>/dev/null
b64=${resp##*;c;}
[ -n "$b64" ] && printf %s "$b64" | base64 -d 2>/dev/null
SCRIPT

chmod +x ~/.local/bin/pbcopy ~/.local/bin/pbpaste
```

Pastikan `~/.local/bin` ada di `PATH` (tambahkan ke `~/.bashrc` bila perlu):

```bash
export PATH="$HOME/.local/bin:$PATH"
```

---

## Cara pakai

```bash
# Salin output perintah ke clipboard lokal
echo "halo dari devbox" | pbcopy

# Salin isi file
pbcopy < catatan.txt

# Salin hasil pipeline
git rev-parse HEAD | pbcopy

# Tempel (jika terminalmu mengizinkan paste OSC 52)
pbpaste
pbpaste > keluaran.txt
```

Lalu tinggal **paste** (Cmd/Ctrl+V) di aplikasi mana pun di mesin lokalmu.

---

## Syarat & catatan penting

- **Terminal harus mendukung OSC 52.** Yang mendukung: kitty, WezTerm, iTerm2,
  Alacritty, foot, xterm (dengan `allowWindowOps`). Kebanyakan terminal modern
  sudah mendukung untuk *copy*.
- **tmux**: aktifkan clipboard passthrough di `~/.tmux.conf`:
  ```
  set -g set-clipboard on
  ```
  Skrip sudah otomatis membungkus sequence saat variabel `$TMUX` terdeteksi.
- **`pbpaste` sering tidak berfungsi.** Banyak terminal **menolak** membaca
  clipboard (query OSC 52) demi keamanan — supaya proses jarak jauh tidak bisa
  mengintip isi clipboardmu. Di kitty/WezTerm harus diaktifkan manual; di iTerm2
  umumnya nonaktif. Ini keterbatasan terminal, bukan bug skripnya. `pbcopy`
  (menulis) jauh lebih luas didukung daripada `pbpaste` (membaca).
- **Batas ukuran.** Beberapa terminal membatasi panjang payload OSC 52
  (default xterm ~74 KB sebelum base64). Untuk teks besar, hasilnya bisa
  terpotong.
- **Helix sudah otomatis pakai OSC 52.** `hx --health` menampilkan
  `clipboard provider: termcode`, artinya yank (`y`) di Helix sudah menyalin ke
  clipboard lokalmu tanpa `pbcopy` — skrip ini untuk penggunaan dari shell.

---

## Uji cepat

```bash
# Harus menampilkan urutan OSC 52 (ESC ] 5 2 ; c ; <base64> BEL)
echo -n "tes" | pbcopy | od -c
```

Kalau kamu melihat `033 ] 5 2 ; c ; dGVz \a`, skripnya bekerja
(`dGVz` = base64 dari `tes`). Saat dijalankan di sesi SSH interaktif sungguhan,
urutan itu dikirim ke `/dev/tty` dan teksnya mendarat di clipboard lokalmu.
