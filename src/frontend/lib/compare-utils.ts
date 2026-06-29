import type React from 'react'
import {
  TbAlertTriangle,
  TbCheck,
  TbMinus,
  TbPlus,
  TbShieldLock,
} from 'react-icons/tb'

export type Category = 'diff' | 'onlyLocal' | 'onlySrv' | 'sync' | 'uncertain'

export interface DiffRow {
  key: string
  category: Category
  localValue?: string
  serverValue?: string
  isSecret: boolean
}

export function parseEnvText(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    if (!key) continue
    let value = line.slice(eq + 1)
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      value = value.slice(1, -1)
    result[key] = value
  }
  return result
}

export const CATEGORY_META: Record<
  Category,
  { label: string; color: string; icon: React.ComponentType<{ size?: number }> }
> = {
  diff: { label: 'Beda value', color: 'yellow', icon: TbAlertTriangle },
  onlyLocal: { label: 'Hanya di local', color: 'blue', icon: TbPlus },
  onlySrv: { label: 'Hanya di envman', color: 'orange', icon: TbMinus },
  sync: { label: 'Sama', color: 'teal', icon: TbCheck },
  uncertain: { label: 'Tidak bisa dibanding', color: 'gray', icon: TbShieldLock },
}
