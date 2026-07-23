export const CAPABILITIES = [
  // Create capabilities
  'project:create',
  'gist:create',
  'token:create',
  // Sidebar menu visibility
  'menu:overview',
  'menu:tokens',
  'menu:connections',
  'menu:gists',
  // Portainer granular
  'connection:view',
  'connection:manage', // create/edit/delete connection (dulu SUPER_ADMIN-only)
  'stack:operate', // read: view/logs/status/stats/dangling (TANPA exec)
  'stack:exec', // exec masuk container — setara shell, dipisah dari operate
  'stack:sync', // push env vars → stack
  'stack:power', // start/stop/restart container/stack
  'stack:deploy', // repull image / recreate stack / sync-repull
  'stack:mutate', // edit compose file
  'stack:prune',
  'backup:view', // list & download backup
  'backup:manage', // create/delete backup + kelola schedule
] as const

export type Capability = (typeof CAPABILITIES)[number]

export function isValidCapability(value: unknown): value is Capability {
  return typeof value === 'string' && (CAPABILITIES as readonly string[]).includes(value)
}

// SUPER_ADMIN bypass. Lainnya cek permissions array.
export function hasCapability(user: { role: string; permissions: string[] }, cap: Capability): boolean {
  if (user.role === 'SUPER_ADMIN') return true
  return user.permissions.includes(cap)
}
