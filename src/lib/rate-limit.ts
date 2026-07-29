import { redis } from './redis'

// Fixed-window counter in Redis. Deliberately fails CLOSED (throws) when Redis
// is unreachable, unlike src/lib/cache.ts which fails open: a cache miss is
// harmless, a missing brute-force guard is not. REDIS_URL is required() in
// src/lib/env.ts, so an unreachable Redis means the app is broken anyway.

export interface RateLimitResult {
  allowed: boolean
  count: number
  limit: number
}

/**
 * Increments `key` and reports whether it is still within `limit` for the
 * current window. The window starts on the first hit and lasts
 * `windowSeconds`; it does not slide.
 *
 * Throws if Redis is unavailable — callers must translate that into a 503
 * rather than letting the request through unguarded.
 */
export async function hitLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const count = await redis.incr(key)
  // Only the first hit arms the TTL, so the window is anchored to it. Bun's
  // RedisClient lacks an `expire` binding — go through the generic send().
  if (count === 1) await redis.send('EXPIRE', [key, String(windowSeconds)])
  return { allowed: count <= limit, count, limit }
}

/**
 * Reads the current count WITHOUT incrementing.
 *
 * Needed when the budget is spent only on failures: the request must still be
 * refused once the budget is exhausted — otherwise an attacker who guesses
 * correctly on attempt 500 would be served — but merely checking must not
 * consume budget, or successful requests would count against the limit.
 *
 * Throws if Redis is unavailable; callers must fail closed.
 */
export async function peekLimit(key: string, limit: number): Promise<RateLimitResult> {
  const raw = await redis.get(key)
  const count = raw ? Number.parseInt(raw, 10) || 0 : 0
  return { allowed: count < limit, count, limit }
}
