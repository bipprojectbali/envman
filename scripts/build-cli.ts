#!/usr/bin/env bun
import { mkdirSync, statSync } from 'fs'
import { join } from 'path'

const OUT_DIR = join(import.meta.dir, '..', 'dist', 'cli')
mkdirSync(OUT_DIR, { recursive: true })

const CLI_GO_DIR = join(import.meta.dir, '..', 'cli-go')

const targets = [
  { goos: 'linux',   goarch: 'amd64', out: 'envman-linux-x64' },
  { goos: 'linux',   goarch: 'arm64', out: 'envman-linux-arm64' },
  { goos: 'darwin',  goarch: 'amd64', out: 'envman-darwin-x64' },
  { goos: 'darwin',  goarch: 'arm64', out: 'envman-darwin-arm64' },
  { goos: 'windows', goarch: 'amd64', out: 'envman-windows-x64.exe' },
]

const pkg = await import('../package.json')
const version = pkg.version

for (const { goos, goarch, out } of targets) {
  const outFile = join(OUT_DIR, out)
  console.log(`Building ${out}...`)
  const proc = Bun.spawnSync(
    ['go', 'build', '-ldflags', `-s -w -X main.VERSION=${version}`, '-o', outFile, './cmd/envman/'],
    {
      stdout: 'inherit',
      stderr: 'inherit',
      cwd: CLI_GO_DIR,
      env: { ...process.env, GOOS: goos, GOARCH: goarch } as Record<string, string>,
    },
  )
  if (proc.exitCode !== 0) {
    console.error(`Failed to build ${out}`)
    process.exit(1)
  }

  // Gzip
  const gzProc = Bun.spawnSync(['gzip', '-c', outFile])
  if (gzProc.exitCode !== 0) {
    console.error(`Failed to gzip ${out}`)
    process.exit(1)
  }
  await Bun.write(outFile + '.gz', gzProc.stdout)

  const before = statSync(outFile).size
  const after = statSync(outFile + '.gz').size
  console.log(`  ${(before / 1024 / 1024).toFixed(1)}MB → ${(after / 1024 / 1024).toFixed(1)}MB gzip (${Math.round(100 - (after * 100) / before)}% smaller)`)
}

console.log(`\nAll binaries built to dist/cli/ (with .gz variants)`)
console.log('Run \`bun run start\` to serve them at /download/cli/<platform>')
