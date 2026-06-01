import { prisma } from './db'
import { redis } from './redis'

export async function withCache<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
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
  // Await del — fire-and-forget bisa bikin response 200 sampai ke client
  // sebelum Redis benar-benar invalidate, menyebabkan refetch hit stale cache.
  await redis.del(...keys).catch(() => {})
}

export const cacheKeys = {
  projectList: (userId: string) => `projects:user:${userId}`,
  projectDetail: (slug: string) => `project:${slug}`,
  projectAccess: (userId: string, slug: string) => `access:${userId}:${slug}`,
  tokenList: (userId: string) => `tokens:user:${userId}`,
  projectAliases: (slug: string) => `project:${slug}:aliases`,
  projectFiles: (slug: string) => `project:${slug}:files`,
}

/**
 * Invalidate `projectList` cache untuk SEMUA member project, plus `projectDetail`.
 *
 * Wajib dipanggil setelah mutasi yang mempengaruhi output `GET /api/envman/projects`
 * (name/description/tags, members[], environments[]). Karena `projectList` cache
 * per-user (`projects:user:${userId}`), tiap member punya cache key terpisah —
 * fail di satu user = stale data sampai TTL 60s habis.
 *
 * @param slug — project slug yang berubah
 * @param extraUserIds — userIds tambahan yang TIDAK ada di project members
 *   tapi cache mereka harus invalidate juga. Contoh:
 *   - User baru di-add jadi member: lewati extraUserIds=[newUserId] supaya
 *     query members[] yang dijalankan SEBELUM penambahan jadi tidak skip dia.
 *   - User di-remove dari member: lewati extraUserIds=[removedUserId] supaya
 *     setelah query, cache user yang sudah keluar tetap dibersihkan.
 *   - Untuk POST/PUT yang upsert role: aman lewati userId target.
 */
export async function invalidateProjectCaches(slug: string, extraUserIds: string[] = []) {
  try {
    // SUPER_ADMIN melihat SEMUA project (bypass member check di list endpoint),
    // jadi cache mereka juga harus invalidate setiap kali project berubah.
    const [members, superAdmins] = await Promise.all([
      prisma.projectMember.findMany({
        where: { project: { slug } },
        select: { userId: true },
      }),
      prisma.user.findMany({
        where: { role: 'SUPER_ADMIN', blocked: false },
        select: { id: true },
      }),
    ])
    const userIds = new Set<string>([...members.map((m) => m.userId), ...superAdmins.map((u) => u.id), ...extraUserIds])
    if (userIds.size === 0) return
    await invalidateCache(
      ...Array.from(userIds).map((uid) => cacheKeys.projectList(uid)),
      cacheKeys.projectDetail(slug),
    )
  } catch {
    // Best-effort. Cache TTL (60s) jadi safety net jika query gagal.
  }
}
