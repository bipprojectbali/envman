export type ProjectRole = 'OWNER' | 'EDITOR' | 'VIEWER'
export type EnvRole = 'inherit' | 'denied' | ProjectRole

export interface Member {
  id: string
  role: ProjectRole
  user: { id: string; name: string; email: string; image?: string | null }
}

export interface AvailableUser {
  id: string
  name: string
  email: string
  image?: string | null
}

export interface AccessMatrix {
  project: { slug: string; name: string }
  environments: { name: string; tags: string[] }[]
  members: AccessMatrixMember[]
}

export interface AccessMatrixMember {
  userId: string
  user: { id: string; name: string; email: string; image?: string | null }
  projectRole: ProjectRole
  envAccess: Record<string, { envRole: EnvRole; effectiveRole: ProjectRole | null }>
}

export type SectionName = 'NOTES' | 'ALIASES' | 'FILES' | 'STORAGE'
export type SectionRole = EnvRole

export interface SectionMatrix {
  project: { slug: string; name: string }
  sections: SectionName[]
  members: SectionMatrixMember[]
}

export interface SectionMatrixMember {
  userId: string
  user: { id: string; name: string; email: string; image?: string | null }
  projectRole: ProjectRole
  sectionAccess: Record<string, { sectionRole: SectionRole; effectiveRole: ProjectRole | null }>
}

export const sectionLabel: Record<SectionName, string> = {
  NOTES: 'Notes',
  ALIASES: 'Aliases',
  FILES: 'Files',
  STORAGE: 'Storage',
}

export const roleColor: Record<ProjectRole, string> = {
  OWNER: 'blue',
  EDITOR: 'teal',
  VIEWER: 'gray',
}

export const roleOptions: { value: ProjectRole; label: string }[] = [
  { value: 'OWNER', label: 'Owner' },
  { value: 'EDITOR', label: 'Editor' },
  { value: 'VIEWER', label: 'Viewer' },
]

export const envRoleOptions: { value: EnvRole; label: string }[] = [
  { value: 'inherit', label: 'Inherit' },
  { value: 'OWNER', label: 'Owner' },
  { value: 'EDITOR', label: 'Editor' },
  { value: 'VIEWER', label: 'Viewer' },
  { value: 'denied', label: 'Denied' },
]

export const effectiveColor: Record<string, string> = {
  OWNER: 'blue',
  EDITOR: 'teal',
  VIEWER: 'gray',
  DENIED: 'red',
}

export function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}
