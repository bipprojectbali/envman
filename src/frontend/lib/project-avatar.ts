import type { CSSProperties } from 'react'
import type { IconType } from 'react-icons'
import {
  TbApi,
  TbBolt,
  TbBox,
  TbBrandDocker,
  TbBrandGithub,
  TbBrandNodejs,
  TbBrandReact,
  TbChartBar,
  TbCloud,
  TbCode,
  TbCpu,
  TbDatabase,
  TbDeviceDesktop,
  TbDeviceMobile,
  TbFlame,
  TbFolder,
  TbFolders,
  TbGlobe,
  TbHeart,
  TbKey,
  TbMail,
  TbMessage,
  TbNetwork,
  TbPackage,
  TbPlugConnected,
  TbRocket,
  TbServer,
  TbServer2,
  TbSettings,
  TbShield,
  TbShieldLock,
  TbShoppingCart,
  TbStar,
  TbTerminal2,
  TbWorld,
} from 'react-icons/tb'
import { PROJECT_ICON_NAMES, type ProjectIconName } from '@/lib/project-avatar'

// Registry nama Tabler → komponen. Kunci selaras PROJECT_ICON_NAMES (backend-safe list).
export const PROJECT_ICONS: Record<ProjectIconName, IconType> = {
  TbFolder,
  TbFolders,
  TbCloud,
  TbServer,
  TbServer2,
  TbDatabase,
  TbApi,
  TbCode,
  TbTerminal2,
  TbBox,
  TbPackage,
  TbRocket,
  TbWorld,
  TbGlobe,
  TbShield,
  TbShieldLock,
  TbKey,
  TbBolt,
  TbFlame,
  TbBrandDocker,
  TbBrandGithub,
  TbBrandReact,
  TbBrandNodejs,
  TbDeviceDesktop,
  TbDeviceMobile,
  TbCpu,
  TbNetwork,
  TbPlugConnected,
  TbShoppingCart,
  TbMessage,
  TbMail,
  TbChartBar,
  TbSettings,
  TbHeart,
  TbStar,
}

export { PROJECT_AVATAR_COLORS } from '@/lib/project-avatar'
export { PROJECT_ICON_NAMES }

export function getProjectIcon(name?: string | null): IconType | null {
  if (!name) return null
  return PROJECT_ICONS[name as ProjectIconName] ?? null
}

/**
 * Style tint background card dari nama warna Mantine. Sangat tipis (color-mix
 * ~8% dengan bg) + border senada agar tetap terbaca di dark & light. Null = kosong.
 */
export function cardTintStyle(color?: string | null): CSSProperties {
  if (!color) return {}
  const base = `var(--mantine-color-${color}-light)`
  return {
    background: `color-mix(in srgb, ${base} 55%, var(--mantine-color-body))`,
    borderColor: `color-mix(in srgb, var(--mantine-color-${color}-outline) 45%, transparent)`,
  }
}
