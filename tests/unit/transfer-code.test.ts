import { describe, expect, test } from 'bun:test'
import fixture from '../fixtures/code-normalization.json'
import {
  CUSTOM_CODE_MAX_TTL_MINUTES,
  generateCode,
  hashCode,
  MIN_CUSTOM_CODE_LEN,
  normalizeCode,
  validateCustomCode,
} from '../../src/lib/transfer-service'
import { CODE_SEPARATOR, CODE_WORDS, TRANSFER_WORDS } from '../../src/lib/transfer-wordlist'

// The Go half of this contract lives in cli-go/internal/transfer/transfer_test.go
// and reads the same fixture file.
describe('normalizeCode — shared vectors', () => {
  for (const c of fixture.valid) {
    test(`accepts: ${c.why}`, () => {
      expect(normalizeCode(c.input)).toBe(c.expected)
    })
  }
  for (const c of fixture.invalid) {
    test(`rejects: ${c.why}`, () => {
      expect(normalizeCode(c.input)).toBeNull()
    })
  }
})

describe('wordlist', () => {
  test('1296 words, giving the entropy the code format assumes', () => {
    expect(TRANSFER_WORDS.length).toBe(1296)
    // 4 words × log2(1296) ≈ 41.4 bits.
    const bits = CODE_WORDS * Math.log2(TRANSFER_WORDS.length)
    expect(bits).toBeGreaterThan(41)
  })

  test('every word has a unique three-character prefix', () => {
    // This is why EFF Short #2 was chosen: it lets a client autocomplete after
    // three letters, and it means no two words are confusable.
    const prefixes = new Set(TRANSFER_WORDS.map((w) => w.slice(0, 3)))
    expect(prefixes.size).toBe(TRANSFER_WORDS.length)
  })

  test('no word contains the separator', () => {
    // "yo-yo" is why the separator is "." — a hyphen would split it into two
    // bogus tokens.
    for (const w of TRANSFER_WORDS) {
      expect(w).not.toContain(CODE_SEPARATOR)
    }
  })
})

describe('generateCode', () => {
  test('produces four words joined by the separator', () => {
    const { code } = generateCode()
    const parts = code.split(CODE_SEPARATOR)
    expect(parts.length).toBe(CODE_WORDS)
    for (const p of parts) expect(TRANSFER_WORDS).toContain(p)
  })

  test('round-trips through normalizeCode', () => {
    // If this breaks, a freshly minted code cannot be claimed.
    for (let i = 0; i < 50; i++) {
      const { code } = generateCode()
      expect(normalizeCode(code)).toBe(code)
    }
  })

  test('prefix is the first word only, never the whole code', () => {
    // codePrefix reaches the sent list, the audit log and the Redis app-log
    // ring. Four characters would give away a quarter of the entropy.
    const { code, prefix } = generateCode()
    expect(prefix).toBe(code.split(CODE_SEPARATOR)[0])
    expect(prefix).not.toBe(code)
  })

  test('does not repeat', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(generateCode().code)
    expect(seen.size).toBe(200)
  })

  test('samples the whole list, not just the low end', () => {
    // Guards the modulo-bias trap: 1296 does not divide 256, so `% length`
    // over a random byte would never reach the tail of the list.
    let sawUpperHalf = false
    for (let i = 0; i < 300 && !sawUpperHalf; i++) {
      for (const w of generateCode().code.split(CODE_SEPARATOR)) {
        if (TRANSFER_WORDS.indexOf(w) > TRANSFER_WORDS.length / 2) sawUpperHalf = true
      }
    }
    expect(sawUpperHalf).toBe(true)
  })
})

describe('validateCustomCode', () => {
  test('accepts a reasonable memorable code', () => {
    const res = validateCustomCode('setup-mesin-baru')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.code).toBe('setup-mesin-baru')
  })

  test('lowercases so it matches what normalizeCode will produce', () => {
    const res = validateCustomCode('Setup-Mesin-Baru')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.code).toBe('setup-mesin-baru')
  })

  test(`rejects anything shorter than ${MIN_CUSTOM_CODE_LEN}`, () => {
    expect(validateCustomCode('pendek').ok).toBe(false)
    expect(validateCustomCode('a'.repeat(MIN_CUSTOM_CODE_LEN - 1)).ok).toBe(false)
    expect(validateCustomCode('a'.repeat(MIN_CUSTOM_CODE_LEN)).ok).toBe(true)
  })

  test('rejects spaces and shell metacharacters', () => {
    // The code is handed over inside a copy-paste command line, so these would
    // produce a broken or dangerous instruction.
    for (const bad of ['ada spasi disini', 'kode;rm -rf /', 'kode$(whoami)', 'kode&&echo', "kode'quote"]) {
      expect(validateCustomCode(bad).ok).toBe(false)
    }
  })
})

describe('hashing', () => {
  test('hashes the canonical form, so equivalent inputs collide', () => {
    const a = normalizeCode('VIKING PUDDING ALASKA SUNNY')
    const b = normalizeCode('viking.pudding.alaska.sunny')
    expect(a).toBe(b as string)
    expect(hashCode(a as string)).toBe(hashCode(b as string))
  })

  test('is a 64-char hex digest', () => {
    expect(hashCode('viking.pudding.alaska.sunny')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('custom-code TTL ceiling', () => {
  test('is short enough that the rate limiter bounds guesses', () => {
    // 10 failures per IP per 10 minutes, 100 globally. Over a 15-minute life
    // that is roughly 150 attempts against a code — the reason a memorable
    // code is acceptable at all.
    const attempts = (CUSTOM_CODE_MAX_TTL_MINUTES / 10) * 100
    expect(attempts).toBeLessThan(200)
  })
})
