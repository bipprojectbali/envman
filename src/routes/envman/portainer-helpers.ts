import { appLog } from '../../lib/applog'
import { decryptSecret } from '../../lib/crypto'
import { prisma } from '../../lib/db'
import { injectEnvFileIntoCompose } from '../../lib/portainer'

export async function resolveConn(cfg: {
  connectionId: string | null
  portainerUrl: string | null
  apiToken: string | null
}): Promise<{ url: string; token: string } | null> {
  if (cfg.connectionId) {
    const conn = await prisma.portainerConnection.findUnique({ where: { id: cfg.connectionId } })
    if (!conn) return null
    return { url: conn.portainerUrl.replace(/\/$/, ''), token: conn.apiToken }
  }
  if (!cfg.portainerUrl || !cfg.apiToken) return null
  return { url: cfg.portainerUrl.replace(/\/$/, ''), token: cfg.apiToken }
}

export async function getPortainerCfg(slug: string, envName: string) {
  const project = await prisma.project.findUnique({ where: { slug } })
  if (!project) return null
  return prisma.portainerConfig.findUnique({ where: { projectId_envName: { projectId: project.id, envName } } })
}

export function escapeEnvValue(val: string): string {
  return val.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

// Hitung ringkasan resource dari payload Docker stats (stream=false). Dipisah agar
// endpoint inspect (env-scoped) & stats (connection-scoped) tak menduplikasi rumus.
export function computeContainerStats(s: any) {
  const cpuDelta = (s.cpu_stats?.cpu_usage?.total_usage ?? 0) - (s.precpu_stats?.cpu_usage?.total_usage ?? 0)
  const systemDelta = (s.cpu_stats?.system_cpu_usage ?? 0) - (s.precpu_stats?.system_cpu_usage ?? 0)
  const numCPUs = s.cpu_stats?.online_cpus ?? s.cpu_stats?.cpu_usage?.percpu_usage?.length ?? 1
  const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * numCPUs * 100 : 0
  const memUsage = s.memory_stats?.usage ?? 0
  const memCache = s.memory_stats?.stats?.cache ?? 0
  const memLimit = s.memory_stats?.limit ?? 0
  const memPercent = memLimit > 0 ? ((memUsage - memCache) / memLimit) * 100 : 0
  return {
    cpuPercent: Math.round(cpuPercent * 10) / 10,
    memUsageMB: Math.round((memUsage - memCache) / 1024 / 1024),
    memLimitMB: Math.round(memLimit / 1024 / 1024),
    memPercent: Math.round(memPercent * 10) / 10,
  }
}

export function parseDockerLogStream(
  buf: Buffer,
  withTimestamps = true,
): { stream: 'stdout' | 'stderr'; timestamp: string | null; message: string }[] {
  const lines: { stream: 'stdout' | 'stderr'; timestamp: string | null; message: string }[] = []
  let offset = 0
  while (offset < buf.length) {
    if (offset + 8 > buf.length) break
    const streamType = buf[offset]
    const size = buf.readUInt32BE(offset + 4)
    offset += 8
    if (offset + size > buf.length) break
    const payload = buf.slice(offset, offset + size).toString('utf8')
    offset += size
    for (const raw of payload.split('\n')) {
      const line = raw.trimEnd()
      if (!line) continue
      let timestamp: string | null = null
      let message = line
      if (withTimestamps) {
        const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s(.*)$/)
        if (tsMatch) {
          timestamp = tsMatch[1]
          message = tsMatch[2]
        }
      }
      lines.push({ stream: streamType === 2 ? 'stderr' : 'stdout', timestamp, message })
    }
  }
  return lines
}

export async function triggerAutoSync(slug: string, envName: string, userId: string) {
  try {
    const project = await prisma.project.findUnique({ where: { slug } })
    if (!project) return
    const cfg = await prisma.portainerConfig.findUnique({
      where: { projectId_envName: { projectId: project.id, envName } },
    })
    if (!cfg?.autoSync) return
    const environment = await prisma.environment.findUnique({
      where: { projectId_name: { projectId: project.id, name: envName } },
      include: { vars: true },
    })
    if (!environment) return
    let portainerUrl: string, portainerToken: string
    if (cfg.connectionId) {
      const conn = await prisma.portainerConnection.findUnique({ where: { id: cfg.connectionId } })
      if (!conn) return
      portainerUrl = conn.portainerUrl
      portainerToken = conn.apiToken
    } else {
      if (!cfg.portainerUrl || !cfg.apiToken) return
      portainerUrl = cfg.portainerUrl
      portainerToken = cfg.apiToken
    }
    const url = portainerUrl.replace(/\/$/, '')
    const startMs = Date.now()
    const fileRes = await fetch(`${url}/api/stacks/${cfg.stackId}/file`, { headers: { 'X-API-Key': portainerToken } })
    if (!fileRes.ok) return
    const { StackFileContent: rawFile } = (await fileRes.json()) as { StackFileContent: string }
    const content = injectEnvFileIntoCompose(rawFile)
    const portainerEnv = environment.vars
      .filter((v) => !v.isDisabled)
      .map((v) => ({
        name: v.key,
        value: escapeEnvValue(v.isSecret ? decryptSecret(v.value) : v.value),
      }))
    const syncRes = await fetch(`${url}/api/stacks/${cfg.stackId}?endpointId=${cfg.endpointId}`, {
      method: 'PUT',
      headers: { 'X-API-Key': portainerToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ StackFileContent: content, Env: portainerEnv, Prune: false }),
    })
    const ok = syncRes.ok
    const durationMs = Date.now() - startMs
    await prisma.portainerConfig.update({ where: { id: cfg.id }, data: { lastSyncAt: new Date(), lastSyncOk: ok } })
    await prisma.portainerSyncLog.create({
      data: {
        configId: cfg.id,
        userId,
        triggeredBy: 'auto',
        varsCount: portainerEnv.length,
        secretCount: environment.vars.filter((v) => v.isSecret && !v.isDisabled).length,
        ok,
        error: ok ? null : `HTTP ${syncRes.status}`,
        durationMs,
      },
    })
    appLog('info', `[auto-sync] ${slug}:${envName} → ${ok ? 'ok' : 'failed'} (${durationMs}ms)`)
  } catch (e) {
    appLog('warn', `[auto-sync] ${slug}:${envName} error: ${e instanceof Error ? e.message : String(e)}`)
  }
}
