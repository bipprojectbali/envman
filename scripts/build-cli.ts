#!/usr/bin/env bun
import { mkdirSync, statSync, writeFileSync } from 'fs'
import { gzipSync } from 'zlib'
import { join } from 'path'

const OUT_DIR = join(import.meta.dir, '..', 'dist', 'cli')
mkdirSync(OUT_DIR, { recursive: true })

const targets = [
  { target: 'bun-linux-x64',   out: 'envman-linux-x64' },
  { target: 'bun-linux-arm64', out: 'envman-linux-arm64' },
  { target: 'bun-darwin-x64',  out: 'envman-darwin-x64' },
  { target: 'bun-darwin-arm64',out: 'envman-darwin-arm64' },
  { target: 'bun-windows-x64', out: 'envman-windows-x64.exe' },
]

const src = join(import.meta.dir, '..', 'src', 'cli.ts')

for (const { target, out } of targets) {
  const outFile = join(OUT_DIR, out)
  console.log(`Building ${out}...`)
  const proc = Bun.spawnSync(['bun', 'build', src, '--compile', `--target=${target}`, `--outfile=${outFile}`], { stdout: 'inherit', stderr: 'inherit' })
  if (proc.exitCode !== 0) {
    console.error(`Failed to build ${out}`)
    process.exit(1)
  }

  const raw = Bun.file(outFile)
  const buf = Buffer.from(await raw.arrayBuffer())
  const gz = gzipSync(buf, { level: 9 })
  const gzPath = `${outFile}.gz`
  writeFileSync(gzPath, gz)
  const before = statSync(outFile).size
  const after = statSync(gzPath).size
  console.log(`  gzip: ${(before / 1024 / 1024).toFixed(1)}MB → ${(after / 1024 / 1024).toFixed(1)}MB (${Math.round(100 - after * 100 / before)}% smaller)`)
}

console.log(`\nAll binaries built to dist/cli/ (with .gz variants)`)
console.log('Run `bun run start` to serve them at /download/cli/<platform>')
