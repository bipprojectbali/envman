import { Elysia } from 'elysia'
import { getEnvironmentAccess } from '../../lib/access'
import { requireEnvAuth } from '../../lib/auth-middleware'
import { decryptSecret } from '../../lib/crypto'
import { prisma } from '../../lib/db'
import { injectEnvFileIntoCompose } from '../../lib/portainer'
import { getPortainerCfg, resolveConn } from './portainer-helpers'

export async function syncToStack(
  stackId: number,
  endpointId: number,
  stackUrl: string,
  token: string,
  portainerEnv: { name: string; value: string }[],
): Promise<void> {
  const fr = await fetch(`${stackUrl}/api/stacks/${stackId}/file`, { headers: { 'X-API-Key': token } })
  if (!fr.ok) throw new Error(`Stack file error: ${fr.status}`)
  const { StackFileContent: rawFile } = (await fr.json()) as { StackFileContent: string }
  const content = injectEnvFileIntoCompose(rawFile)
  const syncRes = await fetch(`${stackUrl}/api/stacks/${stackId}?endpointId=${endpointId}`, {
    method: 'PUT',
    headers: { 'X-API-Key': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ StackFileContent: content, Env: portainerEnv, Prune: false }),
  })
  if (!syncRes.ok) throw new Error(`Portainer sync error ${syncRes.status}: ${await syncRes.text()}`)
}

export const syncPreviewRouter = new Elysia()

  .get('/api/envman/projects/:slug/environments/:envName/portainer/history', async ({ request, params, query, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access) { set.status = 403; return { error: 'No access' } }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) { set.status = 404; return { error: 'Project not found' } }
    const cfg = await prisma.portainerConfig.findUnique({
      where: { projectId_envName: { projectId: project.id, envName: params.envName } },
    })
    if (!cfg) return { logs: [] }
    const limit = Math.min(Number((query as any).limit) || 20, 100)
    const logs = await prisma.portainerSyncLog.findMany({
      where: { configId: cfg.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    return { logs }
  })

  .get('/api/envman/projects/:slug/environments/:envName/portainer/status', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access) { set.status = 403; return { error: 'No access' } }
    const cfg = await getPortainerCfg(params.slug, params.envName)
    if (!cfg) { set.status = 404; return { error: 'Portainer not configured' } }
    const conn = await resolveConn(cfg)
    if (!conn) { set.status = 400; return { error: 'Connection not found' } }
    try {
      const stackRes = await fetch(`${conn.url}/api/stacks/${cfg.stackId}`, { headers: { 'X-API-Key': conn.token } })
      if (!stackRes.ok) { set.status = 400; return { error: `Portainer error ${stackRes.status}` } }
      const stack = (await stackRes.json()) as any
      const label = encodeURIComponent(JSON.stringify({ 'com.docker.compose.project': [cfg.stackName] }))
      const cRes = await fetch(
        `${conn.url}/api/endpoints/${cfg.endpointId}/docker/containers/json?all=1&filters=${label}`,
        { headers: { 'X-API-Key': conn.token } },
      )
      const containers = cRes.ok ? ((await cRes.json()) as any[]) : []
      return {
        stack: {
          id: stack.Id,
          name: stack.Name,
          status: stack.Status,
          type: stack.Type,
          endpointId: stack.EndpointId,
          createdAt: stack.CreationDate,
          updatedAt: stack.UpdateDate,
        },
        containers: containers.map((c) => ({
          id: c.Id.slice(0, 12),
          names: c.Names.map((n: string) => n.replace(/^\//, '')),
          image: c.Image,
          status: c.Status,
          state: c.State,
          created: c.Created,
          ports: c.Ports?.map((p: any) => (p.PublicPort ? `${p.PublicPort}:${p.PrivatePort}` : null)).filter(Boolean) ?? [],
        })),
      }
    } catch (e) {
      set.status = 500
      return { error: `Status fetch failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  .post('/api/envman/projects/:slug/environments/:envName/portainer/sync-preview', async ({ request, params, set }) => {
    const caller = await requireEnvAuth(request)
    if (!caller) { set.status = 401; return { error: 'Unauthorized' } }
    const access = await getEnvironmentAccess(caller.userId, caller.role, params.slug, params.envName)
    if (!access || access === 'VIEWER') { set.status = 403; return { error: 'Editor or Owner required' } }
    const cfg = await getPortainerCfg(params.slug, params.envName)
    if (!cfg) { set.status = 404; return { error: 'Portainer not configured' } }
    const conn = await resolveConn(cfg)
    if (!conn) { set.status = 400; return { error: 'Connection not found' } }
    const project = await prisma.project.findUnique({ where: { slug: params.slug } })
    if (!project) { set.status = 404; return { error: 'Project not found' } }
    try {
      const stackRes = await fetch(`${conn.url}/api/stacks/${cfg.stackId}`, { headers: { 'X-API-Key': conn.token } })
      if (!stackRes.ok) { set.status = 400; return { error: `Portainer error ${stackRes.status}` } }
      const stack = (await stackRes.json()) as any
      const currentEnv: Record<string, string> = {}
      for (const e of stack.Env ?? []) currentEnv[e.name] = e.value

      const environment = await prisma.environment.findUnique({
        where: { projectId_name: { projectId: project.id, name: params.envName } },
        include: { vars: true },
      })
      if (!environment) { set.status = 404; return { error: 'Environment not found' } }

      const proposed: Record<string, string> = {}
      for (const v of environment.vars.filter((v) => !v.isDisabled)) {
        proposed[v.key] = v.isSecret ? '***' : v.value
      }

      const allKeys = new Set([...Object.keys(currentEnv), ...Object.keys(proposed)])
      const added: string[] = [], removed: string[] = [], unchanged: string[] = []
      const changed: { key: string; oldValue: string; newValue: string }[] = []
      for (const key of allKeys) {
        if (!(key in currentEnv)) added.push(key)
        else if (!(key in proposed)) removed.push(key)
        else if (currentEnv[key] !== proposed[key] && proposed[key] !== '***') changed.push({ key, oldValue: currentEnv[key], newValue: proposed[key] })
        else unchanged.push(key)
      }
      return {
        current: currentEnv,
        proposed,
        diff: { added, removed, changed, unchanged, totalCurrent: Object.keys(currentEnv).length, totalProposed: Object.keys(proposed).length },
      }
    } catch (e) {
      set.status = 500
      return { error: `Preview failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  })
