import { describe, test, expect } from 'bun:test'
import {
  computeDelayMs,
  recordExit,
  resetBackoff,
  newBackoffState,
  DEFAULT_BACKOFF,
} from '../../src/pm/daemon/backoff'

describe('computeDelayMs', () => {
  test('zero restarts = 0 delay', () => {
    expect(computeDelayMs(0)).toBe(0)
  })
  test('1st restart = baseDelayMs', () => {
    expect(computeDelayMs(1)).toBe(1000)
  })
  test('exponential growth: 2nd = 2× base', () => {
    expect(computeDelayMs(2)).toBe(2000)
  })
  test('exponential growth: 4th restart = 8s', () => {
    expect(computeDelayMs(4)).toBe(8000)
  })
  test('capped at capDelayMs', () => {
    expect(computeDelayMs(100)).toBe(60_000)
  })
  test('negative restarts = 0', () => {
    expect(computeDelayMs(-1)).toBe(0)
  })
})

describe('recordExit', () => {
  test('first crash with short uptime → restart with restartCount=1', () => {
    const s = newBackoffState()
    const action = recordExit(s, 100, 1_000_000)
    expect(action).toBe('restart')
    expect(s.restartCount).toBe(1)
    expect(s.restartWindow).toHaveLength(1)
  })

  test('stable uptime resets counter then increments to 1', () => {
    const s = { restartCount: 4, restartWindow: [100, 200, 300, 400] }
    const action = recordExit(s, 20_000, 500)
    expect(action).toBe('restart')
    expect(s.restartCount).toBe(1)
    expect(s.restartWindow).toHaveLength(1)
  })

  test('5 crashes in 60s window = quarantine', () => {
    const s = newBackoffState()
    const t0 = 1_000_000
    // 5 crashes spaced 5s apart
    for (let i = 0; i < 4; i++) {
      recordExit(s, 100, t0 + i * 5000)
    }
    const action = recordExit(s, 100, t0 + 4 * 5000)
    expect(action).toBe('quarantine')
    expect(s.restartCount).toBe(5)
  })

  test('crashes spaced > window = no quarantine', () => {
    const s = newBackoffState()
    const t0 = 1_000_000
    for (let i = 0; i < 4; i++) {
      const action = recordExit(s, 100, t0 + i * 70_000)  // 70s apart
      expect(action).toBe('restart')
    }
    // window trimmed to last only
    expect(s.restartWindow.length).toBeLessThan(2)
  })
})

describe('resetBackoff', () => {
  test('clears state', () => {
    const s = { restartCount: 7, restartWindow: [1, 2, 3] }
    resetBackoff(s)
    expect(s.restartCount).toBe(0)
    expect(s.restartWindow).toEqual([])
  })
})

describe('DEFAULT_BACKOFF', () => {
  test('has sensible defaults', () => {
    expect(DEFAULT_BACKOFF.baseDelayMs).toBe(1000)
    expect(DEFAULT_BACKOFF.capDelayMs).toBe(60_000)
    expect(DEFAULT_BACKOFF.maxRestartsInWindow).toBe(5)
    expect(DEFAULT_BACKOFF.windowDurationMs).toBe(60_000)
  })
})
