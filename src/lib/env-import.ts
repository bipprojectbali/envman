import { getEnvironmentAccess } from './access'
import { decryptSecret } from './crypto'
import { prisma } from './db'

export type ResolvedImportedVar = {
  key: string
  value: string
  isSecret: boolean
  sourceProject: string
  sourceEnv: string
}

export type ResolvedImports = {
  vars: ResolvedImportedVar[]
  deniedImports: { project: string; env: string }[]
}

// Resolve vars yang dipinjam target env dari source env-nya (live-link, 1 level).
// Akses dicek per-caller saat resolve (bukan saat setup): source yang denied → di-skip
// + dicatat di deniedImports (warning eksplisit, tidak silent). Secret di-mask sesuai
// akses caller di SOURCE env (OWNER/EDITOR reveal, VIEWER → '***').
export async function resolveImportedVars(
  callerUserId: string,
  callerRole: string,
  targetEnvId: string,
): Promise<ResolvedImports> {
  const imports = await prisma.envImport.findMany({
    where: { targetEnvId },
    orderBy: { order: 'asc' },
    include: {
      sourceEnv: {
        select: {
          id: true,
          name: true,
          project: { select: { slug: true } },
        },
      },
    },
  })

  const vars: ResolvedImportedVar[] = []
  const deniedImports: { project: string; env: string }[] = []

  for (const imp of imports) {
    const sourceProject = imp.sourceEnv.project.slug
    const sourceEnv = imp.sourceEnv.name
    const access = await getEnvironmentAccess(callerUserId, callerRole, sourceProject, sourceEnv)
    if (!access) {
      deniedImports.push({ project: sourceProject, env: sourceEnv })
      continue
    }
    const canReadSecrets = access === 'OWNER' || access === 'EDITOR'
    const sourceVars = await prisma.envVar.findMany({
      where: { environmentId: imp.sourceEnv.id, isDisabled: false },
      orderBy: { key: 'asc' },
    })
    for (const v of sourceVars) {
      vars.push({
        key: v.key,
        value: v.isSecret ? (canReadSecrets ? decryptSecret(v.value) : '***') : v.value,
        isSecret: v.isSecret,
        sourceProject,
        sourceEnv,
      })
    }
  }

  return { vars, deniedImports }
}

// Cycle detection saat setup: cek apakah menambah link target←source akan membuat siklus.
// Self-import langsung ditolak. Selain itu, telusuri rantai import dari source (source sebagai
// target dari import lain) — kalau menjangkau balik ke target, link ini menutup siklus → tolak.
export async function wouldCreateCycle(targetEnvId: string, sourceEnvId: string): Promise<boolean> {
  if (targetEnvId === sourceEnvId) return true
  const visited = new Set<string>()
  // Mulai dari source: ke arah mana source mengimpor (source sebagai targetEnvId)?
  let frontier = [sourceEnvId]
  while (frontier.length > 0) {
    const links = await prisma.envImport.findMany({
      where: { targetEnvId: { in: frontier } },
      select: { sourceEnvId: true },
    })
    const next: string[] = []
    for (const l of links) {
      if (l.sourceEnvId === targetEnvId) return true
      if (!visited.has(l.sourceEnvId)) {
        visited.add(l.sourceEnvId)
        next.push(l.sourceEnvId)
      }
    }
    frontier = next
  }
  return false
}
