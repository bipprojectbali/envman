import { test, expect, describe } from 'bun:test'
import { detectsNpmImports } from '@/cli'

describe('detectsNpmImports', () => {
  test('detects bare ESM import', () => {
    expect(detectsNpmImports(`import { z } from "zod"`)).toBe(true)
    expect(detectsNpmImports(`import _ from "lodash"`)).toBe(true)
    expect(detectsNpmImports(`import "side-effect-pkg"`)).toBe(true)
  })

  test('detects scoped npm package', () => {
    expect(detectsNpmImports(`import { Hono } from "@hono/node-server"`)).toBe(true)
  })

  test('detects version-pinned npm import', () => {
    expect(detectsNpmImports(`import _ from "lodash@4.17.21"`)).toBe(true)
  })

  test('detects require() of bare module', () => {
    expect(detectsNpmImports(`const z = require("zod")`)).toBe(true)
  })

  test('detects dynamic import() of bare module', () => {
    expect(detectsNpmImports(`const m = await import("zod")`)).toBe(true)
  })

  test('ignores relative imports', () => {
    expect(detectsNpmImports(`import x from "./utils"`)).toBe(false)
    expect(detectsNpmImports(`import x from "../shared/lib"`)).toBe(false)
    expect(detectsNpmImports(`import x from "/absolute/path"`)).toBe(false)
  })

  test('ignores bun: and node: prefixed builtins', () => {
    expect(detectsNpmImports(`import { Database } from "bun:sqlite"`)).toBe(false)
    expect(detectsNpmImports(`import fs from "node:fs"`)).toBe(false)
    expect(detectsNpmImports(`import { test } from "bun:test"`)).toBe(false)
  })

  test('ignores Node built-ins without prefix', () => {
    expect(detectsNpmImports(`import fs from "fs"`)).toBe(false)
    expect(detectsNpmImports(`const path = require("path")`)).toBe(false)
    expect(detectsNpmImports(`import { createHash } from "crypto"`)).toBe(false)
  })

  test('returns false on script without any imports', () => {
    expect(detectsNpmImports(`console.log("hello")`)).toBe(false)
    expect(detectsNpmImports(`const x = 1 + 2`)).toBe(false)
    expect(detectsNpmImports(``)).toBe(false)
  })

  test('handles mixed imports — true if at least one npm package', () => {
    const script = `
      import fs from "node:fs"
      import { z } from "zod"
      import { Database } from "bun:sqlite"
    `
    expect(detectsNpmImports(script)).toBe(true)
  })

  test('handles all-builtin script', () => {
    const script = `
      import fs from "node:fs"
      import { Database } from "bun:sqlite"
      import path from "path"
    `
    expect(detectsNpmImports(script)).toBe(false)
  })

  test('handles multiline import statements', () => {
    const script = `import {
      something,
      somethingElse,
    } from "zod"`
    expect(detectsNpmImports(script)).toBe(true)
  })

  test('does not match string literals that look like imports', () => {
    const script = `const msg = 'import { x } from "fake"'`
    expect(detectsNpmImports(script)).toBe(false)
  })
})
