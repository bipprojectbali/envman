export const CAPABILITIES = [
  // Create capabilities
  'project:create',
  'ticket:create',
  'gist:create',
  'token:create',
  'note:create',
  // Sidebar menu visibility
  'menu:overview',
  'menu:tokens',
  'menu:connections',
  'menu:gists',
  // Portainer granular
  'connection:view',
  'stack:operate',
  'stack:mutate',
  'stack:prune',
] as const

export type Capability = typeof CAPABILITIES[number]

export function isValidCapability(value: unknown): value is Capability {
  return typeof value === 'string' && (CAPABILITIES as readonly string[]).includes(value)
}

// SUPER_ADMIN bypass. Lainnya cek permissions array.
export function hasCapability(
  user: { role: string; permissions: string[] },
  cap: Capability,
): boolean {
  if (user.role === 'SUPER_ADMIN') return true
  return user.permissions.includes(cap)
}
