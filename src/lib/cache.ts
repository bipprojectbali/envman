import { redis } from './redis'

export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  try {
    const cached = await redis.get(key)
    if (cached) return JSON.parse(cached) as T
  } catch {
    // Redis unavailable — fall through to fetcher
  }

  const data = await fetcher()
  if (data !== null && data !== undefined) {
    redis.set(key, JSON.stringify(data), 'EX', String(ttlSeconds)).catch(() => {})
  }
  return data
}

export async function invalidateCache(...keys: string[]) {
  if (keys.length === 0) return
  redis.del(...keys).catch(() => {})
}

export const cacheKeys = {
  projectList: (userId: string) => `projects:user:${userId}`,
  projectDetail: (slug: string) => `project:${slug}`,
  projectAccess: (userId: string, slug: string) => `access:${userId}:${slug}`,
  tokenList: (userId: string) => `tokens:user:${userId}`,
}
