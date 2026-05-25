import type { Role } from '@/frontend/hooks/useAuth'

export interface AdminUser {
  id: string
  name: string
  email: string
  role: Role
  blocked: boolean
  createdAt: string
}

export interface AppLogEntry {
  id: number
  level: 'info' | 'warn' | 'error'
  message: string
  detail?: string
  timestamp: string
}

export interface AuditLogEntry {
  id: string
  userId: string | null
  action: string
  detail: string | null
  ip: string | null
  createdAt: string
  user: { name: string; email: string } | null
}

export interface SchemaModel {
  name: string
  fields: SchemaField[]
  relations?: SchemaRelation[]
  dbName?: string
}

export interface SchemaField {
  name: string
  type: string
  kind: string
  isId: boolean
  isUnique: boolean
  isRequired: boolean
  default: string | null
  relationField: boolean
  relationName: string | null
  documentation: string | null
}

export interface SchemaRelation {
  name: string
  type: string
  from: string
  to: string
  fields: string[]
  references: string[]
}

export interface SchemaEnum {
  name: string
  values: string[]
  dbName?: string
}

export interface ApiRoute {
  method: string
  path: string
  auth: string
  category: string
  description: string
}

export interface ProjectFileNode {
  path: string
  lines: number
  exports: string[]
  imports: string[]
}

export interface EnvVarEntry {
  key: string
  defaultValue: string | null
  required: boolean
  set: boolean
  consumingFiles: string[]
}

export interface TestCoverageEntry {
  sourceFile: string
  sourceLines: number
  testFile: string | null
  testLines: number | null
  coverage: number
}

export interface DependenciesEntry {
  name: string
  version: string
  type: 'dependencies' | 'devDependencies'
  importingFiles: string[]
}

export interface MigrationEntry {
  name: string
  createdAt: string
  sql: string
}

export interface AppSession {
  id: string
  token: string
  userId: string
  userName: string
  userEmail: string
  userRole: string
  isOnline: boolean
  expiresAt: string
  createdAt: string
}

export interface LiveRequestEntry {
  path: string
  method: string
  hits: number
  avgMs: number
}
