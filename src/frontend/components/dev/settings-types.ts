export interface Settings {
  user_token_creation: boolean
  user_token_max_days: number
  token_activity_enabled: boolean
  token_activity_log_vars_fetch: boolean
  token_activity_retention_days: number
  token_activity_cap_per_token: number
  storage_max_file_mb: number
  storage_default_quota_mb: number
  clipboard_max_kb: number
  clipboard_max_ttl_hours: number
  transfer_max_text_kb: number
  transfer_max_ttl_hours: number
  transfer_default_ttl_hours: number
  transfer_max_pending_per_user: number
}

export interface ActivityStats {
  total: number
  estimatedBytes: number
  oldestEntry: string | null
  topTokens: { tokenId: string; tokenName: string | null; count: number }[]
  byAction: { action: string; count: number }[]
}

export function parseSettings(raw: Record<string, string>): Settings {
  return {
    user_token_creation: raw.user_token_creation !== 'false',
    user_token_max_days: Number(raw.user_token_max_days ?? '0') || 0,
    token_activity_enabled: raw.token_activity_enabled !== 'false',
    token_activity_log_vars_fetch: raw.token_activity_log_vars_fetch !== 'false',
    token_activity_retention_days: Number(raw.token_activity_retention_days ?? '30') || 30,
    token_activity_cap_per_token: Number(raw.token_activity_cap_per_token ?? '1000') || 1000,
    storage_max_file_mb: Number(raw.storage_max_file_mb ?? '50') || 50,
    storage_default_quota_mb: Number(raw.storage_default_quota_mb ?? '500') || 500,
    clipboard_max_kb: Number(raw.clipboard_max_kb ?? '1024') || 1024,
    clipboard_max_ttl_hours: Number(raw.clipboard_max_ttl_hours ?? '168') || 168,
    transfer_max_text_kb: Number(raw.transfer_max_text_kb ?? '256') || 256,
    transfer_max_ttl_hours: Number(raw.transfer_max_ttl_hours ?? '168') || 168,
    transfer_default_ttl_hours: Number(raw.transfer_default_ttl_hours ?? '72') || 72,
    transfer_max_pending_per_user: Number(raw.transfer_max_pending_per_user ?? '20') || 20,
  }
}

export function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}
