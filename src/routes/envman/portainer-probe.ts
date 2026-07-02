import { Elysia } from 'elysia'
import { getEnvironmentAccess } from '../../lib/access'
import { requireEnvAuth } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'

export const portainerProbeRouter = new Elysia().post('/api/envman/portainer/probe', async ({ request, set }) => {
  const caller = await requireEnvAuth(request)
  if (!caller) {
    set.status = 401
    return { error: 'Unauthorized' }
  }
  const body = await request.json().catch(() => null)
  if (!body?.portainerUrl) {
    set.status = 400
    return { error: 'portainerUrl required' }
  }
  let apiToken = body.apiToken
  if (!apiToken && body.slug && body.envName) {
    // Memakai apiToken TERSIMPAN milik env project → wajib punya akses ke env tsb,
    // jaga agar user tak bisa meminjam kredensial Portainer project orang lain.
    const access = await getEnvironmentAccess(caller.userId, caller.role, body.slug, body.envName)
    if (!access) {
      set.status = 403
      return { error: 'Tidak punya akses ke environment ini' }
    }
    const proj = await prisma.project.findUnique({ where: { slug: body.slug } })
    if (proj) {
      const stored = await prisma.portainerConfig.findUnique({
        where: { projectId_envName: { projectId: proj.id, envName: body.envName } },
      })
      apiToken = stored?.apiToken
    }
  }
  if (!apiToken) {
    set.status = 400
    return { error: 'apiToken required' }
  }
  const url = body.portainerUrl.replace(/\/$/, '')
  try {
    const res = await fetch(`${url}/api/stacks`, { headers: { 'X-API-Key': apiToken } })
    if (!res.ok) {
      set.status = 400
      return { error: `Portainer returned ${res.status}: ${await res.text()}` }
    }
    const stacks = (await res.json()) as any[]
    return { stacks: stacks.map((s) => ({ id: s.Id, name: s.Name, endpointId: s.EndpointId })) }
  } catch (e) {
    set.status = 400
    return { error: `Cannot reach Portainer: ${e instanceof Error ? e.message : String(e)}` }
  }
})
