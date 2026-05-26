export type ProjectRole = 'OWNER' | 'EDITOR' | 'VIEWER'
export type GlobalRole = 'USER' | 'QC' | 'ADMIN' | 'SUPER_ADMIN'

export interface UserSummary {
  id: string
  name: string
  email: string
  role: GlobalRole
  blocked: boolean
  permissions: string[]
  createdAt: string
  projectCount: number
  envOverrideCount: number
}

export interface UserDetail {
  id: string
  name: string
  email: string
  role: GlobalRole
  blocked: boolean
  permissions: string[]
}

export interface UserAccess {
  user: UserDetail
  projects: ProjectAccess[]
}

export interface ProjectAccess {
  slug: string
  name: string
  projectRole: ProjectRole | null
  environments: EnvAccess[]
}

export type EnvRoleValue = 'inherit' | 'denied' | ProjectRole

export interface EnvAccess {
  name: string
  envRole: EnvRoleValue
  effectiveRole: ProjectRole | null
}

export const ROLE_COLOR: Record<ProjectRole, string> = {
  OWNER: 'blue',
  EDITOR: 'teal',
  VIEWER: 'gray',
}

export const GLOBAL_ROLE_COLOR: Record<GlobalRole, string> = {
  SUPER_ADMIN: 'red',
  ADMIN: 'violet',
  QC: 'orange',
  USER: 'gray',
}
