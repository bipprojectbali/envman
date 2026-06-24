import { describe, expect, test } from 'bun:test'
import { toEnvLine, toEnvText, toKeyTemplate } from '../../src/frontend/lib/env-clipboard'

describe('toEnvLine', () => {
  test('plain value, no quotes', () => {
    expect(toEnvLine({ key: 'PORT', value: '3000' })).toBe('PORT=3000')
  })

  test('quotes value with spaces', () => {
    expect(toEnvLine({ key: 'MSG', value: 'hello world' })).toBe('MSG="hello world"')
  })

  test('quotes value with hash', () => {
    expect(toEnvLine({ key: 'A', value: 'a#b' })).toBe('A="a#b"')
  })

  test('escapes inner double quotes', () => {
    expect(toEnvLine({ key: 'A', value: 'say "hi"' })).toBe('A="say \\"hi\\""')
  })

  test('empty value', () => {
    expect(toEnvLine({ key: 'EMPTY', value: '' })).toBe('EMPTY=')
  })
})

describe('toEnvText', () => {
  test('joins lines with newline', () => {
    expect(
      toEnvText([
        { key: 'A', value: '1' },
        { key: 'B', value: 'two words' },
      ]),
    ).toBe('A=1\nB="two words"')
  })

  test('empty list', () => {
    expect(toEnvText([])).toBe('')
  })
})

describe('toKeyTemplate', () => {
  test('emits KEY= with empty values', () => {
    expect(
      toKeyTemplate([{ key: 'DATABASE_URL' }, { key: 'REDIS_URL' }]),
    ).toBe('DATABASE_URL=\nREDIS_URL=')
  })

  test('ignores value field if present', () => {
    expect(toKeyTemplate([{ key: 'SECRET', value: 'leak' } as { key: string }])).toBe('SECRET=')
  })

  test('empty list', () => {
    expect(toKeyTemplate([])).toBe('')
  })
})
