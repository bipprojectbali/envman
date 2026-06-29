import { getSettingBool, getSettingNumber } from './app-settings'
import { prisma } from './db'

export type TokenAction = 'vars_fetch' | 'var_set' | 'var_delete' | 'alias_resolve' | 'file_exec'

interface LogParams {
  tokenId: string
  userId?: string
  tokenName?: string
  action: TokenAction
  projectSlug?: string
  envName?: string
  detail?: string
  ip?: string
}

export async function logTokenActivity(params: LogParams): Promise<void> {
  const enabled = await getSettingBool('token_activity_enabled', true)
  if (!enabled) return
  if (params.action === 'vars_fetch') {
    const logFetch = await getSettingBool('token_activity_log_vars_fetch', true)
    if (!logFetch) return
  }
  prisma.tokenActivityLog.create({ data: params }).catch(() => {})
}

export async function cleanupTokenActivity(): Promise<{ deleted: number }> {
  const retentionDays = await getSettingNumber('token_activity_retention_days', 30)
  const capPerToken = await getSettingNumber('token_activity_cap_per_token', 1000)

  let deleted = 0

  if (retentionDays > 0) {
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000)
    const { count } = await prisma.tokenActivityLog.deleteMany({ where: { createdAt: { lt: cutoff } } })
    deleted += count
  }

  if (capPerToken > 0) {
    const result = await prisma.$executeRaw`
      DELETE FROM token_activity_log
      WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY "tokenId" ORDER BY "createdAt" DESC) AS rn
          FROM token_activity_log
        ) ranked
        WHERE rn > ${capPerToken}
      )
    `
    deleted += result as number
  }

  return { deleted }
}
