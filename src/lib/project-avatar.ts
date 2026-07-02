// Daftar valid icon & warna avatar project — backend-safe (tanpa react).
// Single source of truth: di-import backend (validasi PATCH) & frontend (registry).
// Frontend memetakan nama icon → komponen react-icons di project-avatar.ts (FE).

// Nama Tabler icon yang diizinkan untuk avatar project. Kurasi ~30 icon umum.
export const PROJECT_ICON_NAMES = [
  'TbFolder',
  'TbFolders',
  'TbCloud',
  'TbServer',
  'TbServer2',
  'TbDatabase',
  'TbApi',
  'TbCode',
  'TbTerminal2',
  'TbBox',
  'TbPackage',
  'TbRocket',
  'TbWorld',
  'TbGlobe',
  'TbShield',
  'TbShieldLock',
  'TbKey',
  'TbBolt',
  'TbFlame',
  'TbBrandDocker',
  'TbBrandGithub',
  'TbBrandReact',
  'TbBrandNodejs',
  'TbDeviceDesktop',
  'TbDeviceMobile',
  'TbCpu',
  'TbNetwork',
  'TbPlugConnected',
  'TbShoppingCart',
  'TbMessage',
  'TbMail',
  'TbChartBar',
  'TbSettings',
  'TbHeart',
  'TbStar',
] as const

export type ProjectIconName = (typeof PROJECT_ICON_NAMES)[number]

// Palet warna Mantine untuk background avatar. Selaras dengan TAG_COLORS FE.
export const PROJECT_AVATAR_COLORS = [
  'red',
  'pink',
  'grape',
  'violet',
  'indigo',
  'blue',
  'cyan',
  'teal',
  'green',
  'lime',
  'yellow',
  'orange',
] as const

export type ProjectAvatarColor = (typeof PROJECT_AVATAR_COLORS)[number]

export function isValidProjectIcon(v: unknown): v is ProjectIconName {
  return typeof v === 'string' && (PROJECT_ICON_NAMES as readonly string[]).includes(v)
}

export function isValidProjectColor(v: unknown): v is ProjectAvatarColor {
  return typeof v === 'string' && (PROJECT_AVATAR_COLORS as readonly string[]).includes(v)
}
