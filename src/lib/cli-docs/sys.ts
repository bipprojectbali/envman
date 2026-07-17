export function buildSysSection(): string {
  return `
## Sys — Snapshot Kesehatan Mesin Lokal

\`envman sys\` menampilkan gambaran cepat kesehatan mesin **tempat CLI dijalankan**:
host & uptime, CPU + load, memory & swap, dan penggunaan disk per filesystem.
Tak perlu login — semua dibaca dari mesin lokal.

\`\`\`bash
envman sys            # ringkasan berwarna
envman sys --json     # snapshot mesin-readable (pipe ke agent / monitor)
envman sys --du .     # + ukuran footprint project (cwd)
envman sys --du ./app # + ukuran footprint direktori tertentu
\`\`\`

### Ukuran project (--du)

\`--du <dir>\` menambah blok **footprint disk** sebuah direktori: total ukuran +
rincian per entri top-level (mis. \`node_modules\`, \`.git\`, \`dist\`) diurutkan dari
terbesar — langsung kelihatan subdir mana yang bikin project membengkak. Berbeda
dari \`envman health\` yang justru **melewati** dir dependency; di sini mereka
sengaja **ditampilkan**. Symlink tak diikuti (aman dari loop); entri tak terbaca
dilewati. Maks 12 baris teratas, sisanya dilipat jadi "(N entri lainnya)".

### Status

Memory, swap, dan disk ditandai **warning** pada penggunaan ≥80% dan **critical**
pada ≥90%. Load average dinilai relatif jumlah core logis (load per-core ≥1.0 =
warning, ≥1.5 = critical). Header baris pertama membawa **verdict keseluruhan**
(status terparah di antara memory/swap/CPU/disk).

Filesystem virtual (\`tmpfs\`, \`proc\`, \`overlay\`, dll) dilewati. Mount yang
berbagi pool fisik sama (mis. volume sintetis APFS di macOS) diringkas jadi satu
baris agar tetap enak dibaca sekilas.

### Kirim ke agent atau monitor

\`\`\`bash
envman sys --json | envman clip set     # ke clipboard akun (lintas device)
envman sys --json | jq '.disks[]'       # olah lebih lanjut
\`\`\`

### Flag

\`\`\`
--json      cetak snapshot sebagai JSON
--du <dir>  tambah footprint disk direktori (total + rincian subdir)
\`\`\`

> Membaca **mesin lokal saja**. Untuk memeriksa stack remote, pakai \`envman pt\`
> (\`envman portainer status <project>:<env>\`).
`
}
