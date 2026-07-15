import { describe, expect, test } from 'bun:test'
import { computeShowValue } from '../../src/frontend/lib/value-visibility'

const plain = { id: 'a', isSecret: false }
const secret = { id: 'b', isSecret: true }

describe('computeShowValue', () => {
  test('plain hidden by default', () => {
    expect(computeShowValue(plain, new Set(), false)).toBe(false)
  })

  test('plain shown when global flag on', () => {
    expect(computeShowValue(plain, new Set(), true)).toBe(true)
  })

  test('plain shown when individually revealed', () => {
    expect(computeShowValue(plain, new Set(['a']), false)).toBe(true)
  })

  test('secret hidden by default', () => {
    expect(computeShowValue(secret, new Set(), false)).toBe(false)
  })

  test('secret NOT shown by global flag (stays per-value)', () => {
    expect(computeShowValue(secret, new Set(), true)).toBe(false)
  })

  test('secret shown only when individually revealed', () => {
    expect(computeShowValue(secret, new Set(['b']), false)).toBe(true)
    expect(computeShowValue(secret, new Set(['b']), true)).toBe(true)
  })
})
