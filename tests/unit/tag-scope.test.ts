import { test, expect, describe } from 'bun:test'
import { canAccessItem, filterByTagScope, tagScopeWhere } from '../../src/lib/access'

describe('canAccessItem', () => {
  test('empty scope = full access (sees everything, including untagged)', () => {
    expect(canAccessItem([], [])).toBe(true)
    expect(canAccessItem(['a'], [])).toBe(true)
    expect(canAccessItem(['a', 'b'], [])).toBe(true)
  })

  test('untagged item is hidden from a limited (non-empty scope) user', () => {
    // The whole secure-by-default rule hinges on this.
    expect(canAccessItem([], ['a'])).toBe(false)
  })

  test('OR match: item visible if it has at least one scope tag', () => {
    expect(canAccessItem(['a'], ['a'])).toBe(true)
    expect(canAccessItem(['a', 'x'], ['a', 'b'])).toBe(true) // overlaps on a
    expect(canAccessItem(['b'], ['a', 'b'])).toBe(true)
  })

  test('no overlap = hidden', () => {
    expect(canAccessItem(['x'], ['a', 'b'])).toBe(false)
    expect(canAccessItem(['x', 'y'], ['a'])).toBe(false)
  })
})

describe('filterByTagScope', () => {
  const items = [
    { id: '1', tags: ['a'] },
    { id: '2', tags: ['b'] },
    { id: '3', tags: [] }, // untagged
    { id: '4', tags: ['a', 'c'] },
  ]

  test('empty scope returns all items unchanged', () => {
    expect(filterByTagScope(items, [])).toHaveLength(4)
  })

  test('limited scope keeps only OR-matching, drops untagged', () => {
    const out = filterByTagScope(items, ['a'])
    expect(out.map((i) => i.id)).toEqual(['1', '4'])
  })

  test('multi-tag scope is OR across tags', () => {
    const out = filterByTagScope(items, ['a', 'b'])
    expect(out.map((i) => i.id)).toEqual(['1', '2', '4'])
  })
})

describe('tagScopeWhere', () => {
  test('empty scope = no filter', () => {
    expect(tagScopeWhere([])).toEqual({})
  })

  test('non-empty scope = prisma hasSome fragment', () => {
    expect(tagScopeWhere(['a', 'b'])).toEqual({ tags: { hasSome: ['a', 'b'] } })
  })
})
