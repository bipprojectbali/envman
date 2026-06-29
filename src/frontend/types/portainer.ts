export interface LinkedEnv {
  slug: string
  projectName: string
  envName: string
  lastSyncAt: string | null
  lastSyncOk: boolean | null
}

export interface StackInfo {
  id: number
  name: string
  status: number
  type: number
  endpointId: number
  createdAt: string
  updatedAt: string
  linkedEnvs: LinkedEnv[]
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

export interface ContainerStats {
  cpuPercent: number
  memUsageMB: number
  memLimitMB: number
  memPercent: number
  netRxMB: number
  netTxMB: number
}

export const stateColor: Record<string, string> = {
  running: 'teal',
  exited: 'red',
  paused: 'yellow',
  restarting: 'orange',
  dead: 'red',
  created: 'gray',
}

export function fmtBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${Math.round(bytes / 1024 / 1024)} MB`
}

export function relTime(iso: string | null) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m}m lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}j lalu`
  return `${Math.floor(h / 24)}h lalu`
}
