import type { Role } from '@/frontend/hooks/useAuth'

export interface Alias {
  id: string
  name: string
  args: string
  description: string | null
  tags: string[]
  createdAt: string
  updatedAt: string
  creator: { id: string; name: string }
  requiresEnvs?: { project: string; env: string }[]
  deniedEnvs?: { project: string; env: string }[]
}

export interface FormState {
  name: string
  args: string
  description: string
  tags: string[]
}

export const emptyForm = (): FormState => ({ name: '', args: '', description: '', tags: [] })

// Role re-exported for convenience (avoid deep import in consumers)
export type { Role }
