import { describe, expect, test } from 'bun:test'
import { extractEnvRefs } from '../../src/lib/alias-parser'

describe('extractEnvRefs', () => {
  test('extracts single -e ref', () => {
    expect(extractEnvRefs('-e myapp:prod -- bash deploy.sh')).toEqual([{ project: 'myapp', env: 'prod' }])
  })

  test('extracts multiple refs', () => {
    expect(extractEnvRefs('-e myapp:prod -e other:dev -- bun run')).toEqual([
      { project: 'myapp', env: 'prod' },
      { project: 'other', env: 'dev' },
    ])
  })

  test('dedupes identical refs', () => {
    expect(extractEnvRefs('-e a:b -e a:b -- foo')).toEqual([{ project: 'a', env: 'b' }])
  })

  test('skips file path arguments (contain /)', () => {
    expect(extractEnvRefs('-e ./local.env -- bash run.sh')).toEqual([])
  })

  test('skips file with dot extension', () => {
    expect(extractEnvRefs('-e .env.prod -- bash run.sh')).toEqual([])
  })

  test('stops parsing after -- separator', () => {
    expect(extractEnvRefs('-e a:b -- bash -e ignored:env')).toEqual([{ project: 'a', env: 'b' }])
  })

  test('respects quoted strings', () => {
    expect(extractEnvRefs('-e "myapp:prod" -- bash')).toEqual([{ project: 'myapp', env: 'prod' }])
  })

  test('supports --env long flag', () => {
    expect(extractEnvRefs('--env myapp:prod -- foo')).toEqual([{ project: 'myapp', env: 'prod' }])
  })

  test('ignores -e without value', () => {
    expect(extractEnvRefs('-e')).toEqual([])
  })

  test('ignores malformed refs', () => {
    expect(extractEnvRefs('-e justalabel -- foo')).toEqual([])
  })
})
