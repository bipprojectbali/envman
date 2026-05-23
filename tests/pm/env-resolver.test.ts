import { describe, test, expect } from 'bun:test'
import { resolveChildEnv, hashEnv, DEFAULT_INHERIT_ALLOWLIST, STRIP_ALWAYS } from '../../src/pm/daemon/env-resolver'

describe('resolveChildEnv', () => {
  test('inherits PATH and HOME from daemon env', () => {
    const env = resolveChildEnv({
      processId: 'p1',
      processName: 'test',
      daemonEnv: { PATH: '/usr/bin:/bin', HOME: '/home/u' },
    })
    expect(env.PATH).toBe('/usr/bin:/bin')
    expect(env.HOME).toBe('/home/u')
  })

  test('blocks non-allowlisted daemon env', () => {
    const env = resolveChildEnv({
      processId: 'p1',
      processName: 'test',
      daemonEnv: { MY_SECRET: 'abc123', AWS_SECRET_KEY: 'xyz' },
    })
    expect(env.MY_SECRET).toBeUndefined()
    expect(env.AWS_SECRET_KEY).toBeUndefined()
  })

  test('strips ENVMAN_TOKEN and ENVMAN_SERVER always', () => {
    const env = resolveChildEnv({
      processId: 'p1',
      processName: 'test',
      daemonEnv: {
        PATH: '/x',
        ENVMAN_TOKEN: 'em_secret',
        ENVMAN_SERVER: 'https://x',
        ENVMAN_PM_HOME: '/x/y',
      },
    })
    expect(env.ENVMAN_TOKEN).toBeUndefined()
    expect(env.ENVMAN_SERVER).toBeUndefined()
    expect(env.ENVMAN_PM_HOME).toBeUndefined()
  })

  test('strips even from userEnv (user cannot override allowlist)', () => {
    const env = resolveChildEnv({
      processId: 'p1',
      processName: 'test',
      userEnv: { ENVMAN_TOKEN: 'malicious' },
    })
    expect(env.ENVMAN_TOKEN).toBeUndefined()
  })

  test('userEnv overrides envmanEnv overrides daemon inherit', () => {
    const env = resolveChildEnv({
      processId: 'p1',
      processName: 'test',
      daemonEnv: { PATH: '/daemon' },
      envmanEnv: { PATH: '/envman' },
      userEnv: { PATH: '/user' },
    })
    expect(env.PATH).toBe('/user')
  })

  test('envmanEnv overrides daemon inherit', () => {
    const env = resolveChildEnv({
      processId: 'p1',
      processName: 'test',
      daemonEnv: { PATH: '/daemon' },
      envmanEnv: { PATH: '/envman' },
    })
    expect(env.PATH).toBe('/envman')
  })

  test('injects ENVMAN_PM_ID and ENVMAN_PM_NAME', () => {
    const env = resolveChildEnv({
      processId: 'p-abc',
      processName: 'my-app',
      daemonEnv: {},
    })
    expect(env.ENVMAN_PM_ID).toBe('p-abc')
    expect(env.ENVMAN_PM_NAME).toBe('my-app')
  })

  test('ENVMAN_PM_* metadata overrides user attempts', () => {
    const env = resolveChildEnv({
      processId: 'real-id',
      processName: 'real-name',
      userEnv: { ENVMAN_PM_ID: 'fake', ENVMAN_PM_NAME: 'fake' },
      daemonEnv: {},
    })
    expect(env.ENVMAN_PM_ID).toBe('real-id')
    expect(env.ENVMAN_PM_NAME).toBe('real-name')
  })

  test('inherits LC_* family from daemon', () => {
    const env = resolveChildEnv({
      processId: 'p1',
      processName: 'test',
      daemonEnv: { LC_TIME: 'en_US.UTF-8', LC_NUMERIC: 'en_US.UTF-8' },
    })
    expect(env.LC_TIME).toBe('en_US.UTF-8')
    expect(env.LC_NUMERIC).toBe('en_US.UTF-8')
  })

  test('extraAllowlist adds custom keys', () => {
    const env = resolveChildEnv({
      processId: 'p1',
      processName: 'test',
      daemonEnv: { CUSTOM_KEY: 'value' },
      extraAllowlist: ['CUSTOM_KEY'],
    })
    expect(env.CUSTOM_KEY).toBe('value')
  })
})

describe('hashEnv', () => {
  test('returns string', () => {
    expect(typeof hashEnv({ A: '1' })).toBe('string')
  })

  test('same env = same hash', () => {
    const a = hashEnv({ A: '1', B: '2' })
    const b = hashEnv({ A: '1', B: '2' })
    expect(a).toBe(b)
  })

  test('key order does not affect hash (canonical sort)', () => {
    const a = hashEnv({ A: '1', B: '2' })
    const b = hashEnv({ B: '2', A: '1' })
    expect(a).toBe(b)
  })

  test('different values = different hash', () => {
    const a = hashEnv({ A: '1' })
    const b = hashEnv({ A: '2' })
    expect(a).not.toBe(b)
  })
})

describe('exports', () => {
  test('PATH in allowlist', () => {
    expect(DEFAULT_INHERIT_ALLOWLIST).toContain('PATH')
  })
  test('ENVMAN_TOKEN in strip list', () => {
    expect(STRIP_ALWAYS).toContain('ENVMAN_TOKEN')
  })
})
