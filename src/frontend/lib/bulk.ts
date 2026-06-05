import { notifications } from '@mantine/notifications'

interface BulkSummary<T> {
  total: number
  ok: number
  failed: { item: T; error: Error }[]
}

export async function runBulk<T>(items: T[], worker: (item: T) => Promise<unknown>): Promise<BulkSummary<T>> {
  const results = await Promise.allSettled(items.map((item) => worker(item)))
  const failed: { item: T; error: Error }[] = []
  let ok = 0
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      ok++
    } else {
      const reason = r.reason
      const error = reason instanceof Error ? reason : new Error(typeof reason === 'string' ? reason : 'Unknown error')
      failed.push({ item: items[i] as T, error })
    }
  })
  return { total: items.length, ok, failed }
}

export function notifyBulkResult<T>(
  summary: BulkSummary<T>,
  labelOk: (n: number) => string,
  labelFail?: (n: number) => string,
) {
  const { ok, failed } = summary
  if (failed.length === 0) {
    notifications.show({ color: 'teal', title: 'Berhasil', message: labelOk(ok), autoClose: 3000 })
    return
  }
  const failMsg = (labelFail ?? ((n: number) => `${n} gagal`))(failed.length)
  const detail = failed
    .slice(0, 3)
    .map((f) => f.error.message)
    .join('; ')
  const more = failed.length > 3 ? ` (+${failed.length - 3} lainnya)` : ''
  if (ok === 0) {
    notifications.show({
      color: 'red',
      title: 'Gagal',
      message: `${failMsg}: ${detail}${more}`,
      autoClose: 6000,
    })
  } else {
    notifications.show({
      color: 'yellow',
      title: 'Sebagian berhasil',
      message: `${labelOk(ok)}, ${failMsg}: ${detail}${more}`,
      autoClose: 6000,
    })
  }
}
