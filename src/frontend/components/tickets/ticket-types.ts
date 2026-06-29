import type { Role } from '@/frontend/hooks/useAuth'

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_QC' | 'REOPENED' | 'CLOSED'
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface TicketUser {
  id: string
  name: string
  email: string
  role: Role
}

export interface TicketListItem {
  id: string
  title: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  route: string | null
  reporter: TicketUser
  assignee: TicketUser | null
  createdAt: string
  updatedAt: string
  _count: { comments: number; evidence: number }
}

export interface TicketComment {
  id: string
  authorTag: string
  body: string
  createdAt: string
  author: TicketUser | null
}

export interface TicketEvidence {
  id: string
  kind: string
  url: string
  note: string | null
  createdAt: string
}

export interface TicketDetail extends Omit<TicketListItem, '_count'> {
  comments: TicketComment[]
  evidence: TicketEvidence[]
}

export const STATUS_COLOR: Record<TicketStatus, string> = {
  OPEN: 'blue',
  IN_PROGRESS: 'violet',
  READY_FOR_QC: 'yellow',
  REOPENED: 'orange',
  CLOSED: 'green',
}

export const PRIORITY_COLOR: Record<TicketPriority, string> = {
  LOW: 'gray',
  MEDIUM: 'blue',
  HIGH: 'orange',
  CRITICAL: 'red',
}

export async function ticketApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}
