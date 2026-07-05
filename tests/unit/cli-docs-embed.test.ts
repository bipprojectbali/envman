import { test, expect, describe } from 'bun:test'
import { join } from 'path'
import { buildCliDocsMd } from '../../src/lib/cli-docs-builder'

// Guards single-source-of-truth: the embedded cli-go/internal/docs/DOCS.md must
// stay in sync with buildCliDocsMd(). If this fails, run:
//   bun run scripts/gen-cli-docs.ts
const DOCS_PATH = join(import.meta.dir, '..', '..', 'cli-go', 'internal', 'docs', 'DOCS.md')

describe('embedded CLI docs', () => {
  test('DOCS.md is in sync with buildCliDocsMd (regenerate if this fails)', async () => {
    const file = await Bun.file(DOCS_PATH).text()
    // Strip the generated banner (first line) before comparing to the builder output.
    const body = file.replace(/^<!-- GENERATED FILE[^\n]*\n/, '')
    expect(body).toBe(buildCliDocsMd('{{SERVER}}'))
  })

  test('DOCS.md carries the {{SERVER}} placeholder, not a real origin', async () => {
    const file = await Bun.file(DOCS_PATH).text()
    expect(file).toContain('{{SERVER}}')
    expect(file).not.toContain('https://envman.wibudev.com')
  })
})
