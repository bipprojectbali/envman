export interface PortainerConnection {
  id: string
  name: string
  portainerUrl: string
}

export interface StackTarget {
  id: string
  stackId: number
  stackName: string
  endpointId: number
  label?: string | null
}

export interface PortainerConfig {
  id: string
  portainerUrl?: string | null
  stackId: number
  stackName: string
  endpointId: number
  lastSyncAt: string | null
  lastSyncOk: boolean | null
  connectionId?: string | null
  connectionName?: string | null
  autoSync?: boolean
  additionalTargets?: StackTarget[]
}

export interface ContainerInfo {
  id: string
  shortId: string
  names: string[]
  image: string
  status: string
  state: string
  ports: string[]
}

export interface LogLine {
  stream: 'stdout' | 'stderr'
  timestamp: string | null
  message: string
}

export interface DiffItem {
  key: string
  oldValue: string
  newValue: string
}

export interface DiffResult {
  added: string[]
  removed: string[]
  changed: DiffItem[]
  unchanged: string[]
  totalCurrent: number
  totalProposed: number
}

export const stateColor: Record<string, string> = {
  running: 'teal',
  exited: 'red',
  paused: 'yellow',
  restarting: 'orange',
  dead: 'red',
  created: 'gray',
}

export type ExecContainer = {
  containerId: string
  endpointId: number
  containerName: string
}

export type OpState = {
  type: 'repull' | 'recreate'
  startedAt: number
  step: string
  done: boolean
  error: string | null
}

export function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m} menit lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} jam lalu`
  return `${Math.floor(h / 24)} hari lalu`
}

export const apiFetch = (url: string, opts?: RequestInit) =>
  fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  }).then(async (r) => {
    const body = await r.json()
    if (!r.ok) throw new Error(body.error ?? 'Request failed')
    return body
  })
