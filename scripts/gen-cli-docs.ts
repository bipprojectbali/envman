#!/usr/bin/env bun
// Generate cli-go/internal/docs/DOCS.md from the single source of truth
// (src/lib/cli-docs/*.ts). The generated file is embedded into the CLI binary
// via //go:embed and used as an OFFLINE FALLBACK by `envman docs` when the
// server is unreachable. The `{{SERVER}}` placeholder is substituted at runtime
// with the user's configured server URL.
//
// Server remains authoritative: `envman docs` fetches /api/cli-docs.md first and
// only falls back to this embed on failure. This keeps ONE source — never edit
// DOCS.md by hand; edit src/lib/cli-docs/*.ts and re-run this generator.
import { join } from 'path'
import { buildCliDocsMd } from '../src/lib/cli-docs-builder'

const OUT = join(import.meta.dir, '..', 'cli-go', 'internal', 'docs', 'DOCS.md')

// Placeholder origin — replaced at runtime by the CLI with the real server URL.
const md = buildCliDocsMd('{{SERVER}}')

const banner = `<!-- GENERATED FILE — do not edit. Source: src/lib/cli-docs/*.ts. Regenerate: bun run scripts/gen-cli-docs.ts -->\n`
await Bun.write(OUT, banner + md)
console.log(`Generated ${OUT} (${md.length} bytes)`)
