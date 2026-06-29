import { prisma } from './db'

const TTL_MS = 60_000
const cache = new Map<string, { value: string; exp: number }>()

async function getRaw(key: string, defaultVal: string): Promise<string> {
  const cached = cache.get(key)
  if (cached && cached.exp > Date.now()) return cached.value
  const row = await prisma.appSetting.findUnique({ where: { key } }).catch(() => null)
  const value = row?.value ?? defaultVal
  cache.set(key, { value, exp: Date.now() + TTL_MS })
  return value
}

export async function getSetting(key: string, defaultVal: string): Promise<string> {
  return getRaw(key, defaultVal)
}

export async function getSettingBool(key: string, defaultVal: boolean): Promise<boolean> {
  const v = await getRaw(key, defaultVal ? 'true' : 'false')
  return v === 'true'
}

export async function getSettingNumber(key: string, defaultVal: number): Promise<number> {
  const v = await getRaw(key, String(defaultVal))
  const n = Number(v)
  return Number.isNaN(n) ? defaultVal : n
}

export function invalidateSettingCache(key?: string) {
  if (key) cache.delete(key)
  else cache.clear()
}
